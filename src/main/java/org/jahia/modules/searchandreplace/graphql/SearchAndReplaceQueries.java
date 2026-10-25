package org.jahia.modules.searchandreplace.graphql;

import graphql.annotations.annotationTypes.GraphQLDescription;
import graphql.annotations.annotationTypes.GraphQLField;
import graphql.annotations.annotationTypes.GraphQLName;
import graphql.annotations.annotationTypes.GraphQLNonNull;
import org.apache.commons.lang.StringEscapeUtils;
import org.apache.commons.lang.StringUtils;
import org.jahia.modules.searchandreplace.graphql.model.*;
import org.jahia.modules.searchandreplace.service.ReplaceEngine;
import org.jahia.modules.searchandreplace.service.ReplaceScope;
import org.jahia.modules.searchandreplace.service.TextFields;
import org.jahia.modules.searchandreplace.service.TextReplacer;
import org.jahia.services.content.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.jcr.*;
import javax.jcr.nodetype.NoSuchNodeTypeException;
import javax.jcr.nodetype.NodeType;
import javax.jcr.nodetype.PropertyDefinition;
import javax.jcr.query.Query;
import javax.jcr.query.QueryManager;
import javax.jcr.query.QueryResult;
import javax.jcr.query.qom.*;
import java.text.Normalizer;
import java.text.SimpleDateFormat;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.*;
import java.util.regex.Pattern;

/**
 * Read-only search and replace fields, exposed under {@code Query.searchAndReplace}.
 * <p>
 * Every field runs with the calling user's session ({@link SiteAccess}): the search only returns
 * nodes the user can read, and the fields that take a site key require the {@code searchAndReplace}
 * permission on that site. Nothing here writes; the write is {@link SearchAndReplaceMutations}.
 */
@GraphQLName("SearchAndReplaceQueries")
@GraphQLDescription("Search and replace read operations")
public class SearchAndReplaceQueries {

    private static final Logger logger = LoggerFactory.getLogger(SearchAndReplaceQueries.class);
    private static final SimpleDateFormat ISO_DATE_FORMAT = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss");
    private static final SimpleDateFormat DATE_FILTER_FORMAT = new SimpleDateFormat("yyyy-MM-dd");
    private static final int MAX_SCAN_CANDIDATES = 250000;
    private static final Pattern DIACRITICS_PATTERN = Pattern.compile("\\p{M}+");
    private static final DateTimeFormatter DAY_MONTH_YEAR_SLASH_FORMAT = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private static final DateTimeFormatter DAY_MONTH_YEAR_DASH_FORMAT = DateTimeFormatter.ofPattern("dd-MM-yyyy");
    private static final DateTimeFormatter MONTH_DAY_YEAR_SLASH_FORMAT = DateTimeFormatter.ofPattern("MM/dd/yyyy");

