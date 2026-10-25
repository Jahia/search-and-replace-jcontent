# Architecture and decisions

## Pieces

- `graphql/SearchAndReplaceQueryExtension` and `SearchAndReplaceMutationExtension`: `Query.searchAndReplace`
  returns `SearchAndReplaceQueries` (search, preview, node types), `Mutation.searchAndReplace` returns
  `SearchAndReplaceMutations` (`replaceInNodes`). Never one class for both roots: its writes would be
  reachable from `Query`.
- `graphql/SiteAccess`: the caller's session (`default` workspace, the selected language) and the
  `searchAndReplace` permission check on the site node. Refusals are `BaseGqlClientException` with
  no error type (no graphql-java import; a message GraphQL does not hide).
- `graphql/InputValidation`: allow-lists for every argument, limits (200 rows by default, 1000 max,
  200 nodes per replacement).
- `service/ReplaceScope`, `TextFields`, `TextReplacer`, `ReplaceEngine`: the rules below, shared by
  search (the `replaceable` flag), preview and replace.
- `src/main/import/permissions.xml`: `searchAndReplace` under `site-admin`.
- UI: `AdminPanel` (permission and module gate, `key={siteKey}`), `SearchAndReplace` (LayoutContent +
  Header + cards), `ResultsTable` (Moonstone DataTable), `ReplaceModal` (Moonstone Modal, server preview).

## Rules of a replacement

- **Who:** the caller's own session; the `searchAndReplace` permission on the site. Never a system
  session: the repository enforces ACLs, per-language write rights and locks on every node.
- **Scope:** the selected node and its content down to the next page, main resource or folder. A folder
  or the site covers only its own properties. Search rows list the same scope.
- **Text fields only:** non-protected `string` properties edited as small text, text area or rich text,
  with no value constraint, outside `jcr:`/`j:`/`wem:`/`rep:`/`mix:`/`nt:` (except `jcr:title` and
  `jcr:description`).
- **Rich text:** only the text between tags; the replacement is escaped as text.
- **Language:** i18n fields in the selected language only.
- **Per node:** one save per node; a failure discards that node's changes and keeps the others.
- **Regular expressions:** at most 2 s per value.
- Nothing is published: the editor publishes as usual.

## Decisions

- 2026-10-25: P0 fixes of the review (system session, scope, text fields), then P1 (search cost,
  batches, preview), then P2 (Moonstone UI, wording, toolchain). See `CHANGELOG.md`.
- Search stays accent- and markup-insensitive while replace is not: such matches are shown read-only
  rather than replaced with a guess.
- The full scan of a site runs only on request (`deepSearch`).
- Open: create a version before writing (team decision); move the repository to the Jahia org and
  release from CI.
