import { describe, expect, it, vi } from 'vitest'
import { createApp, toWebHandler } from 'h3'
import { createActionHandler } from '../src/runtime/server/handler'
import { createSafeActionClient } from '../src/runtime/server/createSafeActionClient'

describe('request parsing', () => {
  it.each(['application/json', 'application/json; charset=utf-8', 'Application/JSON; charset=UTF-8', 'application/problem+json'])('rejects malformed JSON for %s without executing mutations', async (contentType) => {
    const handler = vi.fn(() => 'mutation')
    const app = createApp().use(createActionHandler(createSafeActionClient().action(handler), 'post'))
    const response = await toWebHandler(app)(new Request('http://localhost/action', {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: '{broken',
    }))
    expect(await response.json()).toEqual({ validationErrors: { _errors: ['Invalid action input'] } })
    expect(handler).not.toHaveBeenCalled()
  })

  it.each(['NaN', 'Infinity', 'undefined', '"literal\nnewline"'])('rejects JavaScript literals and invalid JSON strings: %s', async (body) => {
    const handler = vi.fn(() => 'mutation')
    const app = createApp().use(createActionHandler(createSafeActionClient().action(handler), 'post'))
    const response = await toWebHandler(app)(new Request('http://localhost/action', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }))
    expect(await response.json()).toEqual({ validationErrors: { _errors: ['Invalid action input'] } })
    expect(handler).not.toHaveBeenCalled()
  })

  it.each(['null', 'false', '0', '"text"', '{}'])('preserves valid JSON primitive/object input %s', async (body) => {
    const handler = vi.fn(({ parsedInput }) => ({ value: parsedInput }))
    const app = createApp().use(createActionHandler(createSafeActionClient().action(handler), 'post'))
    const response = await toWebHandler(app)(new Request('http://localhost/action', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body,
    }))
    expect(await response.json()).toEqual({ data: { value: JSON.parse(body) } })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it.each([undefined, ''])('preserves empty JSON body as missing input', async (body) => {
    const handler = vi.fn(({ parsedInput }) => ({ missing: parsedInput === undefined }))
    const app = createApp().use(createActionHandler(createSafeActionClient().action(handler), 'post'))
    const response = await toWebHandler(app)(new Request('http://localhost/action', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }))
    expect(await response.json()).toEqual({ data: { missing: true } })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['application/x-www-form-urlencoded', 'name=Alice', { name: 'Alice' }],
    ['text/plain', 'hello', 'hello'],
  ])('preserves existing H3 body parsing for %s', async (contentType, body, value) => {
    const app = createApp().use(createActionHandler(createSafeActionClient().action(({ parsedInput }) => ({ value: parsedInput })), 'post'))
    const response = await toWebHandler(app)(new Request('http://localhost/action', {
      method: 'POST',
      headers: { 'content-type': contentType as string },
      body: body as string,
    }))
    expect(await response.json()).toEqual({ data: { value } })
  })

  it.each(['input=%7Bbroken', 'input=1&input=2', 'input='])('rejects malformed GET input %s', async (query) => {
    const handler = vi.fn(() => 'read')
    const app = createApp().use(createActionHandler(createSafeActionClient().action(handler), 'get'))
    const response = await toWebHandler(app)(new Request(`http://localhost/action?${query}`))
    expect(await response.json()).toEqual({ validationErrors: { _errors: ['Invalid action input'] } })
    expect(handler).not.toHaveBeenCalled()
  })

  it('preserves missing input for actions without schemas', async () => {
    const app = createApp().use(createActionHandler(createSafeActionClient().action(({ parsedInput }) => ({ input: parsedInput ?? null })), 'get'))
    const response = await toWebHandler(app)(new Request('http://localhost/action'))
    expect(await response.json()).toEqual({ data: { input: null } })
  })
})
