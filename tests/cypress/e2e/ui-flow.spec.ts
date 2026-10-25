import {deleteUser} from '@jahia/cypress';
import {TestUser, addNodeTree, createTestSite, createTestUser, deleteTestSite, readProperty} from '../support/snr';

/**
 * The primary flow in the jContent app, as a site administrator: search, select a row, preview on the
 * server, replace, read the result. Kept apart from the API specs: a back-office login takes a licence
 * seat, and on an instance with no free seat Jahia answers 503 "License terms violation" to this spec
 * only (the API specs, and the mutation check that reads them, are not affected).
 */
describe('Search and replace - jContent app', () => {
    const siteKey = 'snr-ui';
    const pagePath = `/sites/${siteKey}/home/snr-page`;
    const childPath = `${pagePath}/snr-child`;
    const admin: TestUser = {username: 'snr-ui-admin', password: 'snrAdmin1234'};

    before(() => {
        createTestSite(siteKey);
        addNodeTree(`/sites/${siteKey}/home`, {
            name: 'snr-page', type: 'jnt:page',
            props: [
                {name: 'j:templateName', value: 'simple'},
                {name: 'jcr:title', language: 'en', value: 'Globex page'}
            ],
            children: [
                {name: 'snr-child', primaryNodeType: 'jnt:page', properties: [
                    {name: 'j:templateName', value: 'simple'},
                    {name: 'jcr:title', language: 'en', value: 'Child about Globex'}
                ]}
            ]
        });
        createTestUser(admin, `/sites/${siteKey}`, ['site-administrator']);
    });

    // A back-office login holds a licence seat until its session expires (60 min): sign out.
    afterEach(() => cy.logout());

    after(() => {
        deleteUser(admin.username);
        deleteTestSite(siteKey);
    });

    it('searches, previews on the server and replaces, without touching sub-pages', () => {
        cy.login(admin.username, admin.password);
        cy.visit(`/jahia/jcontent/${siteKey}/en/contentToolsAccordion/SearchAndReplaceAction`);
        cy.get('input[placeholder="Enter text to search for..."]').should('be.visible').type('globex{enter}');
        cy.contains('tr', 'Globex page').find('input[type=checkbox]').check({force: true});
        cy.contains('button', 'Replace in 1 nodes').click();
        cy.get('input[placeholder="Enter replacement text..."]').type('Initech');
        cy.contains('button', 'Preview').click();
        cy.contains('[role=dialog]', 'Initech page').should('be.visible');
        cy.contains('[role=dialog]', 'Child about').should('not.exist');
        cy.contains('button', 'Execute Replace').click();
        cy.contains('Replace completed successfully!').should('be.visible');
        readProperty(pagePath, 'jcr:title', 'en').its('value').should('eq', 'Initech page');
        readProperty(childPath, 'jcr:title', 'en').its('value').should('eq', 'Child about Globex');
    });
});
