import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { once } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { $fetch } from 'ofetch'
import { createApp, toNodeListener } from 'h3'
import { z } from 'zod'
import { useAction } from '../src/runtime/composables/useAction'
import { createSafeActionClient } from '../src/runtime/server/createSafeActionClient'
import { createActionHandler } from '../src/runtime/server/handler'
import type { SafeActionReference } from '../src/runtime/types'

describe('actual HTTP action transport', () => {
  it.each([false, true])('round-trips JSON primitives and GET null with detached=%s', async (detached) => {
    const serverAction = createSafeActionClient()
      .schema(z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .action(({ parsedInput }) => parsedInput)
    const app = createApp().use('/api/_actions/test', createActionHandler(serverAction))
    const server = createServer(toNodeListener(app)).listen(0, '127.0.0.1')
    await once(server, 'listening')
    const baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const nativeFetch = globalThis.fetch
    vi.stubGlobal('$fetch', $fetch.create({ baseURL }))
    // Native browser fetch resolves relative paths against the page's origin.
    if (detached) vi.stubGlobal('fetch', (input: string, init: RequestInit) => nativeFetch(new URL(input, baseURL), init))
    try {
      for (const method of ['POST', 'GET']) {
        const reference = { __safeActionPath: 'test', __safeActionMethod: method } as unknown as SafeActionReference<string | number | boolean | null, string | number | boolean | null>
        const client = useAction(reference, { detached })
        for (const input of ['hello', null, false, 0]) {
          expect(await client.executeAsync(input)).toEqual({ data: input })
          expect(client.status.value).toBe('hasSucceeded')
        }
      }
    } finally {
      vi.unstubAllGlobals()
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  })
})
