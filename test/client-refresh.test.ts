import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import { useAction } from '../src/runtime/composables/useAction'
import { useOptimisticAction } from '../src/runtime/composables/useOptimisticAction'
import { useActionQueryTags } from '../src/runtime/composables/useActionQueryTags'
import { registerQueryTags, resolveQueryKeys } from '../src/runtime/utils/queryTags'
import { resetNuxtApp, setNuxtApp, setQueryRefresh, useNuxtApp } from './mocks/nuxt-app'
import type { SafeActionReference, ActionResult } from '../src/runtime/types'

function action<B = never>() { return { __safeActionPath: 'mutation' } as unknown as SafeActionReference<string, string, string, B> }
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); resetNuxtApp() })

describe('explicit query registration', () => {
  it('deduplicates key/tag selection and counts scoped registrations without leaking between apps', () => {
    const owner = {}
    const other = {}
    const a = registerQueryTags(owner, 'users', ['people', 'people'])
    const b = registerQueryTags(owner, 'users', ['people'])
    registerQueryTags(other, 'private', ['people'])
    expect(resolveQueryKeys(owner, { keys: ['users', 'manual', ''], tags: ['people'] })).toEqual(['users', 'manual'])
    a(); a()
    expect(resolveQueryKeys(owner, { tags: ['people'] })).toEqual(['users'])
    b()
    expect(resolveQueryKeys(owner, { tags: ['people'] })).toEqual([])
    expect(resolveQueryKeys(other, { tags: ['people'] })).toEqual(['private'])
  })

  it('empty tag cleanup cannot remove a newly created owner registry', () => {
    const owner = {}
    const old = registerQueryTags(owner, 'old', ['x'])
    const empty = registerQueryTags(owner, 'old', ['', ''])
    old()
    registerQueryTags(owner, 'new', ['y'])
    empty()
    expect(resolveQueryKeys(owner, { tags: ['y'] })).toEqual(['new'])
  })

  it('empty tag cleanup cannot remove a replacement key alongside another active registration', () => {
    const owner = {}
    const old = registerQueryTags(owner, 'replaced', ['x'])
    const empty = registerQueryTags(owner, 'replaced', [])
    registerQueryTags(owner, 'other', ['z'])
    old()
    registerQueryTags(owner, 'replaced', ['y'])
    empty()
    expect(resolveQueryKeys(owner, { tags: ['y', 'z'] })).toEqual(['other', 'replaced'])
  })

  it('automatically removes only the disposed scope registration', () => {
    const scope = effectScope()
    scope.run(() => useActionQueryTags('scoped', ['items']))
    const manual = useActionQueryTags('manual', ['items'])
    expect(resolveQueryKeys(useNuxtApp(), { tags: ['items'] })).toEqual(['scoped', 'manual'])
    scope.stop()
    expect(resolveQueryKeys(useNuxtApp(), { tags: ['items'] })).toEqual(['manual'])
    manual()
    expect(resolveQueryKeys(useNuxtApp(), { tags: ['items'] })).toEqual([])
  })
})

