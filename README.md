<p align="center">
  <img src="https://raw.githubusercontent.com/rutbergphilip/nuxt-safe-action/main/docs/public/social-card.png" alt="nuxt-safe-action social card" />
</p>

# nuxt-safe-action

[![npm version](https://img.shields.io/npm/v/nuxt-safe-action/latest.svg?style=flat&colorA=020420&colorB=00DC82)](https://npmjs.com/package/nuxt-safe-action)
[![npm downloads](https://img.shields.io/npm/dm/nuxt-safe-action.svg?style=flat&colorA=020420&colorB=00DC82)](https://npm.chart.dev/nuxt-safe-action)
[![License](https://img.shields.io/npm/l/nuxt-safe-action.svg?style=flat&colorA=020420&colorB=00DC82)](./LICENSE)

Type-safe server actions for Nuxt, with validated contracts and predictable form errors.

Define actions in `server/actions/`, compose typed middleware, and import generated references into Vue components. Use Zod, Valibot, ArkType, Yup, or another Standard Schema v1 validator. Yup requires version 1.7 or newer. Existing Zod 3 and 4 actions keep working.

[Documentation](https://nuxt-safe-action.vercel.app) · [Runnable example](./example) · [StackBlitz](https://stackblitz.com/github/rutbergphilip/nuxt-safe-action/tree/main/example) · [Changelog](./CHANGELOG.md)

## Advanced forms and mutations

Version 0.7 adds declared business failures, nested form state, and successful-mutation refresh of ordinary Nuxt queries. Existing builder methods, error envelopes and basic form bindings remain compatible.

```ts
const action = createSafeActionClient()
  .schema(profileSchema)
  .errors({ EMAIL_TAKEN: 'This email is already registered' })
  .action(({ parsedInput, fail }) => {
    if (parsedInput.profile.email === 'taken@example.com') {
      fail('EMAIL_TAKEN', { validationErrors: { 'profile.email': ['Use a different email'] } })
    }
    return { profile: parsedInput.profile }
  })
```

`useFormAction` adds typed field getters/setters, dirty/touched tracking, and optional client validation while preserving raw submission snapshots and newer edits. `toFormErrors()` adapts dotted errors to `{ name, message }` UI messages, keeping root errors separate.

Register an ordinary `useAsyncData` key with `useActionQueryTags(key, ['profiles'])`, then use `invalidate: { keys, tags }` on a mutation. Successful latest executions refresh matching Nuxt keys; failures, stale requests, and cancellation do not. Refresh errors stay separate from successful writes. Nuxt continues to own caching and hydration.

[Advanced runnable profile form](./example) · [Forms](https://nuxt-safe-action.vercel.app/guide/forms) · [Business errors](https://nuxt-safe-action.vercel.app/guide/error-handling) · [Query refresh](https://nuxt-safe-action.vercel.app/guide/queries)

## Quick setup

```bash
npx nuxi module add nuxt-safe-action
pnpm add zod
# Alternatives: pnpm add valibot, pnpm add arktype, or pnpm add yup@^1.7.0
```

Or install manually:

```bash
pnpm add nuxt-safe-action zod
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({ modules: ['nuxt-safe-action'] })
```

The module requires a Nuxt server deployment for actions. A static-only export cannot execute them. Nuxt 3 and 4 are supported; use the Node version required by your Nuxt release.

```ts
// server/utils/action-client.ts
import { createSafeActionClient } from '#safe-action'

export const actionClient = createSafeActionClient({
  handleServerError(error) {
    console.error('Action failed:', error)
    return 'Something went wrong. Please try again.'
  },
})
```

```ts
// server/actions/create-post.ts
import { z } from 'zod'
import { actionClient } from '../utils/action-client'

export default actionClient
  .schema(z.object({ title: z.string().trim().min(1).max(200) }))
  .outputSchema(z.object({ id: z.string(), title: z.string() }))
  .action(({ parsedInput }) => ({
    id: crypto.randomUUID(),
    title: parsedInput.title,
  }))
// Demonstration response; connect your own persistence in the handler.
```

```vue
<script setup lang="ts">
import { createPost } from '#safe-action/actions'

const { values, submit, data, fieldErrors, rootErrors, serverError, isExecuting } =
  useFormAction(createPost, { initialValues: { title: '' } })
</script>

<template>
  <form @submit.prevent="submit()">
    <label for="title">Title</label>
    <input id="title" v-model="values.title" :aria-invalid="Boolean(fieldErrors.title)" />
    <p v-for="message in fieldErrors.title" :key="message">{{ message }}</p>
    <p v-for="message in rootErrors" :key="message" role="alert">{{ message }}</p>
    <p v-if="serverError" role="alert">{{ serverError }}</p>
    <button :disabled="isExecuting">{{ isExecuting ? 'Creating…' : 'Create' }}</button>
    <p v-if="data">Created: {{ data.title }}</p>
  </form>
</template>
```

## Features

- Input and output inference through generated client references, including schema transforms.
- Standard Schema v1 validation, asynchronous refinements, and legacy Zod 3.20+ parsing.
- Immutable builder chains, metadata, H3 request access, and typed middleware context.
- Nested field errors, root errors, intentional `ActionError` messages, and generic unexpected failures.
- `useAction` with latest-execution state ownership, cancellation, timeouts, headers, and callbacks.
- `useFormAction` with typed values, submission snapshots, and reset.
- `useOptimisticAction` with guarded rollback and application-controlled reconciliation.
- POST by default, GET/POST/PUT/PATCH/DELETE filename suffixes, nested directories, and development route regeneration.

## Choose the right abstraction

| Approach | Integration | Good fit |
|---|---|---|
| Nuxt `$fetch` / `useFetch` | Ordinary Nitro routes; choose your validation/error contract | Direct HTTP APIs or existing endpoints |
| `nuxt-safe-action` | Dedicated action directory, typed builder, consistent result envelope | Validated forms and mutations with explicit middleware |
| [`nuxt-actions`](https://billymaulana.github.io/nuxt-actions/) | Broader action toolkit with query/cache, streaming, uploads, OpenAPI, and other tooling | Applications wanting those built-in abstractions |

Both action libraries offer schema validation, typed middleware, output validation, and optimistic updates. This module concentrates on the form and mutation path and composes with Nuxt's existing query tools. No speed, bundle-size, or security superiority is implied. See the [comparison guide](https://nuxt-safe-action.vercel.app/guide/comparison).

## API essentials

```ts
const action = createSafeActionClient()
  .use(async ({ ctx, next }) => next({ ctx: { ...ctx, requestLabel: 'example' } }))
  .metadata({ name: 'greet' })
  .schema(z.object({ name: z.string() }))
  .outputSchema(z.object({ greeting: z.string() }))
  .action(({ parsedInput, ctx, event }) => ({ greeting: `Hello, ${parsedInput.name}` }))
```

`next({ ctx })` replaces the previous context. Spread `...ctx` to preserve earlier fields. Call `next()` exactly once on the successful path; throw to reject the request. Middleware receives raw input; schema validation happens before the handler.

| Client method | Behavior |
|---|---|
| `execute(input)` | Starts execution; returns `void` |
| `executeAsync(input)` | Resolves `{ data?, businessError?, serverError?, validationErrors? }`; does not unwrap data |
| `cancel()` | Invalidates pending updates, aborts owned requests, returns status to idle |
| `reset()` | Cancels pending execution and clears result state |

Only the latest execution updates reactive state and runs completion callbacks. Every execution promise still resolves its own result. Callback exceptions are logged and do not turn a successful result into a failure. Cancellation cannot undo a mutation that already reached the server. Automatic transport retries are disabled.

```ts
const { executeAsync, cancel } = useAction(createPost, {
  timeout: 10_000,
  cancelPrevious: true,
  abortOnDispose: true, // opt-in; false by default
  headers: () => ({ 'X-Request-Source': 'editor' }),
  credentials: 'same-origin',
  onSuccess({ data, input }) { console.log(data.id) },
  onError({ error, input }) { console.error(error) },
  onSettled({ result, input }) { /* latest completion only */ },
})
```

`detached: true` selects native browser `fetch`. Both transports can continue across SPA navigation unless explicitly cancelled; neither guarantees completion across page unload. [Full client reference](https://nuxt-safe-action.vercel.app/api/use-action).

## Recipes

- [HTML forms and Nuxt UI nested field errors](https://nuxt-safe-action.vercel.app/guide/forms)
- [Authentication, ownership, and output allowlists](https://nuxt-safe-action.vercel.app/guide/authentication)
- [Optimistic updates and rollback](https://nuxt-safe-action.vercel.app/guide/optimistic-updates)
- [GET actions with Nuxt `useAsyncData`](https://nuxt-safe-action.vercel.app/guide/queries)
- [Validator choice, transforms, and async refinements](https://nuxt-safe-action.vercel.app/guide/validation)

## Configuration

```ts
export default defineNuxtConfig({
  modules: ['nuxt-safe-action'],
  safeAction: {
    actionsDir: 'actions', // relative to serverDir
    csrf: 'strict', // non-GET actions require same-origin JSON; 'off' to opt out
  },
})
```

## Development

```bash
pnpm install
pnpm dev:prepare
pnpm dev
pnpm verify
```

The verification command runs lint, types, tests, build, packed-install smoke validation, and documentation build. CI covers Nuxt 3/4 with Zod 3/4; validator tests also cover Valibot, ArkType, and Yup. See [contributing](./CONTRIBUTING.md) and [security reporting](./SECURITY.md).

## Inspiration and license

Inspired by [next-safe-action](https://github.com/TheEdoRan/next-safe-action), adapted for Nuxt. [MIT](./LICENSE).
