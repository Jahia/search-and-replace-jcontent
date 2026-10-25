import {deleteUser} from '@jahia/cypress';
import {
    REPLACE,
    SEARCH,
    TestUser,
    addNodeTree,
    asRoot,
    assertEffectiveUser,
    assertRefusedByField,
    createTestSite,
    createTestUser,
    deleteTestSite,
    gql,
    gqlOk,
    readProperty,
    uuidOf
} from '../support/snr';

/**
 * Who may search and replace: the searchAndReplace permission on the site (held by
 * site-administrator through site-admin), checked by every field, with the caller's own session.
 * Each refusal test first proves the user got past the API filter and holds other rights, so the
 * refusal can only come from the module's check.
 */
describe('Search and replace - authorization', () => {
    const siteKey = 'snr-auth';
    const otherSiteKey = 'snr-auth-other';
    const textPath = `/sites/${siteKey}/contents/snr/note`;
    const original = 'Acme makes anvils';

    const admin: TestUser = {username: 'snr-auth-admin', password: 'snrAdmin1234'};
    const editor: TestUser = {username: 'snr-auth-editor', password: 'snrEditor1234'};
    const otherAdmin: TestUser = {username: 'snr-auth-other-admin', password: 'snrOther1234'};

    const resetText = () => {
        gqlOk(asRoot(), `mutation R($path: String!, $value: String!) {
            jcr { mutateNode(pathOrId: $path) { mutateProperty(name: "text") { setValue(language: "en", value: $value) } } }
        }`, {path: textPath, value: original});
    };

    before(() => {
        createTestSite(siteKey);
        createTestSite(otherSiteKey);
        addNodeTree(`/sites/${siteKey}/contents`, {
            name: 'snr', type: 'jnt:contentFolder',
            children: [{name: 'note', primaryNodeType: 'jnt:text', properties: [{name: 'text', language: 'en', value: original}]}]
        });
        createTestUser(admin, `/sites/${siteKey}`, ['site-administrator']);
        // privileged lets the editor through the GraphQL API filter, so the module's own check is what refuses
        createTestUser(editor, `/sites/${siteKey}`, ['editor', 'privileged']);
        createTestUser(otherAdmin, `/sites/${otherSiteKey}`, ['site-administrator']);
    });

    beforeEach(resetText);

    after(() => {
        [admin, editor, otherAdmin].forEach(user => deleteUser(user.username));
        deleteTestSite(siteKey);
        deleteTestSite(otherSiteKey);
    });

    it('lets a site administrator search and replace', () => {
        assertEffectiveUser(admin);
        gqlOk(admin, SEARCH, {siteKey, term: 'acme', language: 'en'}).then(data => {
            const paths = data.searchAndReplace.searchNodes.nodes.map((n: {path: string}) => n.path);
            expect(paths).to.include(textPath);
        });
        uuidOf(textPath).then(uuid => {
            gqlOk(admin, REPLACE, {siteKey, uuids: [uuid], term: 'acme', replacement: 'Globex', language: 'en', properties: ['text']})
                .its('searchAndReplace.replaceInNodes')
                .should(result => {
                    expect(result.failedNodes).to.be.empty;
                    expect(result.totalPropertiesUpdated).to.eq(1);
                });
        });
        readProperty(textPath, 'text', 'en').its('value').should('eq', 'Globex makes anvils');
    });

    it('refuses an editor who may write the content but lacks the permission', () => {
        assertEffectiveUser(editor);
        gqlOk(editor, `query P($path: String!) { jcr { nodeByPath(path: $path) {
            hasPermission(permissionName: "jcr:modifyProperties_default") } } }`, {path: textPath})
            .its('jcr.nodeByPath.hasPermission').should('eq', true);

        gql(editor, SEARCH, {siteKey, term: 'acme', language: 'en'}).then(body => assertRefusedByField(body, 'searchNodes'));
        uuidOf(textPath).then(uuid => {
            gql(editor, REPLACE, {siteKey, uuids: [uuid], term: 'acme', replacement: 'Globex', language: 'en', properties: ['text']})
                .then(body => assertRefusedByField(body, 'replaceInNodes'));
        });
        readProperty(textPath, 'text', 'en').its('value').should('eq', original);
    });

    it('refuses the administrator of another site, on this site and on its nodes', () => {
        assertEffectiveUser(otherAdmin);
        // control: the same user searches its own site
        gqlOk(otherAdmin, SEARCH, {siteKey: otherSiteKey, term: 'acme', language: 'en'});

        gql(otherAdmin, SEARCH, {siteKey, term: 'acme', language: 'en'}).then(body => assertRefusedByField(body, 'searchNodes'));
        uuidOf(textPath).then(uuid => {
            gql(otherAdmin, REPLACE, {siteKey, uuids: [uuid], term: 'acme', replacement: 'Globex', language: 'en', properties: ['text']})
                .then(body => assertRefusedByField(body, 'replaceInNodes'));
            // its own site key with a node of this site: the node is refused, the call is not
            gqlOk(otherAdmin, REPLACE, {siteKey: otherSiteKey, uuids: [uuid], term: 'acme', replacement: 'Globex', language: 'en', properties: ['text']})
                .its('searchAndReplace.replaceInNodes')
                .should(result => {
                    expect(result.failedNodes).to.deep.eq([uuid]);
                    expect(result.totalPropertiesUpdated).to.eq(0);
                });
        });
        readProperty(textPath, 'text', 'en').its('value').should('eq', original);
    });

    it('refuses a node outside the requested site, even for root', () => {
        // root may write everywhere, so only the site bound can refuse this
        uuidOf(textPath).then(uuid => {
            gqlOk(asRoot(), REPLACE, {siteKey: otherSiteKey, uuids: [uuid], term: 'acme', replacement: 'Globex', language: 'en', properties: ['text']})
                .its('searchAndReplace.replaceInNodes')
                .should(result => {
                    expect(result.failedNodes).to.deep.eq([uuid]);
                    expect(result.errors[0].message).to.contain('Node not found in site');
                });
        });
        readProperty(textPath, 'text', 'en').its('value').should('eq', original);
    });

    it('refuses a site key that does not exist like a missing permission', () => {
        gql(asRoot(), SEARCH, {siteKey: 'snr-no-such-site', term: 'acme', language: 'en'})
            .then(body => assertRefusedByField(body, 'searchNodes'));
    });

    it('does not accept a write sent as a query', () => {
        uuidOf(textPath).then(uuid => {
            gql(asRoot(), REPLACE.replace(/^mutation/, 'query'), {
                siteKey, uuids: [uuid], term: 'acme', replacement: 'Globex', language: 'en', properties: ['text']
            }).then(body => {
                expect(body.errors, 'replaceInNodes is not a Query field').to.have.length.greaterThan(0);
                expect(body.errors![0].message).to.contain('FieldUndefined');
            });
        });
        readProperty(textPath, 'text', 'en').its('value').should('eq', original);
    });
});
