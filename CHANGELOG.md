# Changelog

## 1.1.0 (unreleased)

### Security

- Every field runs with the calling user's session instead of a system session: search returns only
  readable nodes, and a replacement fails on nodes the user may not change.
- New `searchAndReplace` permission, declared under `site-admin` (held by site administrators), required
  on the site by every field that takes a site key. The jContent app is shown only to users holding it.
- `replaceInNodes` is no longer reachable from `Query`: reads are on `Query.searchAndReplace`, the write on
  `Mutation.searchAndReplace` only.

### Changed

- A replacement covers the selected node and its content down to the next page, main resource or folder:
  selecting a page no longer rewrites its sub-pages. Search rows list the same scope.
- Only text fields are replaced (small text, text area, rich text; no choicelists, no system properties
  except `jcr:title` and `jcr:description`). URLs, tags and segment definitions are left untouched.
- Rich text: only the text between tags is replaced; links, attributes, comments, scripts and styles are
  kept.
- The replace dialog always sends the list of properties the user ticked.
- `previewReplace` is now a query that takes the same arguments as `replaceInNodes` (`siteKey`,
  `language`, `searchMode` added) and lists every change it would make.

### Breaking

- Callers of the API need the `searchAndReplace` permission on the site.
- `previewReplace` moved from `Mutation` to `Query` with new required arguments.
