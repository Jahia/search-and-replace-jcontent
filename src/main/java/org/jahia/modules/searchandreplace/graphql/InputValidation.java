package org.jahia.modules.searchandreplace.graphql;

import org.apache.commons.lang.StringUtils;
import org.jahia.modules.graphql.provider.dxm.BaseGqlClientException;
import org.jahia.modules.searchandreplace.graphql.model.GqlSearchFiltersInput;
import org.jahia.modules.searchandreplace.graphql.model.GqlSearchMode;
import org.jahia.modules.searchandreplace.service.TextReplacer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Validates and normalises the arguments of the search and replace fields. Every value that reaches
 * a JCR path, a query or a pattern goes through an allow-list here. Stateless and thread-safe.
 */
final class InputValidation {

    private static final Logger logger = LoggerFactory.getLogger(InputValidation.class);

    private static final int MAX_SEARCH_TERM_LENGTH = 512;
    private static final int MAX_FILTER_PROPERTIES = 500;
    private static final Pattern SITE_KEY_PATTERN = Pattern.compile("^[A-Za-z0-9_-]+$");
    private static final Pattern LANGUAGE_PATTERN = Pattern.compile("^[A-Za-z]{2,8}([_-][A-Za-z0-9]{2,8})*$");
    static final Pattern NODE_TYPE_PATTERN = Pattern.compile("^[A-Za-z][A-Za-z0-9:_-]*$");
    private static final Pattern PROPERTY_NAME_PATTERN = Pattern.compile("^[A-Za-z][A-Za-z0-9:_-]*$");

    private InputValidation() {
    }

    /**
     * A refused argument, reported to the caller with its message. GraphQL replaces the message of any
     * other runtime exception with "Internal Server Error(s) while executing query". No error type, so
     * the bundle does not import graphql-java.
     */
    static BaseGqlClientException invalid(String message) {
        return new BaseGqlClientException(message, null, Collections.emptyMap());
    }

    static final int DEFAULT_LIMIT = 200;
    static final int MAX_LIMIT = 1000;
    static final int MAX_NODES_PER_REPLACE = 200;

    static int resolveLimit(Integer limit) {
        if (limit == null || limit <= 0) {
            return DEFAULT_LIMIT;
        }
        return Math.min(limit, MAX_LIMIT);
    }

    static String normalizeSearchTerm(String rawTerm) {
        String trimmed = StringUtils.trimToEmpty(rawTerm);
        if (trimmed.length() > MAX_SEARCH_TERM_LENGTH) {
            throw invalid("Search term is too long. Maximum length is " + MAX_SEARCH_TERM_LENGTH);
        }
        return trimmed;
    }

    static String validateSiteKey(String siteKey) {
        String trimmed = StringUtils.trimToNull(siteKey);
        if (trimmed == null || !SITE_KEY_PATTERN.matcher(trimmed).matches()) {
            throw invalid("Invalid site key");
        }
        return trimmed;
    }

    static String normalizeLanguage(String language) {
        String normalized = StringUtils.trimToEmpty(language).replace('-', '_');
        if (StringUtils.isBlank(normalized)) {
            return "en";
        }
        if (!LANGUAGE_PATTERN.matcher(normalized).matches()) {
            throw invalid("Invalid language");
        }
        return normalized;
    }

    static GqlSearchFiltersInput sanitizeFilters(GqlSearchFiltersInput filters) {
        if (filters == null) {
            return null;
        }

        GqlSearchFiltersInput sanitized = new GqlSearchFiltersInput();
        String nodeType = StringUtils.trimToNull(filters.getNodeType());
        if (nodeType != null) {
            if (!NODE_TYPE_PATTERN.matcher(nodeType).matches()) {
                throw invalid("Invalid nodeType filter");
            }
            sanitized.setNodeType(nodeType);
        }

        sanitized.setCreatedAfter(StringUtils.trimToNull(filters.getCreatedAfter()));
        sanitized.setCreatedBefore(StringUtils.trimToNull(filters.getCreatedBefore()));
        sanitized.setModifiedAfter(StringUtils.trimToNull(filters.getModifiedAfter()));
        sanitized.setModifiedBefore(StringUtils.trimToNull(filters.getModifiedBefore()));
        sanitized.setProperties(sanitizePropertyNames(filters.getProperties()));

        if (StringUtils.isBlank(sanitized.getNodeType()) &&
                StringUtils.isBlank(sanitized.getCreatedAfter()) &&
                StringUtils.isBlank(sanitized.getCreatedBefore()) &&
                StringUtils.isBlank(sanitized.getModifiedAfter()) &&
                StringUtils.isBlank(sanitized.getModifiedBefore()) &&
                (sanitized.getProperties() == null || sanitized.getProperties().isEmpty())) {
            return null;
        }

        return sanitized;
    }

    static List<String> sanitizePropertyNames(List<String> propertyNames) {
        if (propertyNames == null || propertyNames.isEmpty()) {
            return null;
        }

        List<String> sanitized = new ArrayList<>();
        for (String propertyName : propertyNames) {
            String trimmed = StringUtils.trimToNull(propertyName);
            if (trimmed == null) {
                continue;
            }
            if (!PROPERTY_NAME_PATTERN.matcher(trimmed).matches()) {
                logger.debug("Ignoring unsupported property filter '{}'", trimmed);
                continue;
            }
            sanitized.add(trimmed);
            if (sanitized.size() >= MAX_FILTER_PROPERTIES) {
                break;
            }
        }

        return sanitized.isEmpty() ? null : sanitized;
    }

    static TextReplacer.Mode toMode(GqlSearchMode searchMode, String term) {
        GqlSearchMode effective = searchMode == null ? GqlSearchMode.CASE_INSENSITIVE : searchMode;
        if (effective == GqlSearchMode.REGEX) {
            try {
                Pattern.compile(term);
            } catch (Exception e) {
                throw invalid("Invalid regular expression: " + e.getMessage());
            }
        }
        return TextReplacer.Mode.valueOf(effective.name());
    }
}
