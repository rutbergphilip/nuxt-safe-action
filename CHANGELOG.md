# Changelog

## v0.8.1

First npm release of the 0.8 line: v0.8.0 was tagged but not published to npm, so upgrading from 0.7 also applies the v0.8.0 changes below.

### Behavior changes

- **A run that delivered `onSuccess`/`onError` now always finishes its lifecycle.** Calling `reset()` or starting another execution from those callbacks clears reactive state but no longer cancels that run's `invalidate` refresh or `onSettled`. Previously `onSuccess() { reset() }` silently skipped both. Stale runs and runs cancelled before their response still deliver nothing.

### Features

- Middleware receives `fail()` for business errors declared by `.errors()` earlier in the chain, so shared auth clients can return typed codes such as `UNAUTHORIZED` instead of a `serverError` string.
- `useFormAction({ rebaseOnSuccess: true })` makes the submitted snapshot the new initial values after a successful submission, clearing `isDirty`.
- Public `nuxt-safe-action/server` entry exports the server API, including `createActionHandler`, for running actions in tests outside Nuxt.

### Fixes

- `h3` is now a declared dependency. The server runtime imports it, which failed under strict pnpm installs.
- `setFieldValue`, `getFieldValue` and the other path helpers infer the value type without an explicit generic. With a single possible path, such as a one-field form, the value was typed `never`.

### Documentation

- Use `return fail(...)`: TypeScript does not narrow after calling a destructured `never` function.
- Mark version-specific features, document typed `serverError` limits, and add a testing guide.

## v0.8.0

### Breaking changes

- **Same-origin protection is on by default.** Non-GET action routes accept only same-origin JSON (`safeAction.csrf: 'strict'`). Form-urlencoded, multipart, `text/plain` and untyped bodies return `415`; a cross-site `Sec-Fetch-Site` or mismatched `Origin` returns `403` (`X-Forwarded-Host` is honored behind proxies). `useAction` and `useFormAction` already send same-origin JSON. Set `safeAction: { csrf: 'off' }` to restore 0.7 body parsing.
- **Actions without `.schema()` type `parsedInput` as `unknown`** instead of `undefined`, matching the raw client input they receive. Type-only; narrow the value before use.
- **Nuxt 3.8.0 or newer is required.** The module always relied on `addServerImports` from `@nuxt/kit` 3.8; the declared range now says so, and CI tests 3.8.0 alongside the latest Nuxt 3 and 4.

### Features

- `handleServerError(error, { event, metadata, clientInput })` receives request context for logging and mapping. Existing one-argument mappers keep working.
- Unexpected errors are logged on the server when no mapper is configured or the mapper throws. Logs include the method and pathname, never the query string that carries GET input.
- 4xx H3 errors such as `createError({ statusCode: 401, statusMessage: 'Unauthorized' })` keep their public message instead of the generic fallback when no mapper is configured. 5xx errors stay masked.
- `clientError` on `useAction`, `useFormAction` and results distinguishes client-side failures: `network`, `http` (with `status`), `timeout`, `aborted`, `invalid-response`, `invalid-reference`. `serverError` still carries the message for compatibility.
- `useOptimisticAction({ mode: 'merge' })` keeps overlapping optimistic updates against a confirmed base and rolls back only the update that failed, without cancelling earlier requests. `mode: 'replace'` remains the default.
- `useFormAction().setInitialValues(values, { keepValues? })` rebases dirty tracking on data loaded after setup; `initialValues` is exposed as a readonly ref.

### Fixes

- `isDirty`, `dirtyFields` and `isFieldDirty` no longer go stale after their first read; nested edits are tracked reactively.
- Non-plain form values (`File`, `Map`, class instances) are kept by reference and compared by identity, with a one-time warning, instead of silently becoming `{}`.
- Removed the unused `defu` dependency.

### Documentation

- Same-origin protection, error context and `clientError`, async form initial values, plain-data form values, and optimistic `merge` mode.
- Comparison page updated with business errors, form state, same-origin protection and middleware/validation order, checked against nuxt-actions 1.3.0.

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
