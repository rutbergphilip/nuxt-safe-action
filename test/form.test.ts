import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { effectScope, toRaw } from 'vue'
import { useFormAction } from '../src/runtime/composables/useFormAction'
import { resetNuxtApp, setQueryRefresh } from './mocks/nuxt-app'
import { toFormErrors } from '../src/runtime/utils/toFormErrors'
import type { SafeActionReference, StandardSchemaV1, SchemaResult, ActionResult } from '../src/runtime/types'

interface Values {
  profile: { name: string; email: string }
  addresses: { city: string }[]
}
const initial = (): Values => ({ profile: { name: 'Ada', email: 'ada@example.com' }, addresses: [{ city: 'Oslo' }, { city: 'Oslo' }] })
function action<I = Values, O = string>() { return { __safeActionPath: 'form' } as unknown as SafeActionReference<I, O> }
function schema<I>(validate: (input: unknown) => SchemaResult<unknown> | Promise<SchemaResult<unknown>>): StandardSchemaV1<I, unknown> { return { '~standard': { version: 1, vendor: 'test', validate } } }
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((yes) => { resolve = yes })
  return { promise, resolve }
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); resetNuxtApp() })

describe('advanced form state', () => {
  it('tracks nested paths, array values, dirty baseline, and explicit touches without sharing initial state', () => {
    const baseline = initial()
    const form = useFormAction(action(), { initialValues: baseline })
    expect(form.getFieldValue('profile.name')).toBe('Ada')
    expectTypeOf(form.getFieldValue('addresses.0.city')).toEqualTypeOf<string | undefined>()
    form.setFieldValue('profile.name', 'Grace')
    expect(form.isDirty.value).toBe(true)
    expect(form.isFieldDirty('profile.name')).toBe(true)
    expect(form.isFieldDirty('profile.email')).toBe(false)
    expect(form.dirtyFields.value).toContain('profile.name')
    expect(form.isTouched.value).toBe(false)
    form.setTouched('addresses.0.city')
    expect(form.isFieldTouched('addresses.0.city')).toBe(true)
    form.setTouched('addresses.0.city', false)
    expect(form.touchedFields.value).toEqual([])
    form.values.value.addresses[0]!.city = 'Stockholm'
    expect(form.isFieldDirty('addresses.0.city')).toBe(true)
    expect(baseline.addresses[0]!.city).toBe('Oslo')
    form.reset()
    expect(form.values.value).toEqual(initial())
    expect(form.isDirty.value).toBe(false)
    function typeChecks() {
      // @ts-expect-error known raw-input paths are enforced
      form.getFieldValue('profile.missing')
      // @ts-expect-error field setter value is inferred
      form.setFieldValue('addresses.0.city', 123)
    }
    void typeChecks
  })

  it('rejects unsafe writes and invalid array indices without prototype pollution', () => {
    const form = useFormAction(action(), { initialValues: initial() })
    const set = form.setFieldValue as (path: string, value: unknown) => void
    for (const path of ['__proto__.polluted', 'profile.constructor.prototype.polluted', 'profile.prototype.x', 'addresses.-1.city', 'addresses.01.city', 'profile..name']) expect(() => set(path, true)).toThrow()
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(form.values.value.profile.name).toBe('Ada')
  })

  it('preserves untouched sibling errors but hides errors for edited submitted values', async () => {
    const response = deferred<ActionResult<string>>()
    vi.stubGlobal('$fetch', vi.fn().mockReturnValue(response.promise))
    const form = useFormAction(action(), { initialValues: initial() })
    const pending = form.submit()
    form.values.value.profile.name = 'Edited'
    response.resolve({ validationErrors: { 'profile.name': ['Old name rejected'], 'profile.email': ['Email taken'], _root: ['Check profile'] } })
    await pending
    expect(form.fieldErrors.value).toEqual({ 'profile.email': ['Email taken'] })
    expect(form.rootErrors.value).toEqual(['Check profile'])
    form.clearErrors('profile')
    expect(form.fieldErrors.value).toEqual({})
    expect(form.rootErrors.value).toEqual(['Check profile'])
    form.clearErrors()
    expect(form.validationErrors.value).toBeUndefined()
  })

  it('hides the complete affected array group after duplicate rows reorder', async () => {
    const response = deferred<ActionResult<string>>()
    vi.stubGlobal('$fetch', vi.fn().mockReturnValue(response.promise))
    const form = useFormAction(action(), { initialValues: initial() })
    const pending = form.submit()
    form.values.value.addresses.reverse()
    response.resolve({ validationErrors: { 'addresses.0.city': ['First row invalid'], 'addresses.1.city': ['Second row invalid'], 'profile.email': ['Email taken'] } })
    await pending
    expect(form.fieldErrors.value).toEqual({ 'profile.email': ['Email taken'] })
  })

  it('retains unaffected array sibling errors when only one row field changes', async () => {
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ validationErrors: { 'addresses.0.city': ['First invalid'], 'addresses.1.city': ['Second invalid'] } }))
    const form = useFormAction(action(), { initialValues: initial() })
    await form.submit()
    form.values.value.addresses[0]!.city = 'New city'
    expect(form.fieldErrors.value).toEqual({ 'addresses.1.city': ['Second invalid'] })
    form.values.value.addresses.pop()
    expect(form.fieldErrors.value).toEqual({})
  })

  it('returns Nuxt UI-shaped field errors with array paths and separates root messages', () => {
    expect(toFormErrors({ 'addresses.0.city': ['Required', 'Invalid'], _root: ['Root'], _errors: ['Bad request'] })).toEqual([
      { name: 'addresses.0.city', message: 'Required' }, { name: 'addresses.0.city', message: 'Invalid' },
    ])
    expect(toFormErrors(undefined)).toEqual([])
  })
})

