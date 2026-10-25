package org.jahia.modules.searchandreplace.graphql;

import graphql.annotations.annotationTypes.GraphQLDescription;
import graphql.annotations.annotationTypes.GraphQLField;
import graphql.annotations.annotationTypes.GraphQLName;
import graphql.annotations.annotationTypes.GraphQLTypeExtension;
import org.jahia.modules.graphql.provider.dxm.DXGraphQLProvider;

/**
 * GraphQL Query extension: {@code Query.searchAndReplace} holds the read-only fields only.
 */
@GraphQLTypeExtension(DXGraphQLProvider.Query.class)
public final class SearchAndReplaceQueryExtension {

    private SearchAndReplaceQueryExtension() {
        // utility
    }

    @GraphQLField
    @GraphQLName("searchAndReplace")
    @GraphQLDescription("Search and replace read operations")
    public static SearchAndReplaceQueries searchAndReplace() {
        return new SearchAndReplaceQueries();
    }
}
