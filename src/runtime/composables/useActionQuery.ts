import { computed, getCurrentScope, onScopeDispose, toValue, watch } from 'vue'
import type { ComputedRef, MaybeRefOrGetter, Ref } from 'vue'
import { useAsyncData, useNuxtApp, useRequestHeaders } from '#app'
import { reactiveAsyncDataKeys } from '#safe-action/config'
import { useAction } from './useAction'
import { registerQueryTags } from '../utils/queryTags'
import { actionQueryKey } from '../utils/queryKey'
import type { ActionRequestOptions } from './useAction'
import type { SafeAction, SafeActionReference, ActionResult, ActionClientError, ValidationErrors } from '../types'

export type ActionQueryStatus = 'idle' | 'pending' | 'success' | 'error'

export interface UseActionQueryOptions extends Pick<ActionRequestOptions, 'headers' | 'credentials' | 'timeout'> {
  /** Replaces the generated `safe-action:<path>:<input hash>` key. Reactive on Nuxt >= 3.17. */
  key?: MaybeRefOrGetter<string>
  /** Opt-in tags for `useAction(..., { invalidate: { tags } })`. */
  tags?: readonly string[]
  /**
   * Request headers forwarded to the action during SSR only. Never forwards all headers.
   * @default ['cookie']
   */
  forwardHeaders?: readonly string[] | false
  server?: boolean
  lazy?: boolean
  immediate?: boolean
  dedupe?: 'cancel' | 'defer'
}

export interface UseActionQueryReturn<TOutput, TServerError = string, TBusinessError = never> {
  data: ComputedRef<TOutput | undefined>
  serverError: ComputedRef<TServerError | undefined>
  businessError: ComputedRef<TBusinessError | undefined>
  validationErrors: ComputedRef<ValidationErrors | undefined>
  clientError: ComputedRef<ActionClientError | undefined>
  /** The latest action envelope, as stored in the Nuxt payload. */
  result: Readonly<Ref<ActionResult<TOutput, TServerError, TBusinessError> | undefined>>
  /** Nuxt's status, except a settled envelope carrying an error reports `'error'`. */
  status: ComputedRef<ActionQueryStatus>
  pending: ComputedRef<boolean>
  hasErrored: ComputedRef<boolean>
  /** Errors thrown by the Nuxt data layer itself; action failures live in the envelope. */
  error: Readonly<Ref<unknown>>
  key: ComputedRef<string>
  refresh: () => Promise<void>
  execute: () => Promise<void>
  clear: () => void
}

function hasEnvelopeError(result: ActionResult<unknown, unknown, unknown> | undefined | null): boolean {
  return !!result && (result.serverError !== undefined || result.validationErrors !== undefined || result.businessError !== undefined)
}

type QueryAction<TInput, TOutput, TServerError, TBusinessError> =
  SafeAction<TInput, TOutput, TServerError, TBusinessError> | SafeActionReference<TInput, TOutput, TServerError, TBusinessError>

/** Typed, SSR-hydrated read of an action, cached by Nuxt per input. */
export function useActionQuery<TInput, TOutput, TServerError = string, TBusinessError = never>(
  action: QueryAction<TInput, TOutput, TServerError, TBusinessError>,
  ...args: undefined extends TInput
    ? [input?: MaybeRefOrGetter<TInput>, options?: UseActionQueryOptions]
    : [input: MaybeRefOrGetter<TInput>, options?: UseActionQueryOptions]
): UseActionQueryReturn<TOutput, TServerError, TBusinessError> & Promise<UseActionQueryReturn<TOutput, TServerError, TBusinessError>> {
  const [input, options = {}] = args as [MaybeRefOrGetter<TInput> | undefined, UseActionQueryOptions | undefined]
  const path = (action as unknown as SafeActionReference).__safeActionPath
  const forwarded = options.forwardHeaders === false ? {} : useRequestHeaders([...(options.forwardHeaders ?? ['cookie'])])
  const requestedKey = computed(() => options.key === undefined ? actionQueryKey(path, toValue(input)) : toValue(options.key))
  // Older Nuxt fixes the key at setup; the query then refetches under it when the input changes.
  const fixedKey = requestedKey.value
  const key = reactiveAsyncDataKeys ? requestedKey : computed(() => fixedKey)

  function headers(): Headers {
    const merged = new Headers()
    for (const [name, value] of Object.entries(forwarded)) if (value !== undefined) merged.set(name, value)
    const own = typeof options.headers === 'function' ? options.headers() : options.headers
    new Headers(own).forEach((value, name) => merged.set(name, value))
    return merged
  }

  const handler = (_nuxtApp: unknown, context?: { signal?: AbortSignal }) => useAction(action, {
    headers, credentials: options.credentials, timeout: options.timeout, signal: context?.signal,
  }).executeAsync(toValue(input) as TInput)

  const asyncOptions = {
    server: options.server, lazy: options.lazy, immediate: options.immediate, dedupe: options.dedupe,
    ...(reactiveAsyncDataKeys ? {} : { watch: [requestedKey] }),
  }
  const asyncData = useAsyncData(reactiveAsyncDataKeys ? key : fixedKey, handler, asyncOptions)

  if (options.tags?.length) {
    const nuxtApp = useNuxtApp()
    let release = () => {}
    const stop = watch(key, (current) => {
      release()
      release = registerQueryTags(nuxtApp, current, options.tags!)
    }, { immediate: true, flush: 'sync' })
    if (getCurrentScope()) onScopeDispose(() => { stop(); release() })
  }

  const result = computed(() => (asyncData.data.value ?? undefined) as ActionResult<TOutput, TServerError, TBusinessError> | undefined)
  const hasErrored = computed(() => hasEnvelopeError(result.value) || asyncData.status.value === 'error')
  const status = computed<ActionQueryStatus>(() => asyncData.status.value === 'success' && hasErrored.value ? 'error' : asyncData.status.value)
  const state: UseActionQueryReturn<TOutput, TServerError, TBusinessError> = {
    result,
    data: computed(() => result.value?.data),
    serverError: computed(() => result.value?.serverError),
    businessError: computed(() => result.value?.businessError),
    validationErrors: computed(() => result.value?.validationErrors),
    clientError: computed(() => result.value?.clientError),
    status,
    pending: computed(() => asyncData.status.value === 'pending'),
    hasErrored,
    error: asyncData.error,
    key,
    refresh: () => asyncData.refresh(),
    execute: () => asyncData.execute(),
    clear: () => asyncData.clear(),
  }
  return Object.assign(Promise.resolve(asyncData).then(() => state), state)
}