describe('optional client schema validation', () => {
  it('blocks invalid submissions and emits one error/settled notification without transport', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('$fetch', fetch)
    const onSuccess = vi.fn()
    const onError = vi.fn()
    const onSettled = vi.fn()
    const form = useFormAction(action(), {
      initialValues: initial(), onSuccess, onError, onSettled,
      clientSchema: schema<Values>(() => ({ issues: [{ path: ['profile', 'email'], message: 'Invalid email' }] })),
    })
    expect(await form.submit()).toEqual({ validationErrors: { 'profile.email': ['Invalid email'] } })
    expect(fetch).not.toHaveBeenCalled()
    expect(form.status.value).toBe('hasErrored')
    expect(form.getFieldErrors('profile.email')).toEqual(['Invalid email'])
    expect(onSuccess).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onSettled).toHaveBeenCalledTimes(1)
    form.reset()
    expect(form.isValidating.value).toBe(false)
    expect(form.validationErrors.value).toBeUndefined()
  })

  it('sends the original raw snapshot even after schema mutation and edits during async validation', async () => {
    const validation = deferred<SchemaResult<unknown>>()
    const fetch = vi.fn().mockResolvedValue({ data: 'saved' })
    vi.stubGlobal('$fetch', fetch)
    const form = useFormAction(action(), {
      initialValues: initial(),
      clientSchema: schema<Values>((value) => {
        ;(value as Values).profile.name = 'Schema mutation'
        return validation.promise
      }),
    })
    const pending = form.submit()
    form.values.value.profile.name = 'Edited after submit'
    validation.resolve({ value: { transformed: 'output should not be sent' } })
    expect(await pending).toEqual({ data: 'saved' })
    expect(JSON.parse(fetch.mock.calls[0]![1].body).profile.name).toBe('Ada')
    expect(form.values.value.profile.name).toBe('Edited after submit')
    expect(form.isDirty.value).toBe(true)
  })

  it('protects array topology captured before async validation as well as server execution', async () => {
    const validation = deferred<SchemaResult<unknown>>()
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ validationErrors: { 'addresses.0.city': ['Original first row invalid'] } }))
    const form = useFormAction(action(), { initialValues: initial(), clientSchema: schema<Values>(() => validation.promise) })
    const pending = form.submit()
    form.values.value.addresses.reverse()
    validation.resolve({ value: initial() })
    await pending
    expect(form.fieldErrors.value).toEqual({})
  })

  it('only lets the latest standalone validation update errors', async () => {
    const old = deferred<SchemaResult<unknown>>()
    const latest = deferred<SchemaResult<unknown>>()
    const validate = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise)
    const form = useFormAction(action(), { initialValues: initial(), clientSchema: schema<Values>(validate) })
    const a = form.validate()
    const b = form.validate()
    latest.resolve({ value: initial() })
    expect(await b).toEqual({})
    old.resolve({ issues: [{ path: ['profile', 'name'], message: 'Stale' }] })
    expect(await a).toEqual({ 'profile.name': ['Stale'] })
    expect(form.fieldErrors.value).toEqual({})
    expect(form.isValidating.value).toBe(false)
  })

  it('reset and scope disposal invalidate pending validation without starting a server request', async () => {
    const validation = deferred<SchemaResult<unknown>>()
    const fetch = vi.fn()
    vi.stubGlobal('$fetch', fetch)
    const scope = effectScope()
    const form = scope.run(() => useFormAction(action(), { initialValues: initial(), clientSchema: schema<Values>(() => validation.promise), abortOnDispose: true }))!
    const pending = form.submit()
    form.reset()
    scope.stop()
    validation.resolve({ value: initial() })
    expect((await pending).serverError).toBeDefined()
    expect(fetch).not.toHaveBeenCalled()
    expect(form.status.value).toBe('idle')
  })

  it.each([
    { valid: false, oldCompletesDuring: true }, { valid: false, oldCompletesDuring: false },
    { valid: true, oldCompletesDuring: true }, { valid: true, oldCompletesDuring: false },
  ])('invalidates older transport presentation before newer local validation %j', async ({ valid, oldCompletesDuring }) => {
    const old = deferred<ActionResult<string>>()
    const validation = deferred<SchemaResult<unknown>>()
    const validate = vi.fn().mockResolvedValueOnce({ value: initial() }).mockReturnValueOnce(validation.promise)
    const fetch = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce({ data: 'latest' })
    const refresh = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('$fetch', fetch)
    setQueryRefresh(refresh)
    const form = useFormAction(action(), { initialValues: initial(), clientSchema: schema<Values>(validate), invalidate: { keys: ['profile'] } })
    const first = form.submit()
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    form.values.value.profile.name = 'New submission'
    const second = form.submit()
    if (oldCompletesDuring) {
      old.resolve({ data: 'old response' })
      expect(await first).toEqual({ data: 'old response' })
      expect(form.data.value).toBeUndefined()
      expect(refresh).not.toHaveBeenCalled()
      expect(form.isValidating.value).toBe(true)
    }
    validation.resolve(valid ? { value: initial() } : { issues: [{ path: ['profile', 'name'], message: 'Invalid new value' }] })
    const current = await second
    if (!oldCompletesDuring) {
      old.resolve({ data: 'old response' })
      expect(await first).toEqual({ data: 'old response' })
    }
    if (valid) {
      expect(current).toEqual({ data: 'latest' })
      expect(form.data.value).toBe('latest')
      expect(refresh).toHaveBeenCalledTimes(1)
    } else {
      expect(current).toEqual({ validationErrors: { 'profile.name': ['Invalid new value'] } })
      expect(form.data.value).toBeUndefined()
      expect(form.status.value).toBe('hasErrored')
      expect(refresh).not.toHaveBeenCalled()
    }
  })

  it('does not send a mutation for a Standard Schema failure with an empty issue list', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('$fetch', fetch)
    const form = useFormAction(action(), { initialValues: initial(), clientSchema: schema<Values>(() => ({ issues: [] })) })
    expect(await form.submit()).toEqual({ validationErrors: { _root: ['Client validation failed'] } })
    expect(fetch).not.toHaveBeenCalled()
    expect(form.status.value).toBe('hasErrored')
  })

  it.each([undefined, null, {}, { issues: 'invalid' }, { issues: [{ message: 123 }] }, { issues: [{ message: 'Bad path', path: [null] }] }])('contains malformed schema results without sending unvalidated input: %j', async (malformed) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetch = vi.fn()
    vi.stubGlobal('$fetch', fetch)
    const form = useFormAction(action(), { initialValues: initial(), clientSchema: schema<Values>(() => malformed as unknown as SchemaResult<unknown>) })
    expect(await form.submit()).toEqual({ validationErrors: { _root: ['Client validation failed'] } })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('contains schema exceptions as safe root errors and never sends unvalidated data', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetch = vi.fn()
    vi.stubGlobal('$fetch', fetch)
    const form = useFormAction(action(), { initialValues: initial(), clientSchema: schema<Values>(() => { throw new Error('Private schema error') }) })
    expect(await form.submit()).toEqual({ validationErrors: { _root: ['Client validation failed'] } })
    expect(form.rootErrors.value).toEqual(['Client validation failed'])
    expect(fetch).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledTimes(1)
  })

  it('suppresses invalid local settlement after an error callback resets the form', async () => {
    const onSettled = vi.fn()
    const form = useFormAction(action(), {
      initialValues: initial(), clientSchema: schema<Values>(() => ({ issues: [{ message: 'Invalid' }] })),
      onError() { form.reset() }, onSettled,
    })
    await form.submit()
    expect(form.status.value).toBe('idle')
    expect(onSettled).not.toHaveBeenCalled()
  })
})

