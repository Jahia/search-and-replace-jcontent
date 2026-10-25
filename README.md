# Search And Replace (Jahia Module)

Search-and-replace module for Jahia Content Editor tools.

It provides:
- A Moonstone-based admin UI integrated in JContent.
- A DX GraphQL API extension for search, preview, and replacement operations.
- Language-aware search/replacement through `j:translation_<lang>` content.
- Recursive matching across string and multi-string properties, including rich text content.

## 1. Module Overview

### Main use cases
- Find a term across a site subtree.
- Filter results by content type and date range.
- Preview and apply replacement on selected nodes/properties.
- Work in multilingual sites by choosing the target language.

### Current workspace behavior
- Search and replacement execute in the **`default` (EDIT)** JCR workspace.
- They do not execute against `live`.

## 2. Functional Capabilities

### Search
- Scope: descendants of `/sites/{siteKey}`.
- Language: selected in UI, mapped to translation node `j:translation_<language>`.
- Matching:
  - Case-insensitive matching.
  - Accent/diacritics tolerant matching.
  - HTML-aware text normalization (richtext content is searchable).
- Property types scanned:
  - `STRING`
  - Multi-valued `STRING[]`
- Filters:
  - `nodeType`
  - `createdAfter`, `createdBefore`
  - `modifiedAfter`, `modifiedBefore`
  - `properties` (optional property-name whitelist)
- Results: through the full-text index, at most `limit` rows (default 200, maximum 1000) after
  `offset` rows; `truncated` tells that more exist. The UI asks for 200 and says so when truncated.
- **Deep search** (`deepSearch`, the "Also find parts of words" box): when the index finds nothing,
  scan every node of the site. It finds parts of words; it is slow on large sites, so it runs only on
  request.
- A match is **replaceable** when it is a text field and the replacement would change it. Other matches
  carry `notReplaceableReason`: `NOT_A_TEXT_FIELD` (system property, link, list value) or
  `DIFFERENT_SPELLING` (only inside markup, with other accents, "cafe" for "Café", or split by
  formatting). The UI shows them apart and muted, with the reason, below the replaceable ones; an item
  with nothing replaceable is greyed out and cannot be selected, and the replace dialog lists these
  matches under "Not updated", without a checkbox.

### Replace
- Supports `EXACT_MATCH`, `CASE_INSENSITIVE`, and `REGEX`.
- **Scope:** each selected node and its content down to the next page, main resource
  (`jmix:mainResource`) or folder. Selecting a page changes its title and the content of its areas,
  never its sub-pages. A folder covers only its own properties: each item in it is its own result.
  A search result row lists exactly what this scope covers.
- **One save per node:** a node that fails (missing right, lock, regular expression timeout) is reported
  in `failedNodes` with its path, its partial changes are discarded, and the other nodes are kept.
  Nodes with nothing to replace are listed in `unchangedNodes`. At most 200 nodes per call.
- **Regular expressions** run for at most 2 seconds per value.
- Each replacement logs one audit line (user, site, language, counts) at INFO.
- **Text fields only:** non-protected `string` properties edited as small text, text area or rich text,
  without a choicelist, outside the system namespaces (`jcr:title` and `jcr:description` excepted).
  URLs (`j:url`), tags, segment definitions (`wem:*`), node names and choicelist keys are never changed;
  search shows such matches as read-only.
- **Rich text:** only the text between tags is replaced. Attributes (`href`, `src`, `title`), comments,
  `script` and `style` are left as they are, and the replacement is written as text (`&`, `<`, `>`
  escaped).
- **Language:** i18n fields are read and written in the selected language only.
- `propertiesToReplace` limits the change to these property names; the UI always sends the list the
  user ticked. `null` means every text field.

### UI
- Language dropdown based on site active languages.
- Content-type dropdown based on editorial types and current result set.
- Date filters (start/end for created and modified).
- Result table with:
  - Full path
  - Parent container link (page/content-folder)
  - Match counters (`replaceable / total`)
  - Expandable row with matching properties preview
- Replace modal with preview and property selection.

## 3. Architecture

### Frontend (React + Moonstone)
- Registration bootstrap:
  - `src/javascript/init.js`
  - `src/javascript/AdminPanel.register.js`
- Route + app registration:
  - `src/javascript/AdminPanel/AdminPanel.routes.jsx`
- Main feature:
  - `src/javascript/SearchAndReplace/SearchAndReplace.jsx`
  - `src/javascript/SearchAndReplace/components/*`
  - `src/javascript/SearchAndReplace/utils/highlight.utils.jsx`

### Backend (GraphQL + OSGi + JCR)
- GraphQL extensions:
  - `src/main/java/org/jahia/modules/searchandreplace/graphql/SearchAndReplaceQueryExtension.java`
  - `src/main/java/org/jahia/modules/searchandreplace/graphql/SearchAndReplaceMutationExtension.java`
