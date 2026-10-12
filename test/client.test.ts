import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import { useAction } from '../src/runtime/composables/useAction'
import { useFormAction } from '../src/runtime/composables/useFormAction'
import { useOptimisticAction } from '../src/runtime/composables/useOptimisticAction'
import type { SafeActionReference, ActionResult } from '../src/runtime/types'

function action<I = { name: string }, O = string>(method = 'POST') {
  return { __safeActionPath: 'test', __safeActionMethod: method } as unknown as SafeActionReference<I, O>
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers() })

describe('useAction request ownership', () => {
  it('returns every result but only latest execution updates state and callbacks', async () => {
    const first = deferred<ActionResult<string>>()
    const second = deferred<ActionResult<string>>()
    vi.stubGlobal('$fetch', vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise))
    const onSuccess = vi.fn()
    const onSettled = vi.fn()
    const client = useAction(action(), { onSuccess, onSettled })
    const a = client.executeAsync({ name: 'old' })
    const b = client.executeAsync({ name: 'new' })
    second.resolve({ data: 'new' })
    expect(await b).toEqual({ data: 'new' })
    first.resolve({ data: 'old' })
    expect(await a).toEqual({ data: 'old' })
    expect(client.data.value).toBe('new')
    expect(onSuccess).toHaveBeenCalledExactlyOnceWith({ data: 'new', input: { name: 'new' } })
    expect(onSettled).toHaveBeenCalledTimes(1)
  })

  it('reset invalidates and aborts requests without stale completion repopulating state', async () => {
    const response = deferred<ActionResult<string>>()
    const fetch = vi.fn().mockReturnValue(response.promise)
    vi.stubGlobal('$fetch', fetch)
    const settled = vi.fn()
    const client = useAction(action(), { onSettled: settled })
    const pending = client.executeAsync({ name: 'x' })
    client.reset()
    expect(fetch.mock.calls[0]![1].signal.aborted).toBe(true)
    expect((await pending).serverError).toBeDefined()
    response.resolve({ data: 'stale' })
    await Promise.resolve()
    expect(client.status.value).toBe('idle')
    expect(client.data.value).toBeUndefined()
    expect(settled).not.toHaveBeenCalled()
  })

  it('recognizes undefined output and isolates both sync and async callback failures', async () => {
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({}))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const onError = vi.fn()
    const onSettled = vi.fn()
    const client = useAction(action<undefined, undefined>(), {
      onExecute() { throw new Error('execute callback') },
      onSuccess: async () => { throw new Error('success callback') },
      onError, onSettled,
    })
    expect(await client.executeAsync(undefined)).toEqual({})
    await Promise.resolve()
    expect(client.status.value).toBe('hasSucceeded')
    expect(onError).not.toHaveBeenCalled()
    expect(onSettled).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledTimes(2)
  })

  it('suppresses old settlement when a completion callback resets or starts a newer execution', async () => {
    const next = deferred<ActionResult<string>>()
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValueOnce({ data: 'first' }).mockReturnValueOnce(next.promise))
    const settled = vi.fn()
    let pending: Promise<ActionResult<string>> | undefined
    const client = useAction(action(), {
      onSuccess({ input }) {
        if (input.name === 'first') pending = client.executeAsync({ name: 'next' })
        else client.reset()
      },
      onSettled: settled,
    })
    await client.executeAsync({ name: 'first' })
    expect(client.status.value).toBe('executing')
    expect(settled).not.toHaveBeenCalled()
    next.resolve({ data: 'next' })
    await pending
    expect(client.status.value).toBe('idle')
    expect(settled).not.toHaveBeenCalled()
  })

  it('does not convert throwing error or settled callbacks into a second outcome', async () => {
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ validationErrors: { name: ['Required'] } }))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const onError = vi.fn(() => { throw new Error('error callback') })
    const onSettled = vi.fn(() => { throw new Error('settled callback') })
    const client = useAction(action(), { onError, onSettled })
    expect(await client.executeAsync({ name: '' })).toEqual({ validationErrors: { name: ['Required'] } })
    expect(client.validationErrors.value).toEqual({ name: ['Required'] })
    expect(client.serverError.value).toBeUndefined()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onSettled).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledTimes(2)
  })

  it('keeps requests independent of scope disposal by default', async () => {
    const response = deferred<ActionResult<string>>()
    const fetch = vi.fn().mockReturnValue(response.promise)
    vi.stubGlobal('$fetch', fetch)
    const scope = effectScope()
    const client = scope.run(() => useAction(action()))!
    const pending = client.executeAsync({ name: 'x' })
    scope.stop()
    expect(fetch.mock.calls[0]![1].signal.aborted).toBe(false)
    response.resolve({ data: 'completed' })
    await pending
    expect(client.status.value).toBe('hasSucceeded')
  })

  it('serializes native mutation input and handles invalid payloads and HTTP errors consistently', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(null) })
      .mockResolvedValueOnce({ ok: false, status: 503 })
    vi.stubGlobal('fetch', fetch)
    const client = useAction(action(), { detached: true, headers: { 'X-Custom': 'test' } })
    expect(await client.executeAsync({ name: 'x' })).toEqual({ serverError: 'Invalid action response' })
    const request = fetch.mock.calls[0]![1]
    expect(request.body).toBe('{"name":"x"}')
    expect(request.headers.get('Content-Type')).toBe('application/json')
    expect(request.headers.get('X-Custom')).toBe('test')
    expect(await client.executeAsync({ name: 'x' })).toEqual({ serverError: 'HTTP 503' })
  })

  it('supports timeout even when a transport ignores the signal', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('$fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    const onSettled = vi.fn()
    const client = useAction(action(), { timeout: 25, onSettled })
    const pending = client.executeAsync({ name: 'x' })
    await vi.advanceTimersByTimeAsync(25)
    expect(await pending).toEqual({ serverError: 'Action request timed out' })
    expect(client.status.value).toBe('hasErrored')
    expect(onSettled).toHaveBeenCalledTimes(1)
  })

  it('honors external abort, dynamic headers, credentials, and disables automatic mutation retries', async () => {
    const controller = new AbortController()
    const fetch = vi.fn().mockReturnValue(new Promise(() => {}))
    vi.stubGlobal('$fetch', fetch)
    const client = useAction(action(), { signal: controller.signal, headers: () => ({ Authorization: 'Bearer token' }), credentials: 'include' })
    const pending = client.executeAsync({ name: 'x' })
    const request = fetch.mock.calls[0]![1]
    expect(request.headers.get('Authorization')).toBe('Bearer token')
    expect(request.credentials).toBe('include')
    expect(request.retry).toBe(0)
    controller.abort()
    expect((await pending).serverError).toBeDefined()
    expect(client.status.value).toBe('hasErrored')
  })

  it('does not start transport for an already aborted external signal', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetch = vi.fn()
    vi.stubGlobal('$fetch', fetch)
    expect((await useAction(action(), { signal: controller.signal }).executeAsync({ name: 'x' })).serverError).toBeDefined()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('aborts on scope disposal only when explicitly enabled', async () => {
    vi.stubGlobal('$fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    const scope = effectScope()
    const client = scope.run(() => useAction(action(), { abortOnDispose: true }))!
    const pending = client.executeAsync({ name: 'x' })
    scope.stop()
    expect((await pending).serverError).toBeDefined()
    expect(client.status.value).toBe('idle')
  })

  it('supports native GET transport without a body and preserves callback envelopes', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: 'ok' }) })
    vi.stubGlobal('fetch', fetch)
    const client = useAction(action('GET'), { detached: true })
    expect(await client.executeAsync({ name: 'a b' })).toEqual({ data: 'ok' })
    expect(fetch.mock.calls[0]![0]).toBe('/api/_actions/test?input=%7B%22name%22%3A%22a%20b%22%7D')
    expect(fetch.mock.calls[0]![1].body).toBeUndefined()
  })

  it('cancels prior execution only when requested and execute remains void', async () => {
    const fetch = vi.fn().mockReturnValue(new Promise(() => {}))
    vi.stubGlobal('$fetch', fetch)
    const client = useAction(action(), { cancelPrevious: true })
    const first = client.executeAsync({ name: 'old' })
    expect(client.execute({ name: 'new' })).toBeUndefined()
    expect(fetch.mock.calls[0]![1].signal.aborted).toBe(true)
    expect((await first).serverError).toBeDefined()
    client.cancel()
  })
})

