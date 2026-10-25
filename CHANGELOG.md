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
- `previewReplace` is now a query that takes the arguments of `replaceInNodes` (`siteKey`, `nodeUuids`,
  `language`, `searchMode`) and returns, per node, every change it would make or an `error`. The replace
  dialog shows this server preview (the client preview was case-sensitive and showed no change).
- A folder covers only its own properties: selecting a content folder no longer rewrites its items.
- Search goes through the full-text index only; the scan of every node runs with `deepSearch` (the
  "Also find parts of words" box). `limit` defaults to 200 (maximum 1000), `offset` added.
- A match is replaceable only when the replacement would change it (other accents, split words: read-only).
- Each node is saved on its own: a failure discards that node's changes and keeps the others;
  `unchangedNodes` lists the nodes with nothing to replace. At most 200 nodes per call. One audit line
  per replacement.
- A regular expression runs for at most 2 seconds per value.
- Argument errors are returned with their message instead of "Internal Server Error(s)".
- The replace dialog reuses the search rows instead of running the search again, and says "Nothing was
  replaced" instead of "Replace failed" when nothing matched; selection is cleared on language change.

### Breaking

- Callers of the API need the `searchAndReplace` permission on the site.
- `previewReplace` moved from `Mutation` to `Query`, takes `nodeUuids` and returns a list.
- `searchNodes` returns at most 200 rows unless `limit` says otherwise (1000 at most), and no longer scans
  the site without `deepSearch: true`.
- `replaceInNodes` refuses more than 200 nodes.
