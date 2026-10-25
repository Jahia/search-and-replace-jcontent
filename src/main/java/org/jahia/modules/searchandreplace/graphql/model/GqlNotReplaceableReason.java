package org.jahia.modules.searchandreplace.graphql.model;

import graphql.annotations.annotationTypes.GraphQLDescription;
import graphql.annotations.annotationTypes.GraphQLName;

/**
 * Why a property that contains the searched term is not changed by a replacement.
 */
@GraphQLName("SearchAndReplaceNotReplaceableReason")
@GraphQLDescription("Why a matching property is not changed by a replacement")
public enum GqlNotReplaceableReason {
    /** A system, protected or choicelist property, a reference, a URL: never replaced. */
    @GraphQLDescription("Not a text field an editor writes (system property, URL, choicelist, reference)")
    NOT_A_TEXT_FIELD,
    /** A text field where the term appears only inside markup, with other accents or split by formatting. */
    @GraphQLDescription("The term appears only inside markup, with other accents or split by formatting, which the replacement does not change")
    DIFFERENT_SPELLING
}