describe('success-only query refresh', () => {
  it('does not refresh by default or for empty/unmatched selections', async () => {
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ data: 'ok' }))
    const refresh = vi.fn().mockResolvedValue(undefined)
    setQueryRefresh(refresh)
    await useAction(action()).executeAsync('x')
    await useAction(action(), { invalidate: {} }).executeAsync('x')
    await useAction(action(), { invalidate: { tags: ['unknown'] } }).executeAsync('x')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('refreshes selected keys after success and awaits refresh without changing the original envelope', async () => {
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ data: 'ok' }))
    const response = deferred<undefined>()
    const refresh = vi.fn().mockReturnValue(response.promise)
    setQueryRefresh(refresh)
    useActionQueryTags('profile', ['account'])
    const runWithContext = vi.fn((callback: () => unknown) => callback())
    const owner = useNuxtApp()
    owner.runWithContext = runWithContext as typeof owner.runWithContext
    const client = useAction(action(), { invalidate: { keys: ['manual'], tags: ['account'] } })
    const pending = client.executeAsync('x')
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledWith(['manual', 'profile']))
    expect(client.status.value).toBe('hasSucceeded')
    expect(client.isRefreshing.value).toBe(true)
    response.resolve(undefined)
    expect(await pending).toEqual({ data: 'ok' })
    expect(client.isRefreshing.value).toBe(false)
    expect(runWithContext).toHaveBeenCalledTimes(1)
  })

  it('captures app ownership at setup and does not refresh another app keys after the await', async () => {
    const transport = deferred<ActionResult<string>>()
    vi.stubGlobal('$fetch', vi.fn().mockReturnValue(transport.promise))
    const refresh = vi.fn().mockResolvedValue(undefined)
    setQueryRefresh(refresh)
    useActionQueryTags('original', ['shared'])
    const client = useAction(action(), { invalidate: { tags: ['shared'] } })
    const pending = client.executeAsync('x')
    setNuxtApp({ runWithContext: callback => callback() })
    useActionQueryTags('other', ['shared'])
    transport.resolve({ data: 'ok' })
    await pending
    expect(refresh).toHaveBeenCalledWith(['original'])
  })

  it.each([{ serverError: 'failed' }, { validationErrors: { name: ['Invalid'] } }, { businessError: { code: 'TAKEN', message: 'Taken' } }])('never refreshes a failed write %j', async (result) => {
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue(result))
    const refresh = vi.fn()
    setQueryRefresh(refresh)
    const client = useAction(action<{ code: 'TAKEN'; message: string }>(), { invalidate: { keys: ['users'] } })
    expect(await client.executeAsync('x')).toEqual(result)
    expect(client.status.value).toBe('hasErrored')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('reports refresh failure separately while preserving successful data and callbacks', async () => {
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ data: 'committed' }))
    const error = new Error('Refresh failed')
    setQueryRefresh(vi.fn().mockRejectedValue(error))
    const onSuccess = vi.fn()
    const onError = vi.fn()
    const client = useAction(action(), { invalidate: { keys: ['users'] }, onSuccess, onError })
    expect(await client.executeAsync('x')).toEqual({ data: 'committed' })
    expect(client.data.value).toBe('committed')
    expect(client.refreshError.value).toBe(error)
    expect(client.serverError.value).toBeUndefined()
    expect(client.status.value).toBe('hasSucceeded')
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
    client.reset()
    expect(client.refreshError.value).toBeNull()
  })

  it('suppresses refresh for stale completions but keeps it when onSuccess resets', async () => {
    const old = deferred<ActionResult<string>>()
    const latest = deferred<ActionResult<string>>()
    vi.stubGlobal('$fetch', vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise))
    const refresh = vi.fn()
    setQueryRefresh(refresh)
    const onSettled = vi.fn()
    const client = useAction(action(), { invalidate: { keys: ['users'] }, onSuccess() { client.reset() }, onSettled })
    const a = client.executeAsync('old')
    const b = client.executeAsync('latest')
    old.resolve({ data: 'old' })
    await a
    expect(refresh).not.toHaveBeenCalled()
    latest.resolve({ data: 'latest' })
    await b
    expect(refresh).toHaveBeenCalledExactlyOnceWith(['users'])
    expect(onSettled).toHaveBeenCalledExactlyOnceWith({ result: { data: 'latest' }, input: 'latest' })
    expect(client.status.value).toBe('idle')
    expect(client.data.value).toBeUndefined()
    expect(client.isRefreshing.value).toBe(false)
  })

  it('reset() inside onSuccess does not cancel the declared tag refresh or onSettled', async () => {
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ data: 'saved' }))
    const pendingRefresh = deferred<undefined>()
    const refresh = vi.fn().mockReturnValue(pendingRefresh.promise)
    setQueryRefresh(refresh)
    const stop = useActionQueryTags('notes', ['notes'])
    const order: string[] = []
    const client = useAction(action(), {
      invalidate: { tags: ['notes'] },
      onSuccess() { order.push('success'); client.reset() },
      onSettled() { order.push('settled') },
    })
    const pending = client.executeAsync('x')
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledExactlyOnceWith(['notes']))
    // Reset released reactive state; the background refresh does not reclaim it.
    expect(client.isRefreshing.value).toBe(false)
    pendingRefresh.reject(new Error('Refresh failed'))
    expect(await pending).toEqual({ data: 'saved' })
    expect(client.refreshError.value).toBeNull()
    expect(order).toEqual(['success', 'settled'])
    stop()
  })

  it('does not let a cancelled refresh failure overwrite a newer success', async () => {
    const oldRefresh = deferred<undefined>()
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ data: 'ok' }))
    const refresh = vi.fn().mockReturnValueOnce(oldRefresh.promise).mockResolvedValueOnce(undefined)
    setQueryRefresh(refresh)
    const client = useAction(action(), { invalidate: { keys: ['users'] } })
    const a = client.executeAsync('old')
    await vi.waitFor(() => expect(client.isRefreshing.value).toBe(true))
    client.cancel()
    const b = client.executeAsync('new')
    await b
    oldRefresh.reject(new Error('Stale refresh failure'))
    await a
    expect(client.refreshError.value).toBeNull()
    expect(client.isRefreshing.value).toBe(false)
    expect(client.status.value).toBe('hasSucceeded')
  })

  it('finalizes optimism before refreshing authoritative data and rolls back business failures without refresh', async () => {
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValueOnce({ data: 'committed' }).mockResolvedValueOnce({ businessError: { code: 'TAKEN', message: 'Taken' } }))
    const currentData = ref(['baseline'])
    const refresh = vi.fn(async () => { currentData.value = ['authoritative'] })
    setQueryRefresh(refresh)
    const client = useOptimisticAction(action<{ code: 'TAKEN'; message: string }>(), {
      currentData, updateFn: (input, items) => [...items, input], invalidate: { keys: ['users'] },
      onError({ error }) { expectTypeOf(error.businessError).toEqualTypeOf<{ code: 'TAKEN'; message: string } | undefined>() },
    })
    await client.executeAsync('first')
    expect(currentData.value).toEqual(['authoritative'])
    await client.executeAsync('rejected')
    expect(currentData.value).toEqual(['authoritative'])
    expect(client.businessError.value?.code).toBe('TAKEN')
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
