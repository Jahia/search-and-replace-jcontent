package org.jahia.modules.searchandreplace.graphql.model;

import graphql.annotations.annotationTypes.GraphQLField;
import graphql.annotations.annotationTypes.GraphQLName;

/**
 * GraphQL input for search filters
 */
@GraphQLName("SearchAndReplaceSearchFiltersInput")
public class GqlSearchFiltersInput {

    private String nodeType;
    private String createdBefore;
    private String createdAfter;
    private String modifiedBefore;
    private String modifiedAfter;
    private java.util.List<String> properties;

    @GraphQLField
    public String getNodeType() {
        return nodeType;
    }

    public void setNodeType(String nodeType) {
        this.nodeType = nodeType;
    }

    // nosemgrep: jahia-graphql-admin-no-permission - read-only input field of the search filters; searchNodes checks the searchAndReplace permission
    @GraphQLField
    public String getCreatedBefore() {
        return createdBefore;
    }

    public void setCreatedBefore(String createdBefore) {
        this.createdBefore = createdBefore;
    }

    // nosemgrep: jahia-graphql-admin-no-permission - read-only input field of the search filters; searchNodes checks the searchAndReplace permission
    @GraphQLField
    public String getCreatedAfter() {
        return createdAfter;
    }

    public void setCreatedAfter(String createdAfter) {
        this.createdAfter = createdAfter;
    }

    @GraphQLField
    public String getModifiedBefore() {
        return modifiedBefore;
    }

    public void setModifiedBefore(String modifiedBefore) {
        this.modifiedBefore = modifiedBefore;
    }

    @GraphQLField
    public String getModifiedAfter() {
        return modifiedAfter;
    }

    public void setModifiedAfter(String modifiedAfter) {
        this.modifiedAfter = modifiedAfter;
    }

    @GraphQLField
    public java.util.List<String> getProperties() {
        return properties;
    }

    public void setProperties(java.util.List<String> properties) {
        this.properties = properties;
    }
}