    @GraphQLField
    @GraphQLDescription("Search for nodes containing a specific term, through the full-text index. "
            + "Returns at most `limit` rows (default 200, maximum 1000) after skipping `offset` rows; `truncated` "
            + "tells that more rows exist. `deepSearch` also scans every node of the site when the index finds "
            + "nothing (finds parts of words, slow on large sites). Requires the searchAndReplace permission on the site.")
    public GqlSearchNodesResult searchNodes(
            @GraphQLName("termToSearch") @GraphQLNonNull String termToSearch,
            @GraphQLName("siteKey") @GraphQLNonNull String siteKey,
            @GraphQLName("language") @GraphQLNonNull String language,
            @GraphQLName("filters") GqlSearchFiltersInput filters,
            @GraphQLName("limit") Integer limit,
            @GraphQLName("offset") Integer offset,
            @GraphQLName("deepSearch") Boolean deepSearch
    ) throws RepositoryException {
        String normalizedSearchTerm = InputValidation.normalizeSearchTerm(termToSearch);
        String validatedSiteKey = InputValidation.validateSiteKey(siteKey);
        String normalizedLanguage = InputValidation.normalizeLanguage(language);
        GqlSearchFiltersInput safeFilters = InputValidation.sanitizeFilters(filters);
        int maxResults = InputValidation.resolveLimit(limit);
        int skip = offset != null && offset > 0 ? offset : 0;

        JCRSessionWrapper session = SiteAccess.openEditSession(normalizedLanguage);
        SiteAccess.requirePermission(session, validatedSiteKey);

        if (StringUtils.isBlank(normalizedSearchTerm)) {
            return new GqlSearchNodesResult(new ArrayList<>(), 0, false);
        }

        QueryManager qm = session.getWorkspace().getQueryManager();
        Query indexedQuery = buildSearchQuery(qm, session.getValueFactory(), normalizedSearchTerm, validatedSiteKey, safeFilters, true);

        QueryResult queryResult;
        try {
            logger.debug("Executing indexed search query: {}", indexedQuery.getStatement());
            queryResult = indexedQuery.execute();
        } catch (RepositoryException e) {
            logger.error("Search query failed for siteKey={} term='{}': {}", validatedSiteKey, normalizedSearchTerm, e.getMessage(), e);
            throw e;
        }

        List<GqlSearchResultNode> resultNodes = new ArrayList<>();
        Set<String> processedNodeIds = new HashSet<>();
        int[] counters = {0, 0, skip};
        boolean truncated = collectResults(session, queryResult.getNodes(), normalizedSearchTerm, safeFilters,
                normalizedLanguage, maxResults, resultNodes, processedNodeIds, counters);

        // The scan reads every node of the site: only on request, and only when the index found nothing.
        if (resultNodes.isEmpty() && processedNodeIds.isEmpty() && Boolean.TRUE.equals(deepSearch)) {
            Query fallbackQuery = buildSearchQuery(qm, session.getValueFactory(), normalizedSearchTerm, validatedSiteKey, safeFilters, false);
            QueryResult fallbackResult;
            try {
                logger.debug("Indexed query returned no results, running fallback scan query: {}", fallbackQuery.getStatement());
                fallbackResult = fallbackQuery.execute();
            } catch (RepositoryException e) {
                logger.error("Fallback scan query failed for siteKey={} term='{}': {}", validatedSiteKey, normalizedSearchTerm, e.getMessage(), e);
                throw e;
            }
            truncated = collectResults(session, fallbackResult.getNodes(), normalizedSearchTerm, safeFilters,
                    normalizedLanguage, maxResults, resultNodes, processedNodeIds, counters) || truncated;
        }

        GqlSearchNodesResult result = new GqlSearchNodesResult();
        result.setNodes(resultNodes);
        result.setTotalCount(counters[0]);
        result.setTruncated(truncated);
        return result;
    }

    @GraphQLField
    @GraphQLDescription("Get available node types for filtering. Requires the searchAndReplace permission on the site.")
    public List<GqlNodeTypeInfo> getNodeTypes(@GraphQLName("siteKey") @GraphQLNonNull String siteKey) throws RepositoryException {
        String validatedSiteKey = InputValidation.validateSiteKey(siteKey);
        JCRSessionWrapper session = SiteAccess.openEditSession("en");
        SiteAccess.requirePermission(session, validatedSiteKey);

        List<GqlNodeTypeInfo> nodeTypes = new ArrayList<>();
        String[] commonTypes = {
            "jnt:page", "jnt:contentFolder", "jnt:folder", "jnt:file",
            "jnt:text", "jnt:bigText", "jmix:editorialContent"
        };
        for (String typeName : commonTypes) {
            try {
                NodeType nodeType = session.getWorkspace().getNodeTypeManager().getNodeType(typeName);
                nodeTypes.add(new GqlNodeTypeInfo(typeName, nodeType.getName(), null));
            } catch (NoSuchNodeTypeException e) {
                // Skip
            }
        }
        return nodeTypes;
    }

    @GraphQLField
    @GraphQLDescription("Get properties for a specific node type")
    public List<GqlPropertyInfo> getNodeTypeProperties(@GraphQLName("nodeType") @GraphQLNonNull String nodeType) throws RepositoryException {
        String safeNodeType = StringUtils.trimToNull(nodeType);
        if (safeNodeType == null || !InputValidation.NODE_TYPE_PATTERN.matcher(safeNodeType).matches()) {
            throw InputValidation.invalid("Invalid node type");
        }

        JCRSessionWrapper session = SiteAccess.openEditSession("en");
        List<GqlPropertyInfo> properties = new ArrayList<>();
        try {
            NodeType nt = session.getWorkspace().getNodeTypeManager().getNodeType(safeNodeType);
            for (PropertyDefinition propDef : nt.getPropertyDefinitions()) {
                String propName = propDef.getName();
                if (!propName.startsWith("jcr:") && !propName.startsWith("j:")) {
                    properties.add(new GqlPropertyInfo(propName, propName, propDef.getRequiredType() + ""));
                }
            }
        } catch (NoSuchNodeTypeException e) {
            logger.warn("Node type not found: {}", safeNodeType);
        }
        return properties;
    }

