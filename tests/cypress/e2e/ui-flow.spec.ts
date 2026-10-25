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
        addNodeTree(`/sites/${siteKey}/contents`, {
            name: 'snr', type: 'jnt:contentFolder',
            children: [{name: 'accent', primaryNodeType: 'jnt:text', properties: [{name: 'text', language: 'en', value: 'Le Café du coin'}]}]
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
        cy.contains('button', 'Replace in 1 item').click();
        cy.get('input[placeholder="Enter replacement text..."]').type('Initech');
        cy.contains('button', 'Preview').click();
        cy.contains('[role=dialog]', 'Initech page').should('be.visible');
        cy.contains('[role=dialog]', 'Child about').should('not.exist');
        cy.contains('button', 'Execute Replace').click();
        cy.contains('Replace completed successfully!').should('be.visible');
        readProperty(pagePath, 'jcr:title', 'en').its('value').should('eq', 'Initech page');
        readProperty(childPath, 'jcr:title', 'en').its('value').should('eq', 'Child about Globex');
    });

    it('uses the full width of the panel', () => {
        cy.viewport(1900, 1000);
        cy.login(admin.username, admin.password);
        cy.visit(`/jahia/jcontent/${siteKey}/en/contentToolsAccordion/SearchAndReplaceAction`);
        cy.get('input[placeholder="Enter text to search for..."]').should('be.visible').type('globex{enter}');
        // the first test renamed the page; the child page still matches
        cy.get('table tbody tr').should('have.length.greaterThan', 0);
        cy.get('.moonstone-layoutContent').should($area => {
            const area = $area[0].getBoundingClientRect();
            const cards = Array.from($area[0].querySelectorAll('*'))
                .filter(el => getComputedStyle(el).boxShadow !== 'none' && el.getBoundingClientRect().width > 200)
                .map(el => el.getBoundingClientRect());
            expect(cards.length, 'cards rendered').to.be.greaterThan(1);
            const left = Math.min(...cards.map(r => r.left)) - area.left;
            const right = area.right - Math.max(...cards.map(r => r.right));
            // same margin on both sides; the right one may add a scrollbar
            expect(right - left, 'right margin minus left margin').to.be.within(0, 20);
        });
    });

    it('shows matches that cannot be replaced apart, and does not let their item be selected', () => {
        cy.login(admin.username, admin.password);
        cy.visit(`/jahia/jcontent/${siteKey}/en/contentToolsAccordion/SearchAndReplaceAction`);
        cy.get('input[placeholder="Enter text to search for..."]').should('be.visible').type('cafe{enter}');
        cy.contains('tr', 'Le Café du coin').as('row');
        cy.get('@row').should('have.attr', 'data-snr-replaceable', 'false');
        cy.get('@row').contains('Nothing to replace').should('be.visible');
        cy.get('@row').contains('Not replaced (1)').should('be.visible');
        cy.get('@row').contains('only inside markup, with other accents or split by formatting').should('be.visible');
        cy.get('@row').find('input[type=checkbox]').click({force: true});
        cy.get('@row').find('input[type=checkbox]').should('not.be.checked');
        cy.contains('button', /Replace in/).should('not.exist');
    });
});
