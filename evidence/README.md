# Evidence

`source_manifest.json` is the legacy analysis register for existing work-specific
analyses. It is not a private-source resolver allowlist and must not be used by
the Phase 7 Soul or Storyyard source-slice path.

Each entry requires:

- `id` and `title`
- `sourceLocator`
- `accessedAt` in ISO-8601 format
- `sourceHash` for the local input, or `null` before the input is obtained

For a local corpus, use `collections` rather than copying each source file. A collection records its local locator, access date, count, and size. The source texts remain in the Lab's Git-excluded input folders.

The Phase 7 male-genre inventory is
`genre-souls/male-source-inventory.v1.json`. Its paired
`male-source-registry-receipt.v1.json` hashes the ignored private registry in
`exports/source-registry/`. An item is still unusable for Soul input until it
has a full local SHA-256, no provider-size drift, an explicit manager genre
classification, coverage evidence, and manager QA. Empty manifests, absolute
paths, remote-only files, and drifted local copies remain fail-closed.
