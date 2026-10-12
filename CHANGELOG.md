# Changelog

## v0.7.0

### Features

- Declare typed public business errors with `.errors()` and handler `fail()`, including optional typed field errors.
- Add nested field helpers, dirty/touched tracking, optional client validation, and `toFormErrors()` to form workflows.
- Refresh explicitly selected Nuxt data keys or registered tags after successful mutations, with separate refresh state/errors.
- Expand runnable profile examples and installed-package verification for business envelopes, query integration, and advanced forms.

### Compatibility

- Existing builder methods, `ActionError`, server error mapping, result fields, and basic form bindings continue to work.
- Nuxt owns query caching and hydration; validation libraries and UI components remain optional application choices.

## v0.6.0

### Features

- Standard Schema v1 validation with Zod, Valibot, ArkType, Yup 1.7+, and compliant validators; legacy Zod 3.20+ support retained.
- Input/output transform inference, default input handling, and asynchronous input/output validation.
- `useFormAction` with inferred values, snapshot submission, initial-value reset, and separate nested/root errors.
- `useOptimisticAction` with immutable updates, replacement of pending operations, guarded rollback, and application-controlled reconciliation.
- Explicit request cancellation, external abort signals, timeouts, dynamic headers, credential options, optional previous-request cancellation, and opt-in scope disposal.

### Fixes

- Older requests and reset-invalidated completions no longer overwrite current state or run completion callbacks.
- Successful void actions settle correctly; callback failures no longer turn valid results into failures or cause duplicate settlement.
- Both transports serialize JSON primitives consistently, and GET preserves explicit null input. Automatic mutation retries are disabled.
- Malformed JSON/GET input is rejected before the handler; validation paths safely preserve nested/root errors.
- Middleware continuations cannot execute a handler twice; already-started work is awaited even when middleware forgets to await `next()`.
- Route discovery uses deterministic ordering, handles explicit POST/custom directories and method variants, and rejects ambiguous names/collisions.
- Action-file additions/removals regenerate routes and references during development.

### Documentation and verification

- Working nested forms and optimistic success/rollback examples, Nuxt UI, authentication/ownership, Standard Schema, and Nuxt SSR-query recipes.
- Clarified detached transport and cancellation limits, result semantics, middleware context replacement, and error exposure.
- Native Yup input/output contracts, defaults, casting, asynchronous tests, and nested validation errors verified alongside the other supported validators.
- Nuxt 3/4 and Zod 3/4 CI matrix, additional validator/transport regression tests, packed-install checks, and documentation build in the release gate.
- Existing `execute(): void`, `executeAsync(): Promise<ActionResult>`, callback argument shapes, and single-method exports preserved.

## v0.5.0

### Features

- Added `detached: true` to select native browser fetch while preserving action-result and callback shapes.

### Clarification

- Selecting native fetch does not guarantee completion across page unload. Neither transport is automatically tied to component disposal; 0.6.0 makes cancellation and disposal behavior explicit.

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
