package org.jahia.modules.searchandreplace.graphql;

import graphql.annotations.annotationTypes.GraphQLDescription;
import graphql.annotations.annotationTypes.GraphQLField;
import graphql.annotations.annotationTypes.GraphQLName;
import graphql.annotations.annotationTypes.GraphQLTypeExtension;
import org.jahia.modules.graphql.provider.dxm.DXGraphQLProvider;

/**
 * GraphQL Mutation extension: {@code Mutation.searchAndReplace} holds the write fields only.
 */
@GraphQLTypeExtension(DXGraphQLProvider.Mutation.class)
public final class SearchAndReplaceMutationExtension {

    private SearchAndReplaceMutationExtension() {
        // utility
    }

    @GraphQLField
    @GraphQLName("searchAndReplace")
    @GraphQLDescription("Search and replace write operations")
    public static SearchAndReplaceMutations searchAndReplace() {
        return new SearchAndReplaceMutations();
    }
}
