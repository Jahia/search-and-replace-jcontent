package org.jahia.modules.searchandreplace.graphql.model;

import graphql.annotations.annotationTypes.GraphQLDescription;
import graphql.annotations.annotationTypes.GraphQLField;
import graphql.annotations.annotationTypes.GraphQLName;
import java.util.ArrayList;
import java.util.List;

/**
 * GraphQL type for replace result
 */
@GraphQLName("SearchAndReplaceReplaceResult")
public class GqlReplaceResult {

    private List<String> successfulNodes;
    private List<String> failedNodes;
    private int totalPropertiesUpdated;
    private List<GqlReplaceError> errors;
    private List<String> unchangedNodes = new ArrayList<>();

    public GqlReplaceResult() {
    }

    public GqlReplaceResult(List<String> successfulNodes, List<String> failedNodes, int totalPropertiesUpdated, List<GqlReplaceError> errors) {
        this.successfulNodes = successfulNodes;
        this.failedNodes = failedNodes;
        this.totalPropertiesUpdated = totalPropertiesUpdated;
        this.errors = errors;
    }

    @GraphQLField
    public List<String> getSuccessfulNodes() {
        return successfulNodes;
    }

    public void setSuccessfulNodes(List<String> successfulNodes) {
        this.successfulNodes = successfulNodes;
    }

    @GraphQLField
    @GraphQLDescription("Selected nodes that were readable and writable but had nothing to replace")
    public List<String> getUnchangedNodes() {
        return unchangedNodes;
    }

    public void setUnchangedNodes(List<String> unchangedNodes) {
        this.unchangedNodes = unchangedNodes;
    }

    @GraphQLField
    public List<String> getFailedNodes() {
        return failedNodes;
    }

    public void setFailedNodes(List<String> failedNodes) {
        this.failedNodes = failedNodes;
    }

    @GraphQLField
    public int getTotalPropertiesUpdated() {
        return totalPropertiesUpdated;
    }

    public void setTotalPropertiesUpdated(int totalPropertiesUpdated) {
        this.totalPropertiesUpdated = totalPropertiesUpdated;
    }

    @GraphQLField
    public List<GqlReplaceError> getErrors() {
        return errors;
    }

    public void setErrors(List<GqlReplaceError> errors) {
        this.errors = errors;
    }
}