- Provider registration:
  - `src/main/java/org/jahia/modules/searchandreplace/graphql/SearchAndReplaceExtensionsProvider.java`
- GraphQL fields:
  - `src/main/java/org/jahia/modules/searchandreplace/graphql/SearchAndReplaceQueries.java` (read-only)
  - `src/main/java/org/jahia/modules/searchandreplace/graphql/SearchAndReplaceMutations.java` (writes)
  - `src/main/java/org/jahia/modules/searchandreplace/graphql/SiteAccess.java` (session and permission)
- Replacement rules (`src/main/java/org/jahia/modules/searchandreplace/service/`):
  - `ReplaceScope` (what belongs to a node), `TextFields` (which properties are text),
    `TextReplacer` (plain and rich text), `ReplaceEngine` (preview and write)
- Permission: `src/main/import/permissions.xml`

## 4. GraphQL Contract

The module adds `searchAndReplace` on `Query` (read-only fields) and on `Mutation` (the write).
graphql-java-annotations drops the `get` prefix of the Java methods: the fields are `nodeTypes` and
`nodeTypeProperties`.

### Query operations
- `searchNodes(termToSearch, siteKey, language, filters, limit, offset, deepSearch)`
- `nodeTypes(siteKey)`
- `nodeTypeProperties(nodeType)`
- `previewReplace(siteKey, nodeUuids, termToReplace, replacementTerm, language, propertiesToReplace, searchMode)`:
  for each node, every property `replaceInNodes` would change, without writing; a node that cannot be
  read gets an `error` instead of failing the call. The replace dialog shows this preview.

### Mutation operations
- `replaceInNodes(siteKey, nodeUuids, termToReplace, replacementTerm, language, propertiesToReplace, searchMode)`

### Input/Enums
- `InputSearchAndReplaceSearchFiltersInput` (generated from `SearchAndReplaceSearchFiltersInput`)
  - `nodeType`
  - `createdBefore`
  - `createdAfter`
  - `modifiedBefore`
  - `modifiedAfter`
  - `properties`
- `SearchAndReplaceSearchMode`
  - `EXACT_MATCH`
  - `CASE_INSENSITIVE`
  - `REGEX`

### Example search query
```graphql
query SearchNodesQuery(
  $termToSearch: String!
  $siteKey: String!
  $language: String!
  $filters: InputSearchAndReplaceSearchFiltersInput
) {
  searchAndReplace {
    searchNodes(
      termToSearch: $termToSearch
      siteKey: $siteKey
      language: $language
      filters: $filters
    ) {
      totalCount
      truncated
      nodes {
        uuid
        path
        displayName
        nodeType
        created
        lastModified
        parentContainerPath
        matchingProperties {
          name
          label
          value
          replaceable
        }
      }
    }
  }
}
```

### Example replace mutation
```graphql
mutation ReplaceInNodesMutation(
  $siteKey: String!
  $nodeUuids: [String!]!
  $termToReplace: String!
  $replacementTerm: String!
  $language: String!
  $propertiesToReplace: [String!]
  $searchMode: SearchAndReplaceSearchMode
) {
  searchAndReplace {
    replaceInNodes(
      siteKey: $siteKey
      nodeUuids: $nodeUuids
      termToReplace: $termToReplace
      replacementTerm: $replacementTerm
      language: $language
      propertiesToReplace: $propertiesToReplace
      searchMode: $searchMode
    ) {
      successfulNodes
      failedNodes
      totalPropertiesUpdated
      errors {
        nodeUuid
        nodePath
        message
      }
    }
  }
}
```

## 5. Security Notes

- **Permission:** every field that takes a site key requires the `searchAndReplace` permission on the
  site node. It is declared under `site-admin`, so `site-administrator` holds it; grant it to another
  role (Administration > Roles) to open the tool to editors. A missing site and a missing permission both
  answer `Permission denied`.
- **Caller's session:** every field runs with the calling user's session in the `default` workspace and
  the selected language. Search returns only nodes the user can read; a replacement fails on any node
  the user may not change (ACL, per-language write right, lock), reported per node in `failedNodes`.
- **Reads and writes are separate:** `replaceInNodes` exists on `Mutation` only.
- Replacement is bounded to the requested site path (`/sites/{siteKey}/`) and to the scope and text
  fields described in section 2.
- User inputs are validated (`siteKey`, `language`, `nodeType`, property names, regex pattern).
- HTML shown in previews/results is sanitized (scriptable elements and unsafe attributes removed).
- The jContent app is shown only to users holding the permission on a site where the module is enabled.
- A `REGEX` replacement stops after 2 seconds on one value (the node is reported as failed).
- Argument errors (invalid site key, too many nodes, invalid regular expression) are returned with their
  message.

## 6. Performance Notes