describe('async initial values', () => {
  it('rebases dirty tracking on loaded data and follows it while the form is pristine', () => {
    const form = useFormAction(action(), { initialValues: { profile: { name: '', email: '' }, addresses: [] } as Values })
    form.setInitialValues(initial())
    expect(form.values.value).toEqual(initial())
    expect(form.initialValues.value).toEqual(initial())
    expect(form.isDirty.value).toBe(false)
    form.setFieldValue('profile.name', 'Grace')
    expect(form.dirtyFields.value).toContain('profile.name')
    expect(form.dirtyFields.value).not.toContain('profile.email')
    form.reset()
    expect(form.values.value).toEqual(initial())
  })

  it('keeps user edits when the baseline arrives after editing, or when keepValues is set', () => {
    const form = useFormAction(action(), { initialValues: initial() })
    form.setFieldValue('profile.name', 'Grace')
    const loaded = { ...initial(), profile: { name: 'Server', email: 'server@example.com' } }
    form.setInitialValues(loaded)
    expect(form.getFieldValue('profile.name')).toBe('Grace')
    expect(form.isFieldDirty('profile.name')).toBe(true)
    expect(form.isFieldDirty('profile.email')).toBe(true)

    const pristine = useFormAction(action(), { initialValues: initial() })
    pristine.setInitialValues(loaded, { keepValues: true })
    expect(pristine.values.value).toEqual(initial())
    expect(pristine.isDirty.value).toBe(true)
  })

  it('does not share the passed baseline object with the form', () => {
    const loaded = initial()
    const form = useFormAction(action(), { initialValues: initial() })
    form.setInitialValues(loaded)
    loaded.profile.name = 'mutated'
    expect(form.initialValues.value.profile.name).toBe('Ada')
    expect(form.values.value.profile.name).toBe('Ada')
  })
})

