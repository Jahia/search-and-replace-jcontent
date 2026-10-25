package org.jahia.modules.searchandreplace.graphql.model;

import graphql.annotations.annotationTypes.GraphQLDescription;
import graphql.annotations.annotationTypes.GraphQLField;
import graphql.annotations.annotationTypes.GraphQLName;
import java.util.List;

/**
 * GraphQL type for replace preview
 */
@GraphQLName("SearchAndReplaceReplacePreview")
public class GqlReplacePreview {

    private String nodeUuid;
    private String nodePath;
    private List<GqlPropertyPreview> propertyPreviews;
    private String error;

    public GqlReplacePreview() {
    }

    public GqlReplacePreview(String nodeUuid, String nodePath, List<GqlPropertyPreview> propertyPreviews) {
        this.nodeUuid = nodeUuid;
        this.nodePath = nodePath;
        this.propertyPreviews = propertyPreviews;
    }

    @GraphQLField
    public String getNodeUuid() {
        return nodeUuid;
    }

    public void setNodeUuid(String nodeUuid) {
        this.nodeUuid = nodeUuid;
    }

    @GraphQLField
    public String getNodePath() {
        return nodePath;
    }

    public void setNodePath(String nodePath) {
        this.nodePath = nodePath;
    }

    @GraphQLField
    public List<GqlPropertyPreview> getPropertyPreviews() {
        return propertyPreviews;
    }

    public void setPropertyPreviews(List<GqlPropertyPreview> propertyPreviews) {
        this.propertyPreviews = propertyPreviews;
    }

    @GraphQLField
    @GraphQLDescription("Why the node cannot be previewed (unreadable, outside the site, regular expression timeout), or null")
    public String getError() {
        return error;
    }

    public void setError(String error) {
        this.error = error;
    }
}
