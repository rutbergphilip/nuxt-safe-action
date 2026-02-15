---
title: Home
description: Type-safe server actions for Nuxt with Zod validation, composable middleware, and reactive Vue composables.
navigation: false
layout: page
---

::u-page-hero
#title
Type-safe Server Actions for [Nuxt]{style="color: var(--color-primary-500)"}

#description
Define actions on the server with Zod validation and middleware. Call them from the client with full type inference, reactive status tracking, and field-level validation errors.

#links
  :::u-button
  ---
  to: /getting-started/installation
  trailing-icon: i-lucide-arrow-right
  ---
  Get Started
  :::

  :::u-button
  ---
  color: neutral
  variant: outline
  icon: i-simple-icons-github
  to: https://github.com/rutbergphilip/nuxt-safe-action
  target: _blank
  ---
  View on GitHub
  :::
::

::code-group
```ts [server/actions/create-post.ts]
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

```vue [app/components/CreatePost.vue]
<script setup lang="ts">
import { createPost } from '#safe-action/actions'

const { execute, data, isExecuting, validationErrors } = useAction(createPost, {
  onSuccess({ data }) {
    console.log('Created:', data.title)
  },
})
</script>

<template>
  <form @submit.prevent="execute({ title: 'Hello', body: 'World' })">
    <button :disabled="isExecuting">Create Post</button>
    <p v-if="data">Created: {{ data.title }}</p>
  </form>
</template>
```
::

::card-group
  ::card{icon="i-heroicons-shield-check" title="End-to-end Type Safety"}
  Input and output types flow from server to client automatically. No manual type definitions needed.
  ::

  ::card{icon="i-heroicons-check-badge" title="Input Validation"}
  Zod schemas validate input before your handler runs. Validation errors are returned per-field.
  ::

  ::card{icon="i-heroicons-queue-list" title="Composable Middleware"}
  Chain auth checks, logging, rate limiting, and more with fully typed context passing.
  ::

  ::card{icon="i-heroicons-arrow-path" title="Reactive Composable"}
  `useAction` gives you `status`, `data`, `validationErrors`, and lifecycle callbacks out of the box.
  ::

  ::card{icon="i-heroicons-folder" title="Auto Route Generation"}
  Drop files in `server/actions/` and API routes are created for you. Zero configuration.
  ::

  ::card{icon="i-heroicons-server" title="H3Event Access"}
  Full request context available in middleware and handlers. Read cookies, headers, sessions.
  ::

  ::card{icon="i-heroicons-puzzle-piece" title="Nuxt-native"}
  Auto-imports, familiar conventions, and works out of the box with your Nuxt app.
  ::
::