- Search runs the indexed full-text query; the traversal of every node of the site runs only with
  `deepSearch` and only when the index found nothing.
- Each result reads its node, its translation node and its content down to the next page, main resource
  or folder: sub-pages are not walked again under their parent.
- Result processing is deduplicated per resolved content node.
- Guardrails:
  - `limit`: default 200, maximum 1000 rows per search
  - 200 nodes per replacement and per preview
  - 2 seconds per value for a regular expression
  - `MAX_SCAN_CANDIDATES = 250000`
  - `MAX_SEARCH_TERM_LENGTH = 512`
  - `MAX_FILTER_PROPERTIES = 500`
- The replace dialog reuses the rows of the search instead of searching again.

## 7. Date Filter Behavior

- Date filters can be provided as:
  - `yyyy-MM-dd`
  - `dd/MM/yyyy`
  - `dd-MM-yyyy`
  - `MM/dd/yyyy`
  - ISO datetime formats
- `start` dates are interpreted as start-of-day.
- `end` dates are interpreted as end-of-day.

## 8. Build and Packaging

### Prerequisites
- JDK 17 and Maven 3.8, pinned in `mise.toml` (`mise install`). frontend-maven-plugin 2.0.1 needs
  JDK 17 (the classes still target Java 11); Maven 3.9 writes a wrong `Import-Package` while the build
  stays green.

### Standard build
```bash
mvn clean install
```

This build:
- Installs Node `v22.21.0` and Yarn `v1.22.22` via `frontend-maven-plugin`.
- Runs frontend build and produces module assets.
- Packages OSGi bundle:
  - `target/search-and-replace-1.1.0-SNAPSHOT.jar`

### Frontend-only build (local)
```bash
node --max_old_space_size=2048 ./node_modules/.bin/webpack --mode=production
```

## 9. Deployment

- Deploy `target/search-and-replace-1.1.0-SNAPSHOT.jar` using Jahia Module Manager or your deployment pipeline.
- Ensure the module is installed on the target site (`requireModuleInstalledOnSite: "search-and-replace"` is enforced in UI registration).

## 10. Developer Commands

```bash
yarn lint
yarn lint:fix
yarn dev
yarn build
mvn -q -DskipTests compile
```

### Tests

- Unit tests (`src/test/java`, run by `mvn install`): plain and rich text replacement, system names.
- Cypress (`tests/`, against a running Jahia with the module deployed): who may search and replace
  (site administrator allowed; an editor without the permission, another site's administrator and a
  write sent as a query refused, each checked past the API filter), the replacement scope, text fields,
  rich text, languages, and the primary flow in the jContent app.

```bash
cd tests && yarn install
JAHIA_URL=http://localhost:8080 SUPER_USER_PASSWORD=root1234 yarn e2e:ci
```

Fixture sites are built from `dx-base-demo-templates`; on an instance without it set
`CYPRESS_SNR_TEMPLATE_SET` to an installed template set (for example `classic-templates`).

- Mutation check of the guards: `scripts/mutation/run-mutants.sh` (same environment variables) disables
  each security or scope check in turn, redeploys, and expects its Cypress spec to fail.

## 11. Troubleshooting

### `Field 'searchAndReplace' in type 'Mutation' is undefined`
- Deployed bundle does not match current code or extension is not loaded.
- Check module state and restart/redeploy if needed.

### Query validation error on input type
- Use `InputSearchAndReplaceSearchFiltersInput` in GraphQL queries (generated input type name).

### No result for known richtext keyword
- Verify the selected language matches the translated content language.
- Validate the keyword with accents/diacritics exactly as expected; matching is accent-tolerant but language context still matters.

### Replacement fails on protected/read-only properties
- Protected properties are intentionally excluded from replacement.

### Local `yarn build:production` fails with lockfile/workspace mismatch
- Prefer Maven build (`mvn clean install`) which uses the module-pinned Yarn 1 toolchain.

## 12. Localization

- English: `src/main/resources/javascript/locales/en.json`
- French: `src/main/resources/javascript/locales/fr.json`

## 13. Repository Structure (Quick Map)

```text
src/main/java/org/jahia/modules/searchandreplace/graphql/   # GraphQL fields, session and permission
src/main/java/org/jahia/modules/searchandreplace/service/   # replacement scope, text fields, replacer
src/main/import/permissions.xml                             # searchAndReplace permission (under site-admin)
tests/                                                      # Cypress suite
scripts/mutation/                                           # mutation check of the guards
src/main/resources/javascript/locales/                      # i18n labels
src/javascript/AdminPanel/                                  # Jahia route registration
src/javascript/SearchAndReplace/                            # UI feature (search, filters, table, replace modal)
```

## 14. Agent harness

`.agents/` holds this module's architecture and decisions for AI agents and developers. Generic Jahia
knowledge (UI extensions, GraphQL security, Cypress) lives in the AIStartupKit harness it links to.
