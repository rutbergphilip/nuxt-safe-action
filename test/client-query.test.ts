import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useActionQuery } from '../src/runtime/composables/useActionQuery'
import { actionQueryKey, stableStringify } from '../src/runtime/utils/queryKey'
import { resolveQueryKeys } from '../src/runtime/utils/queryTags'
import { asyncDataCalls, resetNuxtApp, setRequestHeaders, useNuxtApp } from './mocks/nuxt-app'
import { setReactiveAsyncDataKeys } from './mocks/safe-action-config'
import type { SafeActionReference } from '../src/runtime/types'

type Project = { id: string, name: string }
type NotFound = { code: 'NOT_FOUND', message: string }
const getProject = { __safeActionPath: 'get-project', __safeActionMethod: 'GET' } as unknown as SafeActionReference<{ id: string }, Project, string, NotFound>
const whoami = { __safeActionPath: 'whoami', __safeActionMethod: 'GET' } as unknown as SafeActionReference<void, { user: string }>

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((yes) => { resolve = yes })
  return { promise, resolve }
}
function stubFetch(respond: (url: string, init: { headers: Headers, signal: AbortSignal }) => unknown) {
  const fetcher = vi.fn((url: string, init: { headers: Headers, signal: AbortSignal }) => Promise.resolve(respond(url, init)))
  vi.stubGlobal('$fetch', fetcher)
  return fetcher
}
function inputOf(url: string) { return JSON.parse(new URL(url, 'http://x').searchParams.get('input')!) }

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); resetNuxtApp(); setReactiveAsyncDataKeys(true) })

describe('query keys', () => {
  it('sorts object keys recursively, keeps array order and leaves class instances to toJSON', () => {
    expect(stableStringify({ b: 1, a: { d: [2, 1], c: undefined } })).toBe('{"a":{"d":[2,1]},"b":1}')
    expect(stableStringify(new Date(0))).toBe('"1970-01-01T00:00:00.000Z"')
    expect(stableStringify(undefined)).toBeUndefined()
  })

  it('shares a key between equal inputs and separates different ones', () => {
    expect(actionQueryKey('a', { x: 1, y: 2 })).toBe(actionQueryKey('a', { y: 2, x: 1 }))
    expect(actionQueryKey('a', { x: 1 })).not.toBe(actionQueryKey('a', { x: 2 }))
    expect(actionQueryKey('a', { x: 1 })).not.toBe(actionQueryKey('b', { x: 1 }))
    expect(actionQueryKey('a', undefined)).toBe('safe-action:a')
    expect(actionQueryKey('a', { x: 1 })).toMatch(/^safe-action:a:[0-9a-z]+$/)
  })
})

