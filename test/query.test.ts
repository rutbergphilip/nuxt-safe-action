import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'
import { actionQueryKey } from '../src/runtime/utils/queryKey'

describe('useActionQuery (SSR)', async () => {
  await setup({ rootDir: fileURLToPath(new URL('./fixtures/query', import.meta.url)) })

  it('renders typed data and serializes the envelope under a per-input key', async () => {
    const html = await $fetch<string>('/')
    const key = actionQueryKey('get-project', { id: 'alpha' })
    expect(html).toContain('<p id="project">Project alpha</p>')
    expect(html).toContain(`<p id="project-key">${key}</p>`)
    expect(html).toContain(key)
  })

  it('renders a declared business error from SSR as an error status', async () => {
    expect(await $fetch<string>('/')).toContain('<p id="missing">error:NOT_FOUND</p>')
  })

  it('forwards the session cookie during SSR only when allowed', async () => {
    const html = await $fetch<string>('/', { headers: { cookie: 'session=ada' } })
    expect(html).toContain('<p id="me">ada</p>')
    expect(html).toContain('<p id="anonymous">anonymous</p>')
  })
})