describe('useFormAction', () => {
  it('submits a nested snapshot, separates root errors, and restores original values on reset', async () => {
    const response = deferred<ActionResult<string>>()
    const fetch = vi.fn().mockReturnValue(response.promise)
    vi.stubGlobal('$fetch', fetch)
    const initialValues = { profile: { name: 'initial' }, tags: ['first'] }
    const client = useFormAction(action<typeof initialValues>(), { initialValues })
    client.values.value.profile.name = 'submitted'
    const pending = client.submit()
    client.values.value.profile.name = 'edited later'
    expect(JSON.parse(fetch.mock.calls[0]![1].body).profile.name).toBe('submitted')
    response.resolve({ validationErrors: { 'profile.name': ['Taken'], '_root': ['Root'], '_errors': ['Malformed'] } })
    await pending
    expect(client.fieldErrors.value).toEqual({ 'profile.name': ['Taken'] })
    expect(client.rootErrors.value).toEqual(['Root', 'Malformed'])
    initialValues.profile.name = 'external change'
    client.reset()
    expect(client.values.value).toEqual({ profile: { name: 'initial' }, tags: ['first'] })
    expect(client.status.value).toBe('idle')
  })
})

describe('useOptimisticAction', () => {
  it('replaces older operation, rolls back only latest failure, and never assigns arbitrary output', async () => {
    const first = deferred<ActionResult<string>>()
    const second = deferred<ActionResult<string>>()
    const third = deferred<ActionResult<string>>()
    vi.stubGlobal('$fetch', vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockReturnValueOnce(third.promise))
    const currentData = ref(['original'])
    const client = useOptimisticAction(action(), { currentData, updateFn: (input, items) => [...items, input.name] })
    const a = client.executeAsync({ name: 'old' })
    expect(currentData.value).toEqual(['original', 'old'])
    const b = client.executeAsync({ name: 'new' })
    expect(currentData.value).toEqual(['original', 'new'])
    await a
    second.resolve({ serverError: 'failed' })
    await b
    expect(currentData.value).toEqual(['original'])
    first.resolve({ data: 'late' })
    const c = client.executeAsync({ name: 'committed' })
    third.resolve({ data: 'output is not an array' })
    await c
    expect(currentData.value).toEqual(['original', 'committed'])
  })

  it('does not send mutations when updateFn throws and handles fire-and-forget rejection', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('$fetch', fetch)
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const currentData = ref(['baseline'])
    const client = useOptimisticAction(action(), {
      currentData,
      updateFn() { throw new Error('Update failed') },
    })
    await expect(client.executeAsync({ name: 'x' })).rejects.toThrow('Update failed')
    expect(client.execute({ name: 'x' })).toBeUndefined()
    await Promise.resolve()
    expect(log).toHaveBeenCalledTimes(1)
    expect(fetch).not.toHaveBeenCalled()
    expect(currentData.value).toEqual(['baseline'])
    expect(client.status.value).toBe('idle')
  })

  it.each(['onSuccess', 'onSettled'] as const)('commits before %s starts a newer optimistic operation', async (callback) => {
    const first = deferred<ActionResult<string>>()
    const second = deferred<ActionResult<string>>()
    vi.stubGlobal('$fetch', vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise))
    const currentData = ref<string[]>([])
    let newer: Promise<ActionResult<string>> | undefined
    const client = useOptimisticAction(action(), {
      currentData,
      updateFn: (input, current) => [...current, input.name],
      [callback]: ({ input }: { input: { name: string } }) => {
        if (input.name === 'A') newer = client.executeAsync({ name: 'B' })
      },
    })
    const original = client.executeAsync({ name: 'A' })
    first.resolve({ data: 'A' })
    await original
    expect(currentData.value).toEqual(['A', 'B'])
    second.resolve({ data: 'B' })
    await newer
    expect(currentData.value).toEqual(['A', 'B'])
  })

  it.each(['cancel', 'reset'] as const)('retains successful optimism when onSuccess calls %s', async (method) => {
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({}))
    const currentData = ref<string[]>([])
    const client = useOptimisticAction(action<{ name: string }, undefined>(), {
      currentData,
      updateFn: (input, current) => [...current, input.name],
      onSuccess() { client[method]() },
    })
    expect(await client.executeAsync({ name: 'committed' })).toEqual({})
    expect(currentData.value).toEqual(['committed'])
    expect(client.status.value).toBe('idle')
  })

  it('rolls back before onError retries, and old completion cannot remove newer optimism', async () => {
    const first = deferred<ActionResult<string>>()
    const retry = deferred<ActionResult<string>>()
    vi.stubGlobal('$fetch', vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(retry.promise))
    const currentData = ref(['baseline'])
    let newer: Promise<ActionResult<string>> | undefined
    const client = useOptimisticAction(action(), {
      currentData,
      updateFn: (input, current) => [...current, input.name],
      onError({ input }) {
        if (input.name === 'failed') {
          expect(currentData.value).toEqual(['baseline'])
          newer = client.executeAsync({ name: 'retry' })
        }
      },
    })
    const original = client.executeAsync({ name: 'failed' })
    first.resolve({ serverError: 'failed' })
    await original
    expect(currentData.value).toEqual(['baseline', 'retry'])
    retry.resolve({ data: 'retry' })
    await newer
    expect(currentData.value).toEqual(['baseline', 'retry'])
  })

  it('does not undo an external authoritative refresh on failure or cancellation', async () => {
    const response = deferred<ActionResult<string>>()
    vi.stubGlobal('$fetch', vi.fn().mockReturnValue(response.promise))
    const currentData = ref(['original'])
    const client = useOptimisticAction(action(), { currentData, updateFn: (input, items) => [...items, input.name] })
    const pending = client.executeAsync({ name: 'new' })
    currentData.value = ['authoritative']
    client.cancel()
    await pending
    expect(currentData.value).toEqual(['authoritative'])
    response.resolve({ serverError: 'late' })
  })
})
