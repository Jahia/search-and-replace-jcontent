import {deleteUser} from '@jahia/cypress';
import {
    PREVIEW,
    REPLACE,
    SEARCH,
    TestUser,
    addNodeTree,
    createTestSite,
    createTestUser,
    deleteTestSite,
    gqlOk,
    readProperty,
    uuidOf
} from '../support/snr';

/**
 * What a replacement changes: the selected node and its content down to the next page, main
 * resource or folder, and only the text an editor writes (text fields; in rich text, the text
 * between tags). Search and preview list exactly that. Runs as a site administrator, so this is
 * also the happy path of the API.
 */
describe('Search and replace - scope and text fields', () => {
    const siteKey = 'snr-scope';
    const pagePath = `/sites/${siteKey}/home/snr-page`;
    const introPath = `${pagePath}/main/intro`;
    const childPath = `${pagePath}/snr-child`;
    const richPath = `/sites/${siteKey}/contents/snr/rich`;
    const richEn = '<p>Acme sells <a href="https://acme.example/acme" title="acme">Acme tools</a></p><!-- acme -->';
    const richFr = '<p>Le café Acme</p>';
    const admin: TestUser = {username: 'snr-scope-admin', password: 'snrAdmin1234'};

    before(() => {
        createTestSite(siteKey);
        addNodeTree(`/sites/${siteKey}/home`, {
            name: 'snr-page', type: 'jnt:page',
            props: [
                {name: 'j:templateName', value: 'simple'},
                {name: 'jcr:title', language: 'en', value: 'Acme page'}
            ],
            children: [
                {name: 'main', primaryNodeType: 'jnt:contentList', children: [
                    {name: 'intro', primaryNodeType: 'jnt:bigText', properties: [{name: 'text', language: 'en', value: '<p>Acme intro</p>'}]}
                ]},
                {name: 'snr-child', primaryNodeType: 'jnt:page', properties: [
                    {name: 'j:templateName', value: 'simple'},
                    {name: 'jcr:title', language: 'en', value: 'Child about Acme'}
                ]}
            ]
        });
        addNodeTree(`/sites/${siteKey}/contents`, {
            name: 'snr', type: 'jnt:contentFolder',
            children: [{
                name: 'rich', primaryNodeType: 'jnt:bigText', mixins: ['jmix:tagged'],
                properties: [
                    {name: 'text', language: 'en', value: richEn},
                    {name: 'text', language: 'fr', value: richFr},
                    {name: 'j:tagList', values: ['acme']}
                ]
            }]
        });
        createTestUser(admin, `/sites/${siteKey}`, ['site-administrator']);
    });

    after(() => {
        deleteUser(admin.username);
        deleteTestSite(siteKey);
    });

    it('lists, for a page, its title and the content of its areas, not its sub-pages', () => {
        gqlOk(admin, SEARCH, {siteKey, term: 'acme', language: 'en'}).then(data => {
            const nodes = data.searchAndReplace.searchNodes.nodes;
            const page = nodes.find((n: {path: string}) => n.path === pagePath);
            expect(page, 'the page is a result').to.exist;
            expect(page.matchingProperties.map((m: {label: string}) => m.label)).to.have.members(['jcr:title', 'main/intro/text']);

            const rich = nodes.find((n: {path: string}) => n.path === richPath);
            expect(rich, 'the rich text is a result').to.exist;
            const flags = Object.fromEntries(rich.matchingProperties.map((m: {name: string; replaceable: boolean}) => [m.name, m.replaceable]));
            expect(flags, 'text is replaceable, tags are not').to.deep.eq({text: true, 'j:tagList': false});
        });
    });

    it('previews the same changes without writing them', () => {
        uuidOf(pagePath).then(uuid => {
            gqlOk(admin, PREVIEW, {siteKey, uuid, term: 'acme', replacement: 'Globex', language: 'en'})
                .its('searchAndReplace.previewReplace.propertyPreviews')
                .should(previews => {
                    expect(previews.map((p: {label: string}) => p.label)).to.have.members(['jcr:title', 'main/intro/text']);
                    expect(previews.find((p: {label: string}) => p.label === 'jcr:title').newValue).to.eq('Globex page');
                });
        });
        readProperty(pagePath, 'jcr:title', 'en').its('value').should('eq', 'Acme page');
    });

    it('replaces in a page and its areas, never in its sub-pages', () => {
        uuidOf(pagePath).then(uuid => {
            gqlOk(admin, REPLACE, {siteKey, uuids: [uuid], term: 'acme', replacement: 'Globex', language: 'en', properties: ['jcr:title', 'text']})
                .its('searchAndReplace.replaceInNodes')
                .should(result => {
                    expect(result.failedNodes).to.be.empty;
                    expect(result.totalPropertiesUpdated).to.eq(2);
                });
        });
        readProperty(pagePath, 'jcr:title', 'en').its('value').should('eq', 'Globex page');
        readProperty(introPath, 'text', 'en').its('value').should('eq', '<p>Globex intro</p>');
        readProperty(childPath, 'jcr:title', 'en').its('value').should('eq', 'Child about Acme');
    });

    it('replaces the text of rich text only, in the chosen language only, even with every field selected', () => {
        uuidOf(richPath).then(uuid => {
            // properties: null asks for every text field; j:tagList is not one
            gqlOk(admin, REPLACE, {siteKey, uuids: [uuid], term: 'acme', replacement: 'Globex', language: 'en', properties: null})
                .its('searchAndReplace.replaceInNodes.totalPropertiesUpdated').should('eq', 1);
        });
        readProperty(richPath, 'text', 'en').its('value')
            .should('eq', '<p>Globex sells <a href="https://acme.example/acme" title="acme">Globex tools</a></p><!-- acme -->');
        readProperty(richPath, 'text', 'fr').its('value').should('eq', richFr);
        readProperty(richPath, 'j:tagList').its('values').should('deep.eq', ['acme']);
    });

    it('runs from the jContent app: search, select, preview, replace', () => {
        const term = 'Globex';
        cy.login(admin.username, admin.password);
        cy.visit(`/jahia/jcontent/${siteKey}/en/contentToolsAccordion/SearchAndReplaceAction`);
        cy.get('input[placeholder="Enter text to search for..."]').should('be.visible').type(`${term}{enter}`);
        cy.contains('tr', 'Globex page').find('input[type=checkbox]').check({force: true});
        cy.contains('button', 'Replace in 1 nodes').click();
        cy.get('input[placeholder="Enter replacement text..."]').type('Initech');
        cy.contains('button', 'Preview').click();
        cy.contains('button', 'Execute Replace').click();
        cy.contains('Replace completed successfully!').should('be.visible');
        readProperty(pagePath, 'jcr:title', 'en').its('value').should('eq', 'Initech page');
        readProperty(childPath, 'jcr:title', 'en').its('value').should('eq', 'Child about Acme');
    });

    // A back-office login holds a licence seat until its session expires (60 min): sign out.
    afterEach(() => cy.logout());
});