describe('non-plain form values', () => {
  it('keeps non-plain values by reference, compares them by identity and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const first = new Map([['a', 1]])
    const form = useFormAction(action<{ data: Map<string, number> }>(), { initialValues: { data: first } })
    expect(toRaw(form.values.value.data)).toBe(first)
    expect(form.isDirty.value).toBe(false)
    form.setFieldValue('data', new Map([['a', 1]]))
    expect(form.isDirty.value).toBe(true)
    expect(warn.mock.calls.length).toBeLessThanOrEqual(1)
  })
})

describe('dirty state reactivity', () => {
  it('recomputes isDirty and dirtyFields after nested edits once they have been read', () => {
    const form = useFormAction(action(), { initialValues: initial() })
    expect(form.isDirty.value).toBe(false)
    expect(form.dirtyFields.value).toEqual([])
    form.setFieldValue('profile.name', 'Grace')
    expect(form.isDirty.value).toBe(true)
    expect(form.dirtyFields.value).toContain('profile.name')
    form.values.value.addresses[1]!.city = 'Bergen'
    expect(form.dirtyFields.value).toContain('addresses.1.city')
    form.setFieldValue('profile.name', 'Ada')
    form.values.value.addresses[1]!.city = 'Oslo'
    expect(form.isDirty.value).toBe(false)
  })
})
