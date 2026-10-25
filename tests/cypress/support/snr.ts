/**
 * Helpers shared by the search-and-replace specs.
 *
 * Every GraphQL call goes through `gql(user, ...)`: a plain POST with basic auth for that user and the
 * `Origin` header Jahia requires. Who the call runs as is therefore written at each call site, never
 * inherited from a client set earlier, and each spec asserts the effective user (`currentUser`)
 * before reading a refusal: a leftover root session would make every permission test pass.
 */

import {createSite, createUser, deleteSite, deleteUser, enableModule, grantRoles} from '@jahia/cypress';

export type TestUser = {
    username: string;
    password: string;
};

export type GqlBody = {
    data?: any;
    errors?: Array<{message: string; path?: string[]}>;
};

/** The module under test, as Jahia names its bundle. */
export const MODULE_NAME = 'search-and-replace';

/**
 * The template set fixture sites are built from. The suite asserts nothing about rendering; any set
 * that creates a home page will do. Override with CYPRESS_SNR_TEMPLATE_SET on an instance without it.
 */
export const TEMPLATE_SET: string = Cypress.env('SNR_TEMPLATE_SET') || 'dx-base-demo-templates';

export function asRoot(): TestUser {
    return {username: 'root', password: Cypress.env('SUPER_USER_PASSWORD') || 'root1234'};
}

export function jahiaOrigin(): string {
    const baseUrl = Cypress.config('baseUrl');
    if (!baseUrl) {
        throw new Error('baseUrl is not set: the @jahia/cypress env plugin did not run');
    }
    return new URL(baseUrl).origin;
}

/**
 * Sends one GraphQL operation as `user` and yields the response body.
 *
 * @param {TestUser} user who the call runs as.
 * @param {string} query the operation.
 * @param {object} variables its variables.
 */
export function gql(user: TestUser, query: string, variables: Record<string, unknown> = {}): Cypress.Chainable<GqlBody> {
    return cy.request({
        method: 'POST',
        url: '/modules/graphql',
        auth: {username: user.username, password: user.password},
        headers: {Origin: jahiaOrigin(), 'Content-Type': 'application/json'},
        body: {query, variables},
        failOnStatusCode: false
    }).then(response => {
        expect(response.status, 'GraphQL answered').to.eq(200);
        return response.body as GqlBody;
    });
}

/** Sends an operation as `user` and fails on any GraphQL error. */
export function gqlOk(user: TestUser, query: string, variables: Record<string, unknown> = {}): Cypress.Chainable<any> {
    return gql(user, query, variables).then(body => {
        expect(body.errors, `no GraphQL error for ${user.username}`).to.be.undefined;
        return body.data;
    });
}

/** Asserts that the call runs as `user`, not as a leftover identity. */
export function assertEffectiveUser(user: TestUser): void {
    gqlOk(user, '{ currentUser { username } }').its('currentUser.username').should('eq', user.username);
}

/**
 * Asserts that the searchAndReplace resolver itself refused the call: the error sits on the field
 * (path `searchAndReplace.<field>`), not on the API filter, which refuses on `searchAndReplace`.
 */
export function assertRefusedByField(body: GqlBody, field: string): void {
    expect(body.errors, 'the call is refused').to.have.length.greaterThan(0);
    expect(body.errors![0].message).to.eq('Permission denied');
    expect(body.errors![0].path, 'refused by the field resolver, past the API filter').to.deep.eq(['searchAndReplace', field]);
}

export const SEARCH = `query Search($siteKey: String!, $term: String!, $language: String!) {
    searchAndReplace {
        searchNodes(termToSearch: $term, siteKey: $siteKey, language: $language) {
            totalCount
            nodes { uuid path matchingProperties { name label value replaceable } }
        }
    }
}`;

export const REPLACE = `mutation Replace($siteKey: String!, $uuids: [String!]!, $term: String!, $replacement: String!,
        $language: String!, $properties: [String!]) {
    searchAndReplace {
        replaceInNodes(siteKey: $siteKey, nodeUuids: $uuids, termToReplace: $term, replacementTerm: $replacement,
                language: $language, propertiesToReplace: $properties, searchMode: CASE_INSENSITIVE) {
            successfulNodes failedNodes totalPropertiesUpdated errors { nodeUuid message }
        }
    }
}`;

export const PREVIEW = `query Preview($siteKey: String!, $uuid: String!, $term: String!, $replacement: String!, $language: String!) {
    searchAndReplace {
        previewReplace(siteKey: $siteKey, nodeUuid: $uuid, termToReplace: $term, replacementTerm: $replacement,
                language: $language) {
            nodePath propertyPreviews { label currentValue newValue }
        }
    }
}`;

/** Reads one property of a node as root, in a language when the property is i18n. */
export function readProperty(path: string, name: string, language?: string): Cypress.Chainable<any> {
    return gqlOk(asRoot(), `query Read($path: String!, $name: String!, $language: String) {
        jcr { nodeByPath(path: $path) { property(name: $name, language: $language) { value values } } }
    }`, {path, name, language}).its('jcr.nodeByPath.property');
}

/** Returns the identifier of a node, as root. */
export function uuidOf(path: string): Cypress.Chainable<string> {
    return gqlOk(asRoot(), 'query U($path: String!) { jcr { nodeByPath(path: $path) { uuid } } }', {path})
        .its('jcr.nodeByPath.uuid');
}

/**
 * Creates a node and its children as root, and fails on any GraphQL error (the @jahia/cypress
 * `addNode` helper resolves even when the mutation is refused).
 */
export function addNodeTree(parentPath: string, node: Record<string, unknown>): void {
    gqlOk(asRoot(), `mutation Add($parent: String!, $name: String!, $type: String!, $props: [InputJCRProperty],
            $children: [InputJCRNode], $mixins: [String]) {
        jcr { addNode(parentPathOrId: $parent, name: $name, primaryNodeType: $type, properties: $props,
                children: $children, mixins: $mixins) { uuid } }
    }`, {parent: parentPath, ...node});
}

/**
 * Creates a site with the module enabled, after removing what a killed run may have left.
 *
 * @param {string} siteKey the site key.
 */
export function createTestSite(siteKey: string): void {
    deleteTestSite(siteKey);
    createSite(siteKey, {templateSet: TEMPLATE_SET, serverName: 'localhost', locale: 'en', languages: 'en,fr'});
    enableModule(MODULE_NAME, siteKey);
    gqlOk(asRoot(), 'query S($path: String!) { jcr { nodeByPath(path: $path) { path } } }', {path: `/sites/${siteKey}/home`});
}

export function deleteTestSite(siteKey: string): void {
    gql(asRoot(), 'query S($path: String!) { jcr { nodeByPath(path: $path) { path } } }', {path: `/sites/${siteKey}`})
        .then(body => {
            if (body.data?.jcr?.nodeByPath) {
                deleteSite(siteKey);
            }
        });
}

/**
 * Creates a user granted `roles` on `sitePath`, after deleting a leftover with the same name.
 */
export function createTestUser(user: TestUser, sitePath: string, roles: string[]): void {
    deleteUser(user.username);
    createUser(user.username, user.password);
    grantRoles(sitePath, roles, user.username, 'USER');
}