describe('useActionQuery', () => {
  it('maps a successful envelope to typed refs and is awaitable', async () => {
    stubFetch(url => ({ data: { id: inputOf(url).id, name: 'Alpha' } }))
    const query = await useActionQuery(getProject, { id: 'a' })
    expect(query.data.value).toEqual({ id: 'a', name: 'Alpha' })
    expect(query.status.value).toBe('success')
    expect(query.hasErrored.value).toBe(false)
    expect(query.key.value).toBe(actionQueryKey('get-project', { id: 'a' }))
    expectTypeOf(query.data.value).toEqualTypeOf<Project | undefined>()
    expectTypeOf(query.businessError.value).toEqualTypeOf<NotFound | undefined>()
  })

  it('reports envelope failures as error status with typed details', async () => {
    stubFetch(() => ({ businessError: { code: 'NOT_FOUND', message: 'Project not found' } }))
    const query = await useActionQuery(getProject, { id: 'missing' })
    expect(query.status.value).toBe('error')
    expect(query.hasErrored.value).toBe(true)
    expect(query.businessError.value?.code).toBe('NOT_FOUND')
    expect(query.data.value).toBeUndefined()
  })

  it('surfaces transport failures as clientError without throwing', async () => {
    vi.stubGlobal('$fetch', vi.fn().mockRejectedValue(Object.assign(new Error('boom'), { statusCode: 502 })))
    const query = await useActionQuery(getProject, { id: 'a' })
    expect(query.status.value).toBe('error')
    expect(query.clientError.value).toEqual({ kind: 'http', message: 'boom', status: 502 })
    expect(query.error.value).toBeNull()
  })

  it('requires input unless the action accepts undefined', () => {
    stubFetch(() => ({ data: { id: 'a', name: 'x' } }))
    // @ts-expect-error getProject requires { id }
    void useActionQuery(getProject)
    // @ts-expect-error wrong input shape
    void useActionQuery(getProject, { slug: 'a' })
    void useActionQuery(getProject, ref({ id: 'a' }))
  })

  it('allows omitting input for void actions', async () => {
    const fetcher = stubFetch(() => ({ data: { user: 'ada' } }))
    const query = await useActionQuery(whoami)
    expect(query.data.value).toEqual({ user: 'ada' })
    expect(query.key.value).toBe('safe-action:whoami')
    expect(fetcher.mock.calls[0]![0]).toBe('/api/_actions/whoami')
  })

  it('uses a reactive key so every input gets its own entry', async () => {
    const fetcher = stubFetch(url => ({ data: { id: inputOf(url).id, name: 'x' } }))
    const id = ref('a')
    const query = await useActionQuery(getProject, () => ({ id: id.value }))
    expect(typeof asyncDataCalls[0]!.key).not.toBe('string')
    expect(asyncDataCalls[0]!.options.watch).toBeUndefined()
    id.value = 'b'
    await vi.waitFor(() => expect(query.data.value?.id).toBe('b'))
    expect(query.key.value).toBe(actionQueryKey('get-project', { id: 'b' }))
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('falls back to a fixed key plus a watch on Nuxt before 3.17', async () => {
    setReactiveAsyncDataKeys(false)
    stubFetch(url => ({ data: { id: inputOf(url).id, name: 'x' } }))
    const id = ref('a')
    const query = await useActionQuery(getProject, () => ({ id: id.value }))
    expect(asyncDataCalls[0]!.key).toBe(actionQueryKey('get-project', { id: 'a' }))
    id.value = 'b'
    await vi.waitFor(() => expect(query.data.value?.id).toBe('b'))
    expect(query.key.value).toBe(actionQueryKey('get-project', { id: 'a' }))
  })

  it('forwards the abort signal so superseded requests are cancelled', async () => {
    const pending = deferred<unknown>()
    const signals: AbortSignal[] = []
    vi.stubGlobal('$fetch', vi.fn((_url: string, init: { signal: AbortSignal }) => { signals.push(init.signal); return pending.promise }))
    const id = ref('a')
    const query = useActionQuery(getProject, () => ({ id: id.value }))
    id.value = 'b'
    await nextTick()
    expect(signals).toHaveLength(2)
    expect(signals[0]!.aborted).toBe(true)
    expect(signals[1]!.aborted).toBe(false)
    pending.resolve({ data: { id: 'b', name: 'B' } })
    await query
  })

  it('forwards only allowlisted request headers and lets explicit headers win', async () => {
    setRequestHeaders({ 'cookie': 'session=ada', 'authorization': 'Bearer t', 'x-forwarded-for': '1.2.3.4' })
    const fetcher = stubFetch(() => ({ data: { user: 'ada' } }))
    await useActionQuery(whoami)
    await useActionQuery(whoami, undefined, { forwardHeaders: ['cookie', 'authorization'], headers: { authorization: 'Bearer override' } })
    await useActionQuery(whoami, undefined, { forwardHeaders: false })
    const sent = fetcher.mock.calls.map(call => Object.fromEntries(call[1].headers.entries()))
    expect(sent[0]).toEqual({ cookie: 'session=ada' })
    expect(sent[1]).toEqual({ cookie: 'session=ada', authorization: 'Bearer override' })
    expect(sent[2]).toEqual({})
  })

  it('passes Nuxt options through and honours immediate: false', async () => {
    const fetcher = stubFetch(() => ({ data: { user: 'ada' } }))
    const query = await useActionQuery(whoami, undefined, { immediate: false, lazy: true, server: false, dedupe: 'defer', key: 'me' })
    expect(asyncDataCalls[0]!.options).toMatchObject({ immediate: false, lazy: true, server: false, dedupe: 'defer' })
    expect(query.status.value).toBe('idle')
    expect(fetcher).not.toHaveBeenCalled()
    await query.execute()
    expect(query.data.value).toEqual({ user: 'ada' })
    expect(query.key.value).toBe('me')
  })

  it('registers tags for the current key, follows key changes and releases on dispose', async () => {
    stubFetch(url => ({ data: { id: inputOf(url).id, name: 'x' } }))
    const id = ref('a')
    const scope = effectScope()
    await scope.run(() => useActionQuery(getProject, () => ({ id: id.value }), { tags: ['projects'] }))
    expect(resolveQueryKeys(useNuxtApp(), { tags: ['projects'] })).toEqual([actionQueryKey('get-project', { id: 'a' })])
    id.value = 'b'
    expect(resolveQueryKeys(useNuxtApp(), { tags: ['projects'] })).toEqual([actionQueryKey('get-project', { id: 'b' })])
    scope.stop()
    expect(resolveQueryKeys(useNuxtApp(), { tags: ['projects'] })).toEqual([])
  })
})
