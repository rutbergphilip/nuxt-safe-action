# Changelog

## v0.4.0

### Features

- **Zod v4 support** — Added `zod@^4.0.0` as an accepted peer dependency alongside `zod@^3.20.0`. Both versions work out of the box with no code changes required.

## v0.3.0

### Features

- **HTTP method suffixes for action files** — matching the Nuxt `server/api/` convention:

  | File | Method | Route |
  |------|--------|-------|
  | `server/actions/create-post.ts` | POST (default) | `/api/_actions/create-post` |
  | `server/actions/get-user.get.ts` | GET | `/api/_actions/get-user` |
  | `server/actions/update-user.put.ts` | PUT | `/api/_actions/update-user` |
  | `server/actions/remove-item.delete.ts` | DELETE | `/api/_actions/remove-item` |

- GET actions serialize input as `?input=...` query params
- POST/PUT/PATCH/DELETE actions use the request body
- `useAction` handles method and serialization automatically
- Non-breaking: files without a suffix continue to use POST

### Other Changes

- Removed redundant section banner comments across codebase
- Updated docs with HTTP method suffix guide and examples
- Added playground GET action example

## v0.2.1

### Bug Fixes

- **Fix `npx nuxt module add` failing with `ERR_PACKAGE_PATH_NOT_EXPORTED`** — Added `default` export condition to the package exports map so the module can be resolved in both ESM and CJS contexts.

## v0.2.0

### Features

- **Nuxt 3 compatibility** — The module now works with Nuxt 3 (>=3.0.0) in addition to Nuxt 4. Tested against both Nuxt 3.21 and Nuxt 4.3.
- **Comprehensive test suite** — 33 tests covering all major features: input validation, ActionError, returnValidationErrors, handleServerError, output schema validation, middleware chaining, metadata, nested directory actions, and route generation.

### Bug Fixes

- **Middleware next() enforcement** — Middleware that forgets to call `next()` now throws a descriptive error instead of silently failing.

### Improvements

- CI now runs a test matrix against both Nuxt 3 and Nuxt 4.
- Added `engines` field (`node >= 18`) to package.json.
- Tightened zod peer dependency to `^3.20.0`.
- README rewritten for clarity.

## v0.1.1

### Enhancements

- Initial nuxt-safe-action module ([1cc1719](https://github.com/rutbergphilip/nuxt-safe-action/commit/1cc1719))

### Contributors

- Philip Rutberg ([@rutbergphilip](https://github.com/rutbergphilip))
