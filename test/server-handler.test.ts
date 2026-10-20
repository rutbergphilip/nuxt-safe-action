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
  ])('preserves H3 body parsing for %s with csrf: off', async (contentType, body, value) => {
    const app = createApp().use(createActionHandler(createSafeActionClient().action(({ parsedInput }) => ({ value: parsedInput })), 'post', { csrf: 'off' }))
    const response = await toWebHandler(app)(new Request('http://localhost/action', {
      method: 'POST',
      headers: { 'content-type': contentType as string },
      body: body as string,
    }))
    expect(await response.json()).toEqual({ data: { value } })
  })

  it('accepts cross-site requests with csrf: off', async () => {
    const app = createApp().use(createActionHandler(createSafeActionClient().action(() => 'ok'), 'post', { csrf: 'off' }))
    const response = await toWebHandler(app)(new Request('http://localhost/action', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'origin': 'https://evil.example', 'sec-fetch-site': 'cross-site' },
      body: '{}',
    }))
    expect(await response.json()).toEqual({ data: 'ok' })
  })

  it.each(['input=%7Bbroken','input=1&input=2', 'input='])('rejects malformed GET input %s', async (query) => {
    const handler = vi.fn(() => 'read')
    const app = createApp().use(createActionHandler(createSafeActionClient().action(handler), 'get'))
    const response = await toWebHandler(app)(new Request(`http://localhost/action?${query}`))
    expect(await response.json()).toEqual({ validationErrors: { _errors: ['Invalid action input'] } })
    expect(handler).not.toHaveBeenCalled()
  })

  it('does not apply same-origin checks to GET actions', async () => {
    const app = createApp().use(createActionHandler(createSafeActionClient().action(() => 'read'), 'get'))
    const response = await toWebHandler(app)(new Request('http://localhost/action', {
      headers: { 'sec-fetch-site': 'cross-site', 'origin': 'https://evil.example' },
    }))
    expect(await response.json()).toEqual({ data: 'read' })
  })

  it('preserves missing input for actions without schemas', async () => {
    const app = createApp().use(createActionHandler(createSafeActionClient().action(({ parsedInput }) => ({ input: parsedInput ?? null })), 'get'))
    const response = await toWebHandler(app)(new Request('http://localhost/action'))
    expect(await response.json()).toEqual({ data: { input: null } })
  })
})

describe('csrf: strict (default)', () => {
  function post(headers: Record<string, string>, body?: BodyInit) {
    const handler = vi.fn(() => 'mutation')
    const app = createApp().use(createActionHandler(createSafeActionClient().action(handler), 'post'))
    return { handler, response: toWebHandler(app)(new Request('http://localhost/action', { method: 'POST', headers, body })) }
  }

  it.each([
    ['application/x-www-form-urlencoded', 'email=attacker%40example.com'],
    ['multipart/form-data; boundary=x', '--x\r\nContent-Disposition: form-data; name="email"\r\n\r\na\r\n--x--'],
    ['text/plain', '{"email":"attacker@example.com"}'],
  ])('rejects simple-request content type %s with 415 without executing', async (contentType, body) => {
    const { handler, response } = post({ 'content-type': contentType }, body)
    expect((await response).status).toBe(415)
    expect(handler).not.toHaveBeenCalled()
  })

  it('rejects a body without a content type with 415', async () => {
    const { handler, response } = post({}, new Blob(['{"email":"attacker@example.com"}']))
    expect((await response).status).toBe(415)
    expect(handler).not.toHaveBeenCalled()
  })

  it('treats an empty body without a content type as missing input', async () => {
    const { handler, response } = post({})
    expect(await (await response).json()).toEqual({ data: 'mutation' })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it.each(['cross-site', 'same-site'])('rejects Sec-Fetch-Site: %s with 403', async (site) => {
    const { handler, response } = post({ 'content-type': 'application/json', 'sec-fetch-site': site }, '{}')
    expect((await response).status).toBe(403)
    expect(handler).not.toHaveBeenCalled()
  })

  it.each(['https://evil.example', 'http://localhost.evil.example', 'null', 'not a url'])('rejects mismatched Origin %s with 403', async (origin) => {
    const { handler, response } = post({ 'content-type': 'application/json', origin }, '{}')
    expect((await response).status).toBe(403)
    expect(handler).not.toHaveBeenCalled()
  })

  it.each([
    [{ 'sec-fetch-site': 'same-origin', 'origin': 'http://localhost' }],
    [{ 'sec-fetch-site': 'none' }],
    [{}],
  ])('accepts same-origin JSON requests %o', async (headers) => {
    const { handler, response } = post({ 'content-type': 'application/json', ...headers }, '{}')
    expect(await (await response).json()).toEqual({ data: 'mutation' })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('compares Origin with X-Forwarded-Host behind a proxy', async () => {
    const { response } = post({ 'content-type': 'application/json', 'origin': 'https://app.example', 'x-forwarded-host': 'app.example' }, '{}')
    expect(await (await response).json()).toEqual({ data: 'mutation' })
  })
})
