import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, createPage, url } from '@nuxt/test-utils/e2e'

// Sandboxes ship Playwright's Chromium; GitHub's Ubuntu runners ship Google Chrome.
const bundled = process.env.PLAYWRIGHT_CHROMIUM_PATH || '/opt/pw-browsers/chromium'
const launch = existsSync(bundled) ? { executablePath: bundled } : { channel: 'chrome' }

describe('useActionQuery (browser)', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/query', import.meta.url)),
    browser: true,
    browserOptions: { type: 'chromium', launch },
  })

  it('hydrates without refetching and fetches each input under its own key', async () => {
    const page = await createPage()
    const requests: string[] = []
    page.on('request', (request) => { if (request.url().includes('/api/_actions/get-project')) requests.push(request.url()) })
    await page.goto(url('/'), { waitUntil: 'hydration' })
    expect(await page.textContent('#project')).toBe('Project alpha')
    expect(requests).toEqual([])

    await page.click('#beta')
    await page.waitForFunction(() => document.querySelector('#project')?.textContent === 'Project beta')
    expect(requests).toHaveLength(1)
    expect(decodeURIComponent(requests[0]!)).toContain('{"id":"beta"}')

    await page.click('#alpha')
    await page.waitForFunction(() => document.querySelector('#project')?.textContent === 'Project alpha')
    expect(await page.textContent('#status')).toBe('success')
    // Nuxt purges unused keys, so returning to an input refetches it rather than reading stale data.
    expect(requests).toHaveLength(2)
    expect(decodeURIComponent(requests[1]!)).toContain('{"id":"alpha"}')

    // A tagged mutation refreshes the query through useAction's success-only invalidation.
    await page.click('#rename')
    await page.waitForFunction(() => document.querySelector('#project')?.textContent === 'Renamed alpha')
    expect(requests).toHaveLength(3)
    await page.close()
  })
})
