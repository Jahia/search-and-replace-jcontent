# search-and-replace - agent harness

Jahia OSGi module: a jContent app (React 18 UI extension, webpack + Module Federation) and a GraphQL
extension (Java) to find a term in a site and replace it in the items the user selects.

Repository `Jahia/search-and-replace-jcontent` (moved from `smonier/search-and-replace` on 2026-10-25;
`Jahia/search-and-replace` is Jahia's legacy module with the same module id, see `context/architecture.md`).

Generic Jahia knowledge is not repeated here: read the AIStartupKit harness first
(`CLAUDE.md`, skills `jahia-osgi-ui-extension`, `jahia-java-security`, `jahia-java-jcr`,
`jahia-dev-cypress`, `jahia-review-java`). This folder holds what is specific to this module.

| File | What it holds |
| --- | --- |
| [context/architecture.md](context/architecture.md) | Where each piece lives, the rules of a replacement, and the decisions behind them |
| [context/testing.md](context/testing.md) | How to build, deploy and test locally, the mutation check, and the known traps of the local instance |

Before changing a rule of the replacement (scope, text fields, permission), update
`context/architecture.md`, the README, the CHANGELOG and the Cypress spec that covers it, and add the
guard to `scripts/mutation/run-mutants.sh`.
