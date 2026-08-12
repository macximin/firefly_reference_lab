# Evidence

`source_manifest.json` is the canonical registry for every analyzed work.

Each entry requires:

- `id`, `title`, and `ownerType` (`self` or `third_party`)
- `rightsStatus`: `owned`, `licensed`, `permission_granted`, or `public_domain`
- `sourceUrl` (or `null` only for a self-owned private manuscript)
- `accessedAt` in ISO-8601 format
- `sourceHash` for the local input, or `null` before the input is obtained

Do not add external works with `unknown`, `fair_use`, `purchased_only`, or other unverified statuses. A purchase alone is not a permission to redistribute the text.

For a verified local corpus, use `collections` rather than copying each source file. A collection records its local locator, clearance evidence, access date, count, size, and allowed scope. The source texts remain in their source repository.
