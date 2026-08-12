# Evidence

`source_manifest.json` is the canonical registry for every analyzed work.

Each entry requires:

- `id` and `title`
- `sourceLocator`
- `accessedAt` in ISO-8601 format
- `sourceHash` for the local input, or `null` before the input is obtained

For a local corpus, use `collections` rather than copying each source file. A collection records its local locator, access date, count, and size. The source texts remain in the Lab's Git-excluded input folders.
