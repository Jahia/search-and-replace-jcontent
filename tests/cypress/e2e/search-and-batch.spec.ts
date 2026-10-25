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
    gql,
    gqlOk,
    readProperty,
    uuidOf
} from '../support/snr';

/**
 * What a search costs and what a batch replacement promises: bounded result pages, a deep scan only
 * on request, matches that replace would not change shown as such, one save per node (a failing node
 * leaves nothing behind and does not stop the others), a regular expression time limit, and a cap on
 * the batch size.
 */
describe('Search and replace - search bounds and batches', () => {
    const siteKey = 'snr-batch';
    const folder = `/sites/${siteKey}/contents/snr`;
    const pagePath = `/sites/${siteKey}/home/snr-batch-page`;
    const slowText = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!';
    // A backreference disables the JDK's loop memoization: about 30 s on the slow text without the limit
    const slowRegex = '(a+)+\\1b';
    const admin: TestUser = {username: 'snr-batch-admin', password: 'snrAdmin1234'};

    const text = (name: string, value: string) => ({name, primaryNodeType: 'jnt:text', properties: [{name: 'text', language: 'en', value}]});

    before(() => {
        createTestSite(siteKey);
        addNodeTree(`/sites/${siteKey}/contents`, {
            name: 'snr', type: 'jnt:contentFolder',
            children: [
                text('widget1', 'Widget one'),
                text('widget2', 'Widget two'),
                text('widget3', 'Widget three'),
                text('accent', 'Le Café du coin'),
                text('partial', 'Megazorblaxian'),
                text('quick', 'xaab'),
                text('nomatch', 'nothing here')
            ]
        });
        // The page title matches the pattern quickly, its area content makes it time out: the title change
        // is set on the session before the failure and must not be saved with the next node.
        addNodeTree(`/sites/${siteKey}/home`, {
            name: 'snr-batch-page', type: 'jnt:page',
            props: [{name: 'j:templateName', value: 'simple'}, {name: 'jcr:title', language: 'en', value: 'aab page'}],
            children: [{name: 'main', primaryNodeType: 'jnt:contentList', children: [text('slow', slowText)]}]
        });
        createTestUser(admin, `/sites/${siteKey}`, ['site-administrator']);
    });

    after(() => {
        deleteUser(admin.username);
        deleteTestSite(siteKey);
    });

    it('pages the results with limit and offset', () => {
        gqlOk(admin, SEARCH, {siteKey, term: 'widget', language: 'en', limit: 2}).then(first => {
            const page1 = first.searchAndReplace.searchNodes;
            expect(page1.nodes).to.have.length(2);
            expect(page1.truncated, 'more rows exist').to.eq(true);
            gqlOk(admin, SEARCH, {siteKey, term: 'widget', language: 'en', limit: 2, offset: 2}).then(second => {
                const page2 = second.searchAndReplace.searchNodes;
                expect(page2.nodes).to.have.length(1);
                expect(page2.truncated).to.eq(false);
                const paths = [...page1.nodes, ...page2.nodes].map((n: {path: string}) => n.path);
                expect(new Set(paths)).to.have.property('size', 3);
            });
        });
    });

    it('scans for parts of words only when deepSearch is asked', () => {
        gqlOk(admin, SEARCH, {siteKey, term: 'zorblax', language: 'en'})
            .its('searchAndReplace.searchNodes.nodes').should('have.length', 0);
        gqlOk(admin, SEARCH, {siteKey, term: 'zorblax', language: 'en', deepSearch: true})
            .its('searchAndReplace.searchNodes.nodes')
            .should(nodes => expect(nodes.map((n: {path: string}) => n.path)).to.deep.eq([`${folder}/partial`]));
    });

    it('shows a match written with other accents as found but not replaceable, and previews no change', () => {
        gqlOk(admin, SEARCH, {siteKey, term: 'cafe', language: 'en'}).then(data => {
            const row = data.searchAndReplace.searchNodes.nodes.find((n: {path: string}) => n.path === `${folder}/accent`);
            expect(row, 'search folds accents').to.exist;
            expect(row.matchingProperties[0].replaceable, 'replace does not fold accents').to.eq(false);
            expect(row.matchingProperties[0].notReplaceableReason).to.eq('DIFFERENT_SPELLING');
        });
        uuidOf(`${folder}/accent`).then(uuid => {
            gqlOk(admin, PREVIEW, {siteKey, uuids: [uuid], term: 'cafe', replacement: 'bar', language: 'en'})
                .its('searchAndReplace.previewReplace.0.propertyPreviews').should('have.length', 0);
        });
    });

    it('previews every selected node and reports the unreadable one instead of failing', () => {
        uuidOf(`${folder}/widget1`).then(uuid => {
            gqlOk(admin, PREVIEW, {siteKey, uuids: [uuid, '00000000-0000-0000-0000-000000000000'], term: 'widget', replacement: 'Gadget', language: 'en'})
                .its('searchAndReplace.previewReplace')
                .should(previews => {
                    expect(previews).to.have.length(2);
                    expect(previews[0].propertyPreviews[0].newValue).to.eq('Gadget one');
                    expect(previews[0].error).to.be.null;
                    expect(previews[1].error).to.contain('Node not found in site');
                });
        });
        readProperty(`${folder}/widget1`, 'text', 'en').its('value').should('eq', 'Widget one');
    });

    it('saves each node on its own: a node that fails leaves nothing behind, the others are kept', () => {
        uuidOf(pagePath).then(pageUuid => {
            uuidOf(`${folder}/quick`).then(quickUuid => {
                uuidOf(`${folder}/nomatch`).then(noMatchUuid => {
                    const started = Date.now();
                    gqlOk(admin, REPLACE, {
                        siteKey, uuids: [pageUuid, quickUuid, noMatchUuid], term: slowRegex, replacement: 'z',
                        language: 'en', properties: null, mode: 'REGEX'
                    }).its('searchAndReplace.replaceInNodes').should(result => {
                        expect(result.failedNodes).to.deep.eq([pageUuid]);
                        expect(result.errors[0].message).to.contain('regular expression');
                        expect(result.errors[0].nodePath).to.eq(pagePath);
                        expect(result.successfulNodes).to.deep.eq([quickUuid]);
                        expect(result.unchangedNodes).to.deep.eq([noMatchUuid]);
                        expect(Date.now() - started, 'the time limit stopped the pattern').to.be.lessThan(15000);
                    });
                });
            });
        });
        readProperty(pagePath, 'jcr:title', 'en').its('value').should('eq', 'aab page');
        readProperty(`${folder}/quick`, 'text', 'en').its('value').should('eq', 'xz');
    });

    it('refuses a batch above 200 nodes', () => {
        const uuids = Array.from({length: 201}, (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`);
        gql(admin, REPLACE, {siteKey, uuids, term: 'widget', replacement: 'x', language: 'en', properties: ['text']})
            .then(body => {
                expect(body.errors, 'the batch is refused').to.have.length.greaterThan(0);
                expect(body.errors![0].message).to.contain('At most 200 nodes');
            });
        readProperty(`${folder}/widget2`, 'text', 'en').its('value').should('eq', 'Widget two');
    });
});