    @GraphQLField
    @GraphQLDescription("Preview, without writing, every property that replaceInNodes would change for each selected node. "
            + "Same arguments and rules as replaceInNodes; one preview per node, with an error instead of changes when the "
            + "node cannot be read. Requires the searchAndReplace permission on the site.")
    public List<GqlReplacePreview> previewReplace(
            @GraphQLName("siteKey") @GraphQLNonNull String siteKey,
            @GraphQLName("nodeUuids") @GraphQLNonNull List<String> nodeUuids,
            @GraphQLName("termToReplace") @GraphQLNonNull String termToReplace,
            @GraphQLName("replacementTerm") @GraphQLNonNull String replacementTerm,
            @GraphQLName("language") @GraphQLNonNull String language,
            @GraphQLName("propertiesToReplace") List<String> propertiesToReplace,
            @GraphQLName("searchMode") GqlSearchMode searchMode
    ) throws RepositoryException {
        String validatedSiteKey = InputValidation.validateSiteKey(siteKey);
        String normalizedLanguage = InputValidation.normalizeLanguage(language);
        String normalizedTerm = InputValidation.normalizeSearchTerm(termToReplace);
        if (normalizedTerm.isEmpty()) {
            throw InputValidation.invalid("termToReplace is required");
        }
        if (nodeUuids.size() > InputValidation.MAX_NODES_PER_REPLACE) {
            throw InputValidation.invalid("At most " + InputValidation.MAX_NODES_PER_REPLACE + " nodes per call");
        }
        ReplaceEngine.Request request = new ReplaceEngine.Request(normalizedTerm, replacementTerm,
                InputValidation.toMode(searchMode, normalizedTerm), InputValidation.sanitizePropertyNames(propertiesToReplace));

        JCRSessionWrapper session = SiteAccess.openEditSession(normalizedLanguage);
        SiteAccess.requirePermission(session, validatedSiteKey);

        List<GqlReplacePreview> previews = new ArrayList<>();
        for (String uuid : nodeUuids) {
            GqlReplacePreview preview = new GqlReplacePreview();
            preview.setNodeUuid(uuid);
            preview.setPropertyPreviews(new ArrayList<>());
            try {
                JCRNodeWrapper node = SearchAndReplaceMutations.getNodeInSite(session, uuid, validatedSiteKey);
                preview.setNodePath(node.getPath());
                for (ReplaceEngine.Change change : ReplaceEngine.apply(node, request, false)) {
                    String relativePath = change.getNodePath().substring(node.getPath().length());
                    String label = StringUtils.removeStart(relativePath + "/" + change.getPropertyName(), "/");
                    preview.getPropertyPreviews().add(new GqlPropertyPreview(change.getPropertyName(),
                            change.getOldValue(), change.getNewValue(), label));
                }
            } catch (RepositoryException | RuntimeException e) {
                preview.setError(e.getMessage());
            }
            previews.add(preview);
        }
        return previews;
    }

    // Helper methods

    /**
     * Turns query hits into result rows until the limit; returns whether hits were left over.
     * {@code counters[0]} counts returned rows, {@code counters[1]} scanned candidates,
     * {@code counters[2]} rows still to skip for the offset.
     */
    private boolean collectResults(JCRSessionWrapper session, NodeIterator nodes, String searchTerm,
                                   GqlSearchFiltersInput filters, String language, int maxResults,
                                   List<GqlSearchResultNode> resultNodes, Set<String> processedNodeIds,
                                   int[] counters) throws RepositoryException {
        while (nodes.hasNext() && counters[0] < maxResults && counters[1] < MAX_SCAN_CANDIDATES) {
            Node node = nodes.nextNode();
            counters[1]++;
            JCRNodeWrapper wrapper = session.getNodeByIdentifier(node.getIdentifier());
            JCRNodeWrapper searchableNode = resolveSearchableNode(wrapper);
            if (searchableNode == null || processedNodeIds.contains(searchableNode.getIdentifier())) {
                continue;
            }

            GqlSearchResultNode resultNode = createSearchResultNode(searchableNode, searchTerm, filters, language);
            if (resultNode != null) {
                processedNodeIds.add(searchableNode.getIdentifier());
                if (counters[2] > 0) {
                    counters[2]--;
                    continue;
                }
                resultNodes.add(resultNode);
                counters[0]++;
            }
        }
        return nodes.hasNext() || counters[1] >= MAX_SCAN_CANDIDATES;
    }

