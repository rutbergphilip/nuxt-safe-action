<p align="center">
  <img src="https://raw.githubusercontent.com/rutbergphilip/nuxt-safe-action/main/docs/public/social-card.png" alt="nuxt-safe-action social card" />
</p>

<h1 align="center">nuxt-safe-action</h1>

<p align="center">Type-safe server actions for Nuxt.</p>

<p align="center">
  <a href="https://npmjs.com/package/nuxt-safe-action"><img src="https://img.shields.io/npm/v/nuxt-safe-action/latest.svg?style=flat&colorA=020420&colorB=00DC82" alt="npm version" /></a>
  <a href="https://npm.chart.dev/nuxt-safe-action"><img src="https://img.shields.io/npm/dm/nuxt-safe-action.svg?style=flat&colorA=020420&colorB=00DC82" alt="npm downloads" /></a>
  <a href="https://npmjs.com/package/nuxt-safe-action"><img src="https://img.shields.io/npm/l/nuxt-safe-action.svg?style=flat&colorA=020420&colorB=00DC82" alt="License" /></a>
  <a href="https://nuxt.com"><img src="https://img.shields.io/badge/Nuxt-020420?logo=nuxt" alt="Nuxt" /></a>
</p>

Define actions on the server with Zod validation and middleware, and call them from the client with full type inference, reactive status tracking, and field-level validation errors.

```ts
// server/actions/create-post.ts
import { z } from 'zod'
import { actionClient } from '../utils/action-client'

export default actionClient
  .schema(z.object({
    title: z.string().min(1).max(200),
    body: z.string().min(1),
  }))
  .action(async ({ parsedInput }) => {
    const post = await db.post.create({ data: parsedInput })
    return { id: post.id, title: post.title }
  })
```

```vue
<script setup lang="ts">
import { createPost } from '#safe-action/actions'

const { execute, data, status, validationErrors } = useAction(createPost)
</script>
```

## Features

- **End-to-end type safety** - Input and output types flow from server to client automatically
- **Input validation** - Zod schemas validate input before your handler runs
- **Composable middleware** - Chain auth checks, logging, and more with typed context
- **Reactive composable** - `useAction` gives you `status`, `data`, `validationErrors`, and callbacks
- **Auto route generation** - Drop files in `server/actions/` and routes are created for you
- **H3Event access** - Full request context available in middleware and handlers
- **Nuxt-native** - Auto-imports, familiar conventions, works out of the box

## Quick Setup

Install the module:

```bash
npx nuxi module add nuxt-safe-action
```

Or manually:

```bash
pnpm add nuxt-safe-action zod
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['nuxt-safe-action'],
})
```

## Usage

### 1. Create an action client

```ts
// server/utils/action-client.ts
import { createSafeActionClient } from '#safe-action'

export const actionClient = createSafeActionClient({
  handleServerError: (error) => {
    console.error('Action error:', error.message)
    return error.message
  },
})

// You can also create an authenticated client by adding middleware
export const authActionClient = actionClient
  .use(async ({ next, event }) => {
    const session = await getUserSession(event)
    if (!session) throw new Error('Unauthorized')
    return next({ ctx: { userId: session.user.id } })
  })
```

### 2. Define actions

Create files in `server/actions/`. Each file should default-export an action:

```ts
// server/actions/greet.ts
import { z } from 'zod'
import { actionClient } from '../utils/action-client'

export default actionClient
  .schema(z.object({
    name: z.string().min(1, 'Name is required'),
  }))
  .action(async ({ parsedInput }) => {
    return { greeting: `Hello, ${parsedInput.name}!` }
  })
```

### 3. Use in components

```vue
<script setup lang="ts">
import { greet } from '#safe-action/actions'

const { execute, data, isExecuting, hasSucceeded, validationErrors } = useAction(greet, {
  onSuccess({ data }) {
    console.log(data.greeting) // fully typed!
  },
  onError({ error }) {
    console.error(error)
  },
})
</script>

<template>
  <form @submit.prevent="execute({ name: 'World' })">
    <button :disabled="isExecuting">
      {{ isExecuting ? 'Loading...' : 'Greet' }}
    </button>
    <p v-if="hasSucceeded">{{ data?.greeting }}</p>
  </form>
</template>
```

