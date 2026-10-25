package org.jahia.modules.searchandreplace.graphql.model;

import graphql.annotations.annotationTypes.GraphQLField;
import graphql.annotations.annotationTypes.GraphQLName;
import java.util.List;

/**
 * GraphQL type for a search result node
 */
@GraphQLName("SearchAndReplaceSearchResultNode")
public class GqlSearchResultNode {

    private String uuid;
    private String path;
    private String name;
    private String displayName;
    private String nodeType;
    private String nodeTypeLabel;
    private String created;
    private String lastModified;
    private String parentPath;
    private String parentContainerPath;
    private List<GqlPropertyMatch> matchingProperties;

    public GqlSearchResultNode() {
    }

    @GraphQLField
    public String getUuid() {
        return uuid;
    }

    public void setUuid(String uuid) {
        this.uuid = uuid;
    }

    @GraphQLField
    public String getPath() {
        return path;
    }

    public void setPath(String path) {
        this.path = path;
    }

    @GraphQLField
    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    @GraphQLField
    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    @GraphQLField
    public String getNodeType() {
        return nodeType;
    }

    public void setNodeType(String nodeType) {
        this.nodeType = nodeType;
    }

    @GraphQLField
    public String getNodeTypeLabel() {
        return nodeTypeLabel;
    }

    public void setNodeTypeLabel(String nodeTypeLabel) {
        this.nodeTypeLabel = nodeTypeLabel;
    }

    // nosemgrep: jahia-graphql-admin-no-permission - read-only field of a result; searchNodes checks the searchAndReplace permission
    @GraphQLField
    public String getCreated() {
        return created;
    }

    public void setCreated(String created) {
        this.created = created;
    }

    @GraphQLField
    public String getLastModified() {
        return lastModified;
    }

    public void setLastModified(String lastModified) {
        this.lastModified = lastModified;
    }

    @GraphQLField
    public String getParentPath() {
        return parentPath;
    }

    public void setParentPath(String parentPath) {
        this.parentPath = parentPath;
    }

    @GraphQLField
    public String getParentContainerPath() {
        return parentContainerPath;
    }

    public void setParentContainerPath(String parentContainerPath) {
        this.parentContainerPath = parentContainerPath;
    }

    @GraphQLField
    public List<GqlPropertyMatch> getMatchingProperties() {
        return matchingProperties;
    }

    public void setMatchingProperties(List<GqlPropertyMatch> matchingProperties) {
        this.matchingProperties = matchingProperties;
    }
}