    private Query buildSearchQuery(QueryManager queryManager, ValueFactory valueFactory, String termToSearch,
                                   String siteKey, GqlSearchFiltersInput filters, boolean withFullText) throws RepositoryException {
        QueryObjectModelFactory qom = queryManager.getQOMFactory();
        String selectorType = "nt:base";
        if (filters != null && StringUtils.isNotBlank(filters.getNodeType())) {
            selectorType = filters.getNodeType();
        }
        Selector selector = qom.selector(selectorType, "s");

        Constraint constraint = qom.descendantNode("s", "/sites/" + siteKey);
        if (withFullText) {
            // Use QOM fullTextSearch with null property to search across all indexed properties.
            String fullTextExpression = buildFullTextSearchExpression(termToSearch);
            constraint = qom.and(constraint, qom.fullTextSearch("s", null, qom.literal(valueFactory.createValue(fullTextExpression))));
        }

        return qom.createQuery(selector, constraint, null, null);
    }

    private String buildFullTextSearchExpression(String rawTerm) {
        String normalized = rawTerm == null ? "" : rawTerm.trim();
        // Wrap user term in quotes and escape special characters to avoid query parser errors.
        String escapedRaw = normalized.replace("\\", "\\\\").replace("\"", "\\\"");
        String folded = stripDiacritics(normalized);
        String escapedFolded = folded.replace("\\", "\\\\").replace("\"", "\\\"");

        if (!escapedFolded.equalsIgnoreCase(escapedRaw) && !escapedFolded.isEmpty()) {
            return "\"" + escapedRaw + "\" OR \"" + escapedFolded + "\"";
        }

        return "\"" + escapedRaw + "\"";
    }

    private GqlSearchResultNode createSearchResultNode(JCRNodeWrapper node, String searchTerm,
                                                       GqlSearchFiltersInput filters, String language) {
        try {
            if (node.getName() != null && node.getName().startsWith("j:translation_")) {
                return null;
            }

            if (filters != null && StringUtils.isNotBlank(filters.getNodeType()) && !node.isNodeType(filters.getNodeType())) {
                return null;
            }

            if (!matchesDateFilters(node, filters, language)) {
                return null;
            }

            GqlSearchResultNode resultNode = new GqlSearchResultNode();
            resultNode.setUuid(node.getIdentifier());
            resultNode.setPath(node.getPath());
            resultNode.setName(node.getName());
            resultNode.setDisplayName(resolveDisplayName(node, language));
            resultNode.setNodeType(node.getPrimaryNodeTypeName());
            resultNode.setNodeTypeLabel(node.getPrimaryNodeType().getLabel(node.getSession().getLocale()));

            JCRNodeWrapper translationNode = getTranslationNode(node, language);
            resultNode.setCreated(formatDate(resolveNodeDate(node, translationNode, "jcr:created")));
            resultNode.setLastModified(formatDate(resolveNodeDate(node, translationNode, "jcr:lastModified")));
            resultNode.setParentPath(node.getParent().getPath());
            resultNode.setParentContainerPath(findParentContainerPath(node));

            List<String> propertyFilter = filters != null ? filters.getProperties() : null;
            List<GqlPropertyMatch> matches = new ArrayList<>();
            collectMatchingPropertiesInScope(node, searchTerm, propertyFilter, language, "", matches);
            List<GqlPropertyMatch> matchingProperties = dedupeMatches(matches);
            if (matchingProperties.isEmpty()) {
                return null;
            }
            resultNode.setMatchingProperties(matchingProperties);
            return resultNode;

        } catch (RepositoryException e) {
            logger.error("Error creating search result node", e);
            return null;
        }
    }