## API

### `createSafeActionClient(opts?)`

Creates a new action client. Call this once and reuse it across actions.

| Option | Type | Description |
|--------|------|-------------|
| `handleServerError` | `(error: Error) => string` | Transform server errors before sending to client |

### Builder chain

| Method | Description |
|--------|-------------|
| `.schema(zodSchema)` | Set input validation schema |
| `.outputSchema(zodSchema)` | Set output validation schema |
| `.use(middleware)` | Add middleware to the chain |
| `.metadata(meta)` | Attach metadata (accessible in middleware) |
| `.action(handler)` | Define the action handler (terminal) |

### `useAction(action, callbacks?)`

Vue composable for executing actions.

**Returns:**

| Property | Type | Description |
|----------|------|-------------|
| `execute(input)` | `(input: TInput) => void` | Fire-and-forget execution |
| `executeAsync(input)` | `(input: TInput) => Promise<ActionResult>` | Awaitable execution |
| `data` | `Ref<TOutput \| undefined>` | Success data |
| `serverError` | `Ref<string \| undefined>` | Server error message |
| `validationErrors` | `Ref<Record<string, string[]> \| undefined>` | Per-field validation errors |
| `status` | `Ref<ActionStatus>` | `'idle' \| 'executing' \| 'hasSucceeded' \| 'hasErrored'` |
| `isIdle` | `ComputedRef<boolean>` | Status shortcut |
| `isExecuting` | `ComputedRef<boolean>` | Status shortcut |
| `hasSucceeded` | `ComputedRef<boolean>` | Status shortcut |
| `hasErrored` | `ComputedRef<boolean>` | Status shortcut |
| `reset()` | `() => void` | Reset all state to initial |

**Callbacks:**

| Callback | Description |
|----------|-------------|
| `onSuccess({ data, input })` | Called when the action succeeds |
| `onError({ error, input })` | Called on server or validation error |
| `onSettled({ result, input })` | Called after every execution |
| `onExecute({ input })` | Called when execution starts |

### Middleware

```ts
actionClient.use(async ({ ctx, next, event, metadata, clientInput }) => {
  // ctx: context from previous middleware
  // event: H3Event with full request access
  // metadata: action metadata
  // clientInput: raw input before validation
  return next({ ctx: { ...ctx, myData: 'value' } })
})
```

Middleware must always call `next()`. If it doesn't, the action will throw an error.

### Error handling

```ts
import { ActionError, returnValidationErrors } from '#safe-action'

// Throw a server error
throw new ActionError('Not enough credits')

// Return per-field validation errors
returnValidationErrors({
  email: ['This email is already taken'],
})
```

## Configuration

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['nuxt-safe-action'],
  safeAction: {
    actionsDir: 'actions', // relative to server/ directory (default: 'actions')
  },
})
```

## How it works

1. You define actions in `server/actions/` using the builder chain
2. The module scans that directory and generates Nitro API routes at `/api/_actions/<name>`
3. A typed virtual module (`#safe-action/actions`) provides client-side references with full type inference
4. `useAction()` calls the generated route via `$fetch` and returns reactive state

## Inspiration

Inspired by [next-safe-action](https://github.com/TheEdoRan/next-safe-action), adapted for the Nuxt ecosystem.

## Contributing

<details>
  <summary>Local development</summary>

  ```bash
  # Install dependencies
  pnpm install

  # Generate type stubs
  pnpm run dev:prepare

  # Develop with the playground
  pnpm run dev

  # Build the playground
  pnpm run dev:build

  # Run ESLint
  pnpm run lint

  # Run Vitest
  pnpm run test
  pnpm run test:watch

  # Type check
  pnpm run test:types
  ```

</details>

## License

[MIT](./LICENSE)

