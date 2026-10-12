import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'

// Dev transformation differs from the production build: locally linked runtime
// classes must not autoimport themselves when used by their own helper functions.
describe('locally linked module dev startup', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/dev', import.meta.url)),
    dev: true,
    server: true,
    browser: false,
  })

  it('boots the dev server and executes an action using public server autoimports', async () => {
    expect(await $fetch('/')).toContain('linked module dev fixture')
    expect(await $fetch('/api/_actions/check', { method: 'POST', body: { mode: 'success' } })).toEqual({ data: { ok: true } })
  })

  it('preserves typed business errors and both public error-class helpers in dev', async () => {
    expect(await $fetch('/api/_actions/check', { method: 'POST', body: { mode: 'business' } })).toEqual({ businessError: { code: 'DENIED', message: 'Demonstration business rejection' } })
    expect(await $fetch('/api/_actions/check', { method: 'POST', body: { mode: 'field' } })).toEqual({ validationErrors: { mode: ['Choose another mode'] } })
    expect(await $fetch('/api/_actions/check', { method: 'POST', body: { mode: 'legacy' } })).toEqual({ serverError: 'Legacy public rejection' })
  })

  it('appends the module runtime exclusion while preserving Nitro defaults', async () => {
    const { exclusions, defaults } = await $fetch<{ exclusions: string[]; defaults: string[] }>('/api/import-options')
    expect(exclusions.some(pattern => pattern.includes('/runtime/server/'))).toBe(true)
    expect(exclusions.some(pattern => pattern.includes('node_modules'))).toBe(true)
    expect(exclusions.some(pattern => pattern.includes('\\.git'))).toBe(true)
    expect(defaults.length).toBeGreaterThan(0)
    expect(exclusions).toEqual(expect.arrayContaining(defaults))
    expect(defaults.some(pattern => pattern.includes('/runtime/server/'))).toBe(false)
  })
})