    /**
     * Collects the matching properties of a node, its translation node and its descendants within
     * {@link ReplaceScope}, the same scope a replacement covers.
     */
    private void collectMatchingPropertiesInScope(JCRNodeWrapper currentNode,
                                                  String searchTerm,
                                                  List<String> propertyFilter,
                                                  String language,
                                                  String nodePathPrefix,
                                                  List<GqlPropertyMatch> matches) throws RepositoryException {
        String prefix = StringUtils.isBlank(nodePathPrefix) ? "" : nodePathPrefix + "/";

        JCRNodeWrapper translationNode = getTranslationNode(currentNode, language);
        if (translationNode != null) {
            matches.addAll(collectMatchingProperties(translationNode, currentNode, searchTerm, propertyFilter, prefix));
        }
        matches.addAll(collectMatchingProperties(currentNode, currentNode, searchTerm, propertyFilter, prefix));

        if (!ReplaceScope.coversChildrenOf(currentNode)) {
            return;
        }
        NodeIterator children = currentNode.getNodes();
        while (children.hasNext()) {
            JCRNodeWrapper child = toNodeWrapper(currentNode, children.nextNode());
            if (child == null || ReplaceScope.isOutside(child)) {
                continue;
            }
            collectMatchingPropertiesInScope(child, searchTerm, propertyFilter, language, prefix + child.getName(), matches);
        }
    }

    /**
     * Lists the string properties of {@code sourceNode} that contain the term. A match is replaceable
     * when the property is a text field of {@code ownerNode} ({@link TextFields}); for a translation
     * node, the owner is the translated node.
     */
    private List<GqlPropertyMatch> collectMatchingProperties(JCRNodeWrapper sourceNode,
                                                             JCRNodeWrapper ownerNode,
                                                             String searchTerm,
                                                             List<String> propertyFilter,
                                                             String propertyPrefix) {
        List<GqlPropertyMatch> matches = new ArrayList<>();

        try {
            PropertyIterator properties = sourceNode.getProperties();
            while (properties.hasNext()) {
                Property property = properties.nextProperty();
                String propName = property.getName();

                if (propertyFilter != null && !propertyFilter.contains(propName)) {
                    continue;
                }
                if (property.getType() != PropertyType.STRING) {
                    continue;
                }

                TextFields.Kind kind = TextFields.kindOf(ownerNode, propName);
                String label = propertyPrefix + propName;

                if (property.isMultiple()) {
                    for (Value value : property.getValues()) {
                        String raw = value != null ? value.getString() : null;
                        if (containsIgnoreCase(raw, searchTerm)) {
                            matches.add(new GqlPropertyMatch(propName, raw, label, notReplaceableReason(raw, searchTerm, kind)));
                        }
                    }
                    continue;
                }

                String raw = property.getString();
                if (containsIgnoreCase(raw, searchTerm)) {
                    matches.add(new GqlPropertyMatch(propName, raw, label, notReplaceableReason(raw, searchTerm, kind)));
                }
            }
        } catch (RepositoryException e) {
            logger.debug("Unable to inspect matching properties on node {}", sourceNode, e);
        }

        return matches;
    }

    /**
     * Tells why the replacement the UI runs (case-insensitive, text only) would not change the value,
     * or {@code null} when it would. Search also finds a term written with other accents or split by
     * markup ("Caf&eacute;", "Ac&lt;em&gt;me"); such a match is shown but is not replaceable.
     */
    private GqlNotReplaceableReason notReplaceableReason(String value, String searchTerm, TextFields.Kind kind) {
        if (kind == null) {
            return GqlNotReplaceableReason.NOT_A_TEXT_FIELD;
        }
        if (value == null || value.equals(TextReplacer.replace(value, searchTerm, "\u0000", TextReplacer.Mode.CASE_INSENSITIVE, kind))) {
            return GqlNotReplaceableReason.DIFFERENT_SPELLING;
        }
        return null;
    }

    private boolean containsIgnoreCase(String value, String searchTerm) {
        if (value == null || searchTerm == null) {
            return false;
        }

        String valueLower = value.toLowerCase(Locale.ROOT);
        String normalizedValue = normalizeTextForSearch(valueLower);
        String termLower = searchTerm.toLowerCase(Locale.ROOT);
        String normalizedTerm = normalizeTextForSearch(termLower);

        if (valueLower.contains(termLower)) {
            return true;
        }
        if (stripDiacritics(valueLower).contains(stripDiacritics(termLower))) {
            return true;
        }
        if (normalizedValue.contains(normalizedTerm)) {
            return true;
        }
        return stripDiacritics(normalizedValue).contains(stripDiacritics(normalizedTerm));
    }

