import gql from 'graphql-tag';

/**
 * Query to search for nodes containing a specific term
 */
export const SEARCH_NODES_QUERY = gql`
    query SearchNodesQuery($termToSearch: String!, $siteKey: String!, $language: String!, $filters: InputSearchAndReplaceSearchFiltersInput, $limit: Int, $deepSearch: Boolean) {
        searchAndReplace {
            searchNodes(termToSearch: $termToSearch, siteKey: $siteKey, language: $language, filters: $filters, limit: $limit, deepSearch: $deepSearch) {
                totalCount
                truncated
                nodes {
                    uuid
                    path
                    name
                    displayName
                    nodeType
                    nodeTypeLabel
                    created
                    lastModified
                    parentPath
                    parentContainerPath
                    matchingProperties {
                        name
                        value
                        label
                        replaceable
                    }
                }
            }
        }
    }
`;

/**
 * Query to get available node types for filtering
 */
export const GET_NODE_TYPES_QUERY = gql`
    query GetNodeTypesQuery($siteKey: String!) {
        searchAndReplace {
            getNodeTypes(siteKey: $siteKey) {
                name
                label
                count
            }
        }
    }
`;

/**
 * Query to get properties for a specific node type
 */
export const GET_NODE_TYPE_PROPERTIES_QUERY = gql`
    query GetNodeTypePropertiesQuery($nodeType: String!) {
        searchAndReplace {
            getNodeTypeProperties(nodeType: $nodeType) {
                name
                label
                type
            }
        }
    }
`;

/**
 * Query to retrieve site node types for filters dropdown
 */
export const GET_SITE_NODE_TYPES_QUERY = gql`
    query GetSiteNodeTypesQuery($siteKey: String!, $language: String!) {
        jcr {
            nodeTypes(
                filter: {
                    includeMixins: false
                    siteKey: $siteKey
                    includeTypes: ["jmix:editorialContent"]
                    excludeTypes: ["jmix:studioOnly", "jmix:hiddenType"]
                }
            ) {
                nodes {
                    name
                    displayName(language: $language)
                }
            }
        }
    }
`;

export const GET_SITE_LANGUAGES_QUERY = gql`
    query GetSiteLanguages($workspace: Workspace!, $scope: String!) {
        jcr(workspace: $workspace) {
            nodeByPath(path: $scope) {
                uuid
                workspace
                languages: property(name: "j:languages") {
                    values
                }
            }
        }
    }
`;

/**
 * Mutation to replace text in selected nodes
 */
export const REPLACE_IN_NODES_MUTATION = gql`
    mutation ReplaceInNodesMutation(
        $siteKey: String!
        $nodeUuids: [String!]!
        $termToReplace: String!
        $replacementTerm: String!
        $language: String!
        $propertiesToReplace: [String!]
        $searchMode: SearchAndReplaceSearchMode
    ) {
        searchAndReplace {
            replaceInNodes(
                siteKey: $siteKey
                nodeUuids: $nodeUuids
                termToReplace: $termToReplace
                replacementTerm: $replacementTerm
                language: $language
                propertiesToReplace: $propertiesToReplace
                searchMode: $searchMode
            ) {
                successfulNodes
                unchangedNodes
                failedNodes
                totalPropertiesUpdated
                errors {
                    nodeUuid
                    message
                    nodePath
                }
            }
        }
    }
`;

/**
 * Query to preview, without writing, what replaceInNodes would change for each selected node
 */
export const PREVIEW_REPLACE_QUERY = gql`
    query PreviewReplaceQuery(
        $siteKey: String!
        $nodeUuids: [String!]!
        $termToReplace: String!
        $replacementTerm: String!
        $language: String!
        $propertiesToReplace: [String!]
        $searchMode: SearchAndReplaceSearchMode
    ) {
        searchAndReplace {
            previewReplace(
                siteKey: $siteKey
                nodeUuids: $nodeUuids
                termToReplace: $termToReplace
                replacementTerm: $replacementTerm
                language: $language
                propertiesToReplace: $propertiesToReplace
                searchMode: $searchMode
            ) {
                nodeUuid
                nodePath
                error
                propertyPreviews {
                    name
                    currentValue
                    newValue
                    label
                }
            }
        }
    }
`;
