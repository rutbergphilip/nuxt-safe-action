import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'

describe('nuxt-safe-action', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/basic', import.meta.url)),
  })

  it('renders the index page', async () => {
    const html = await $fetch('/')
    expect(html).toContain('<div>basic</div>')
  })

  it('executes a safe action via the generated route', async () => {
    const result = await $fetch('/api/_actions/greet', {
      method: 'POST',
      body: { name: 'World' },
    })

    expect(result).toEqual({
      data: { greeting: 'Hello, World!' },
    })
  })

  it('returns validation errors for invalid input', async () => {
    const result = await $fetch<{ validationErrors?: Record<string, string[]> }>('/api/_actions/greet', {
      method: 'POST',
      body: { name: '' },
    })

    expect(result.validationErrors).toBeDefined()
    expect(result.validationErrors!.name).toContain('Name is required')
  })

  it('handles missing input gracefully', async () => {
    const result = await $fetch<{ validationErrors?: Record<string, string[]> }>('/api/_actions/greet', {
      method: 'POST',
      body: {},
    })

    expect(result.validationErrors).toBeDefined()
  })
})