    private String stripDiacritics(String value) {
        if (value == null) {
            return "";
        }
        return DIACRITICS_PATTERN.matcher(Normalizer.normalize(value, Normalizer.Form.NFD)).replaceAll("");
    }

    private String normalizeTextForSearch(String value) {
        if (value == null) {
            return "";
        }
        String unescaped = StringEscapeUtils.unescapeHtml(value);
        String withoutTags = unescaped.replaceAll("<[^>]+>", " ");
        return withoutTags.replaceAll("\\s+", " ").trim();
    }

    private JCRNodeWrapper resolveSearchableNode(JCRNodeWrapper hitNode) throws RepositoryException {
        if (hitNode == null) {
            return null;
        }

        JCRNodeWrapper current = hitNode;
        while (current != null) {
            String currentName = current.getName();
            if (currentName != null && currentName.startsWith("j:translation_")) {
                return current.getParent();
            }
            if ("/".equals(current.getPath()) || "/sites".equals(current.getPath())) {
                break;
            }
            current = current.getParent();
        }

        return hitNode;
    }

    private List<GqlPropertyMatch> dedupeMatches(List<GqlPropertyMatch> matches) {
        Map<String, GqlPropertyMatch> unique = new LinkedHashMap<>();
        for (GqlPropertyMatch match : matches) {
            if (match == null) {
                continue;
            }
            unique.putIfAbsent(match.getLabel() + "::" + match.getValue(), match);
        }
        return new ArrayList<>(unique.values());
    }

    private String resolveDisplayName(JCRNodeWrapper node, String language) throws RepositoryException {
        String translatedTitle = getNodeTitle(getTranslationNode(node, language));
        if (StringUtils.isNotBlank(translatedTitle)) {
            return translatedTitle;
        }

        String localTitle = getNodeTitle(node);
        if (StringUtils.isNotBlank(localTitle)) {
            return localTitle;
        }

        String displayableName = StringUtils.trimToNull(node.getDisplayableName());
        return displayableName != null ? displayableName : node.getName();
    }

    private String getNodeTitle(JCRNodeWrapper node) throws RepositoryException {
        if (node == null || !node.hasProperty("jcr:title")) {
            return null;
        }
        return StringUtils.trimToNull(node.getProperty("jcr:title").getString());
    }

    private boolean matchesDateFilters(JCRNodeWrapper node,
                                       GqlSearchFiltersInput filters,
                                       String language) throws RepositoryException {
        if (filters == null) {
            return true;
        }

        Calendar createdAfter = parseDateFilter(filters.getCreatedAfter(), false);
        Calendar createdBefore = parseDateFilter(filters.getCreatedBefore(), true);
        Calendar modifiedAfter = parseDateFilter(filters.getModifiedAfter(), false);
        Calendar modifiedBefore = parseDateFilter(filters.getModifiedBefore(), true);

        if (createdAfter == null && createdBefore == null && modifiedAfter == null && modifiedBefore == null) {
            return true;
        }

        JCRNodeWrapper translationNode = getTranslationNode(node, language);
        Calendar created = resolveNodeDate(node, translationNode, "jcr:created");
        Calendar modified = resolveNodeDate(node, translationNode, "jcr:lastModified");

        if (createdAfter != null && (created == null || created.before(createdAfter))) {
            return false;
        }
        if (createdBefore != null && (created == null || created.after(createdBefore))) {
            return false;
        }
        if (modifiedAfter != null && (modified == null || modified.before(modifiedAfter))) {
            return false;
        }
        return modifiedBefore == null || (modified != null && !modified.after(modifiedBefore));
    }

    private Calendar resolveNodeDate(JCRNodeWrapper node,
                                     JCRNodeWrapper translationNode,
                                     String propertyName) throws RepositoryException {
        if (translationNode != null && translationNode.hasProperty(propertyName)) {
            return translationNode.getProperty(propertyName).getDate();
        }
        if (node != null && node.hasProperty(propertyName)) {
            return node.getProperty(propertyName).getDate();
        }
        return null;
    }

