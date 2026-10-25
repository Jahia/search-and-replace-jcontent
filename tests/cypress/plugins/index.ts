import env from '@jahia/cypress/dist/plugins/env';

/**
 * Node-side setup: reads JAHIA_URL and SUPER_USER_PASSWORD from the process environment and sets
 * baseUrl and Cypress.env() from them (the CYPRESS_ prefixed forms are ignored by @jahia/cypress).
 *
 * @param {Cypress.PluginEvents} on Cypress plugin event registrar.
 * @param {Cypress.PluginConfigOptions} config the resolved Cypress configuration.
 * @returns {Cypress.PluginConfigOptions} the configuration with the Jahia environment applied.
 */
export function setupNodeEvents(
    on: Cypress.PluginEvents,
    config: Cypress.PluginConfigOptions
): Cypress.PluginConfigOptions {
    return env(on, config);
}
