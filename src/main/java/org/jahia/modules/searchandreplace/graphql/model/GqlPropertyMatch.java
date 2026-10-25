package org.jahia.modules.searchandreplace.graphql.model;

import graphql.annotations.annotationTypes.GraphQLDescription;
import graphql.annotations.annotationTypes.GraphQLField;
import graphql.annotations.annotationTypes.GraphQLName;

/**
 * GraphQL type for a property match
 */
@GraphQLName("SearchAndReplacePropertyMatch")
public class GqlPropertyMatch {

    private String name;
    private String value;
    private String label;
    private boolean replaceable;
    private GqlNotReplaceableReason notReplaceableReason;

    public GqlPropertyMatch() {
    }

    public GqlPropertyMatch(String name, String value, String label, boolean replaceable) {
        this.name = name;
        this.value = value;
        this.label = label;
        this.replaceable = replaceable;
    }

    /**
     * A match, replaceable when {@code notReplaceableReason} is {@code null}.
     */
    public GqlPropertyMatch(String name, String value, String label, GqlNotReplaceableReason notReplaceableReason) {
        this(name, value, label, notReplaceableReason == null);
        this.notReplaceableReason = notReplaceableReason;
    }

    @GraphQLField
    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    @GraphQLField
    public String getValue() {
        return value;
    }

    public void setValue(String value) {
        this.value = value;
    }

    @GraphQLField
    public String getLabel() {
        return label;
    }

    public void setLabel(String label) {
        this.label = label;
    }

    @GraphQLField
    public boolean isReplaceable() {
        return replaceable;
    }

    public void setReplaceable(boolean replaceable) {
        this.replaceable = replaceable;
    }

    @GraphQLField
    @GraphQLDescription("Why the replacement does not change this property, or null when it does")
    public GqlNotReplaceableReason getNotReplaceableReason() {
        return notReplaceableReason;
    }

    public void setNotReplaceableReason(GqlNotReplaceableReason notReplaceableReason) {
        this.notReplaceableReason = notReplaceableReason;
    }
}