    private JCRNodeWrapper getTranslationNode(JCRNodeWrapper node, String language) throws RepositoryException {
        if (StringUtils.isBlank(language)) {
            return null;
        }
        String translationNodeName = "j:translation_" + language.replace('-', '_');
        if (node.hasNode(translationNodeName)) {
            return node.getNode(translationNodeName);
        }
        String languageOnly = language.split("[-_]")[0];
        if (StringUtils.isNotBlank(languageOnly)) {
            String fallbackTranslationNodeName = "j:translation_" + languageOnly;
            if (node.hasNode(fallbackTranslationNodeName)) {
                return node.getNode(fallbackTranslationNodeName);
            }
        }
        return null;
    }

    private String findParentContainerPath(JCRNodeWrapper node) throws RepositoryException {
        JCRNodeWrapper current = node.getParent();
        while (current != null) {
            if (current.isNodeType("jnt:page") || current.isNodeType("jnt:contentFolder")) {
                return current.getPath();
            }
            if ("/".equals(current.getPath()) || "/sites".equals(current.getPath())) {
                break;
            }
            current = current.getParent();
        }
        return node.getParent() != null ? node.getParent().getPath() : null;
    }

    private JCRNodeWrapper toNodeWrapper(JCRNodeWrapper contextNode, Node node) throws RepositoryException {
        if (node instanceof JCRNodeWrapper) {
            return (JCRNodeWrapper) node;
        }

        Session session = contextNode.getSession();
        if (session instanceof JCRSessionWrapper) {
            return ((JCRSessionWrapper) session).getNodeByIdentifier(node.getIdentifier());
        }

        return null;
    }

    private Calendar parseDateFilter(String dateFilter, boolean endOfDay) {
        if (StringUtils.isBlank(dateFilter)) {
            return null;
        }

        LocalDate localDate = parseToLocalDate(dateFilter.trim());
        if (localDate == null) {
            logger.warn("Invalid date filter format: {}", dateFilter);
            return null;
        }

        ZonedDateTime zonedDateTime = endOfDay ?
                localDate.atTime(23, 59, 59, 999_000_000).atZone(ZoneId.systemDefault()) :
                localDate.atStartOfDay(ZoneId.systemDefault());
        return GregorianCalendar.from(zonedDateTime);
    }

    private LocalDate parseToLocalDate(String rawValue) {
        if (StringUtils.isBlank(rawValue)) {
            return null;
        }

        List<DateTimeFormatter> dateOnlyFormats = Arrays.asList(
                DateTimeFormatter.ISO_LOCAL_DATE,
                DAY_MONTH_YEAR_SLASH_FORMAT,
                DAY_MONTH_YEAR_DASH_FORMAT,
                MONTH_DAY_YEAR_SLASH_FORMAT
        );

        for (DateTimeFormatter formatter : dateOnlyFormats) {
            try {
                return LocalDate.parse(rawValue, formatter);
            } catch (DateTimeParseException e) {
                // Try next parser
            }
        }

        try {
            return OffsetDateTime.parse(rawValue, DateTimeFormatter.ISO_OFFSET_DATE_TIME).toLocalDate();
        } catch (DateTimeParseException e) {
            // Try next parser
        }

        try {
            return ZonedDateTime.parse(rawValue, DateTimeFormatter.ISO_ZONED_DATE_TIME).toLocalDate();
        } catch (DateTimeParseException e) {
            // Try next parser
        }

        try {
            return Instant.parse(rawValue).atZone(ZoneId.systemDefault()).toLocalDate();
        } catch (DateTimeParseException e) {
            // Try next parser
        }

        try {
            return LocalDateTime.parse(rawValue, DateTimeFormatter.ISO_LOCAL_DATE_TIME).toLocalDate();
        } catch (DateTimeParseException e) {
            // Try next parser
        }

        try {
            Date parsedLegacyDate;
            synchronized (DATE_FILTER_FORMAT) {
                parsedLegacyDate = DATE_FILTER_FORMAT.parse(rawValue);
            }
            return parsedLegacyDate.toInstant().atZone(ZoneId.systemDefault()).toLocalDate();
        } catch (Exception e) {
            return null;
        }
    }

    private String formatDate(Calendar calendar) {
        if (calendar == null) {
            return null;
        }
        synchronized (ISO_DATE_FORMAT) {
            return ISO_DATE_FORMAT.format(calendar.getTime());
        }
    }
}
