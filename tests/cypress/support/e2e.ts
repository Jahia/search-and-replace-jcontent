// @jahia/cypress publishes through cy.waitUntil, which registerSupport() does not load.
import 'cypress-wait-until';
import {registerSupport} from '@jahia/cypress/dist/support/registerSupport';
import {asRoot, gql} from './snr';

registerSupport();

// Apollo (behind the @jahia/cypress helpers) calls fetch unbound.
if (typeof window !== 'undefined' && window.fetch) {
    globalThis.fetch = window.fetch.bind(window);
}

/**
 * Run-level guard: every spec reads answers of the searchAndReplace fields. When the module is not
 * deployed the field does not exist and a spec asserting a refusal would pass for that reason, so
 * the run checks once that the field answers, as root, on a site key that does not exist.
 */
before(() => {
    gql(asRoot(), '{ searchAndReplace { searchNodes(termToSearch: "x", siteKey: "snr-module-probe", language: "en") { totalCount } } }')
        .then(body => {
            expect(JSON.stringify(body.errors), 'the search-and-replace module must be deployed and ACTIVE')
                .to.contain('Permission denied');
            expect(body.errors?.[0].path, 'the refusal comes from the searchNodes resolver')
                .to.deep.eq(['searchAndReplace', 'searchNodes']);
        });
});
