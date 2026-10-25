# Build, deploy and test

## Build and deploy

```bash
mise install                      # JDK 17, Maven 3.8, Node 22
mvn clean install                 # lint, webpack, unit tests, bundle
curl -u root:<password> -F 'script=[{"installAndStartBundle":"search-and-replace-<version>.jar","forceUpdate":true}];type=application/json' \
  -F file=@target/search-and-replace-<version>.jar http://localhost:8080/modules/api/provisioning
```

Enable the module on a site (Site Settings or `j:installedModules`) to see the jContent app.

## Continuous integration

`.github/workflows/build.yml`: on every pull request (any base branch) and push to `main`, `jdx/mise-action`
installs `mise.toml`, the job fails unless Maven is 3.8, runs `mvn -B clean install` (lint, webpack, unit
tests, bundle) and checks that the jar carries `remoteEntry.js`. Cypress is not run in CI: it needs a
running Jahia and a licence.

## Cypress (`tests/`)

```bash
cd tests && yarn install
JAHIA_URL=http://localhost:8080 SUPER_USER_PASSWORD=<password> yarn e2e:ci
```

- `authorization.spec.ts`, `replace-scope.spec.ts`, `search-and-batch.spec.ts`: the API, run as the
  users they create; each refusal is asserted on the field's error path (past the API filter).
- `ui-flow.spec.ts`: the jContent flow. It takes a back-office licence seat: on a trial licence with no
  seat left, Jahia answers 503 "License terms violation" (seats are held 60 minutes per session).
- Fixture sites use `dx-base-demo-templates`; set `CYPRESS_SNR_TEMPLATE_SET` on an instance without it.

## Mutation check

`scripts/mutation/run-mutants.sh` disables each guard in turn, redeploys and expects its spec to fail
(`ONLY="name ..."` for some). It never relies on `ui-flow.spec.ts`. Wait until it has restored the
sources before committing: it patches Java files in place while it runs.
