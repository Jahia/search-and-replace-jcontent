package org.jahia.modules.searchandreplace.graphql;

import graphql.annotations.annotationTypes.GraphQLDescription;
import graphql.annotations.annotationTypes.GraphQLField;
import graphql.annotations.annotationTypes.GraphQLName;
import graphql.annotations.annotationTypes.GraphQLNonNull;
import org.jahia.modules.searchandreplace.graphql.model.GqlReplaceError;
import org.jahia.modules.searchandreplace.graphql.model.GqlReplaceResult;
import org.jahia.modules.searchandreplace.graphql.model.GqlSearchMode;
import org.jahia.modules.searchandreplace.service.ReplaceEngine;
import org.jahia.services.content.JCRNodeWrapper;
import org.jahia.services.content.JCRSessionWrapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.jcr.ItemNotFoundException;
import javax.jcr.RepositoryException;
import java.util.ArrayList;
import java.util.List;

/**
 * Search and replace write operations, exposed under {@code Mutation.searchAndReplace} only.
 * <p>
 * Runs with the calling user's session in the {@code default} workspace and the target language
 * ({@link SiteAccess}): the caller needs the {@code searchAndReplace} permission on the site, and the
 * repository refuses any node the user may not change. For each selected node the replacement covers
 * the node and its content down to the next page, main resource or folder, and only its text fields
 * ({@link ReplaceEngine}). Each node is saved on its own: a node that fails (missing right, lock,
 * regular expression timeout) is reported and its partial changes discarded, and the others are kept.
 * At most {@value InputValidation#MAX_NODES_PER_REPLACE} nodes per call. Nothing is published.
 */
@GraphQLName("SearchAndReplaceMutations")
@GraphQLDescription("Search and replace write operations")
public class SearchAndReplaceMutations {

    private static final Logger logger = LoggerFactory.getLogger(SearchAndReplaceMutations.class);

    @GraphQLField
    @GraphQLDescription("Replace text in the text fields of the selected nodes and of their content (sub-pages excluded). "
            + "propertiesToReplace limits the change to these property names; null means every text field. "
            + "Each node is saved on its own; at most 200 nodes per call. "
            + "Requires the searchAndReplace permission on the site.")
    public GqlReplaceResult replaceInNodes(
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
        ReplaceEngine.Request request = new ReplaceEngine.Request(normalizedTerm, replacementTerm,
                InputValidation.toMode(searchMode, normalizedTerm), InputValidation.sanitizePropertyNames(propertiesToReplace));

        if (nodeUuids != null && nodeUuids.size() > InputValidation.MAX_NODES_PER_REPLACE) {
            throw InputValidation.invalid("At most " + InputValidation.MAX_NODES_PER_REPLACE + " nodes per call");
        }

        JCRSessionWrapper session = SiteAccess.openEditSession(normalizedLanguage);
        SiteAccess.requirePermission(session, validatedSiteKey);

        GqlReplaceResult result = new GqlReplaceResult();
        result.setSuccessfulNodes(new ArrayList<>());
        result.setFailedNodes(new ArrayList<>());
        result.setTotalPropertiesUpdated(0);
        result.setErrors(new ArrayList<>());

        if (nodeUuids == null || nodeUuids.isEmpty() || normalizedTerm.isEmpty()) {
            return result;
        }

        for (String uuid : nodeUuids) {
            String path = null;
            try {
                JCRNodeWrapper node = getNodeInSite(session, uuid, validatedSiteKey);
                path = node.getPath();
                int propsUpdated = ReplaceEngine.apply(node, request, true).size();
                if (propsUpdated > 0) {
                    session.save();
                    result.getSuccessfulNodes().add(uuid);
                    result.setTotalPropertiesUpdated(result.getTotalPropertiesUpdated() + propsUpdated);
                } else {
                    result.getUnchangedNodes().add(uuid);
                }
            } catch (RepositoryException | RuntimeException e) {
                discardChanges(session);
                result.getFailedNodes().add(uuid);
                result.getErrors().add(new GqlReplaceError(uuid, e.getMessage(), path));
                logger.warn("Search and replace refused or failed on node {}: {}", uuid, e.getMessage());
                logger.debug("Search and replace failure on node {}", uuid, e);
            }
        }

        logger.info("Search and replace by {} on site {} ({}): {} node(s) updated, {} unchanged, {} failed, {} propert(ies) changed",
                session.getUser().getUsername(), validatedSiteKey, normalizedLanguage, result.getSuccessfulNodes().size(),
                result.getUnchangedNodes().size(), result.getFailedNodes().size(), result.getTotalPropertiesUpdated());
        return result;
    }

    /**
     * Drops the unsaved changes of the node that failed, so the next node starts from a clean session.
     */
    private static void discardChanges(JCRSessionWrapper session) {
        try {
            session.refresh(false);
        } catch (RepositoryException e) {
            logger.warn("Could not discard the changes of a failed replacement: {}", e.getMessage());
        }
    }

    /**
     * Reads a node by identifier with the caller's session and checks that it lies inside the site.
     *
     * @throws ItemNotFoundException when the node is unreadable, missing or outside the site (same message)
     */
    static JCRNodeWrapper getNodeInSite(JCRSessionWrapper session, String uuid, String siteKey) throws RepositoryException {
        JCRNodeWrapper node;
        try {
            node = session.getNodeByIdentifier(uuid);
        } catch (ItemNotFoundException e) {
            throw new ItemNotFoundException("Node not found in site: " + uuid);
        }
        if (!node.getPath().startsWith("/sites/" + siteKey + "/")) {
            throw new ItemNotFoundException("Node not found in site: " + uuid);
        }
        return node;
    }
}
