import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'

describe('nuxt-safe-action (nuxt 3 compat)', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/nuxt3', import.meta.url)),
  })

  it('renders the index page', async () => {
    const html = await $fetch('/')
    expect(html).toContain('<div>nuxt3</div>')
  })

  it('executes a safe action and returns data', async () => {
    const result = await $fetch('/api/_actions/greet', {
      method: 'POST',
      body: { name: 'World' },
    })

    expect(result).toEqual({
      data: { greeting: 'Hello, World!' },
    })
  })

  it('returns validation errors for invalid input', async () => {
    const result = await $fetch<{ validationErrors?: Record<string, string[]> }>(
      '/api/_actions/greet',
      {
        method: 'POST',
        body: { name: '' },
      },
    )

    expect(result.validationErrors).toBeDefined()
    expect(result.validationErrors!.name).toContain('Name is required')
  })

  it('returns serverError when ActionError is thrown', async () => {
    const result = await $fetch<{ serverError?: string }>(
      '/api/_actions/throw-action-error',
      {
        method: 'POST',
        body: { shouldThrow: true },
      },
    )

    expect(result.serverError).toBe('Not enough credits')
  })

  it('returns validation errors from returnValidationErrors', async () => {
    const result = await $fetch<{ validationErrors?: Record<string, string[]> }>(
      '/api/_actions/throw-validation-error',
      {
        method: 'POST',
        body: { email: 'taken@example.com' },
      },
    )

    expect(result.validationErrors!.email).toContain('This email is already taken')
  })

  it('executes middleware chain and passes context', async () => {
    const result = await $fetch('/api/_actions/with-middleware', {
      method: 'POST',
      body: { name: 'Alice' },
    })

    expect(result).toEqual({
      data: {
        name: 'Alice',
        requestId: 'req-123',
        role: 'admin',
        timestamp: 1000,
      },
    })
  })

  it('handles nested directory actions', async () => {
    const result = await $fetch('/api/_actions/nested/deep-action', {
      method: 'POST',
      body: { message: 'hi' },
    })

    expect(result).toEqual({
      data: { reply: 'Nested: hi' },
    })
  })

  it('works without input schema', async () => {
    const result = await $fetch('/api/_actions/no-schema', {
      method: 'POST',
      body: { anything: 'goes' },
    })

    expect(result).toEqual({
      data: { echo: { anything: 'goes' } },
    })
  })
})
