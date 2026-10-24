import { ref, computed, readonly, getCurrentScope, onScopeDispose } from 'vue'
import { useNuxtApp, refreshNuxtData } from '#app'
import { resolveQueryKeys } from '../utils/queryTags'
import { registerActionOwnership } from '../utils/actionOwnership'
import type { ActionInvalidation } from '../utils/queryTags'
import type { SafeAction, SafeActionReference, ActionResult, ActionClientError, ActionStatus, ValidationErrors, UseActionReturn, UseActionCallbacks } from '../types'

export interface ActionRequestOptions {
  headers?: HeadersInit | (() => HeadersInit)
  credentials?: RequestCredentials
  signal?: AbortSignal
  /** Timeout in milliseconds. No timeout is applied by default. */
  timeout?: number
  /** Opt in to aborting owned requests when the component scope is disposed. */
  abortOnDispose?: boolean
  cancelPrevious?: boolean
  /** Refresh only these explicitly selected Nuxt keys / opt-in tags after success. */
  invalidate?: ActionInvalidation
}

class ActionTransportError extends Error {
  constructor(message: string, readonly kind: ActionClientError['kind'], readonly status?: number) {
    super(message)
  }
}

function toClientError(error: unknown, signal: AbortSignal, timedOut: boolean): ActionClientError {
  const message = error instanceof Error ? error.message : 'An unexpected error occurred'
  if (timedOut) return { kind: 'timeout', message }
  if (signal.aborted) return { kind: 'aborted', message }
  if (error instanceof ActionTransportError) return { kind: error.kind, message, ...(error.status === undefined ? {} : { status: error.status }) }
  const fetchError = error as { statusCode?: unknown, response?: { status?: unknown } } | null
  const status = fetchError?.statusCode ?? fetchError?.response?.status
  if (typeof status === 'number') return { kind: 'http', message, status }
  return { kind: 'network', message }
}

export type UseActionOptions<TInput, TOutput, TServerError = string, TBusinessError = never> = UseActionCallbacks<TInput, TOutput, TServerError, TBusinessError> & ActionRequestOptions

/** Latest execution owns reactive state; each call still resolves its own result. */
export function useAction<TInput, TOutput, TServerError = string, TBusinessError = never>(
  action: SafeAction<TInput, TOutput, TServerError, TBusinessError> | SafeActionReference<TInput, TOutput, TServerError, TBusinessError>,
  options: UseActionOptions<TInput, TOutput, TServerError, TBusinessError> = {},
): UseActionReturn<TInput, TOutput, TServerError, TBusinessError> & { cancel: () => void } {
  const reference = action as SafeActionReference<TInput, TOutput, TServerError, TBusinessError> & { __safeActionMethod?: string }
  const actionPath = reference.__safeActionPath
  const actionMethod = reference.__safeActionMethod || 'POST'
  const data = ref<TOutput>() as import('vue').Ref<TOutput | undefined>
  const serverError = ref<TServerError>() as import('vue').Ref<TServerError | undefined>
  const clientError = ref<ActionClientError>()
  const validationErrors = ref<ValidationErrors>()
  const status = ref<ActionStatus>('idle')
  const businessError = ref<TBusinessError>() as import('vue').Ref<TBusinessError | undefined>
  const isRefreshing = ref(false)
  const refreshError = ref<Error | null>(null)
  const nuxtApp = options.invalidate ? useNuxtApp() : undefined
  const requests = new Set<AbortController>()
  let revision = 0

  function diagnose(error: unknown): void {
    // User callbacks cannot alter a completed action's transport result.
    try { console.error('[nuxt-safe-action] Action callback failed:', error) } catch { /* logging is best effort */ }
  }

  function notify(callback: (() => unknown) | undefined): void {
    if (!callback) return
    try { void Promise.resolve(callback()).catch(diagnose) } catch (error) { diagnose(error) }
  }

  function invalidate(): void {
    revision++
    status.value = 'idle'
    isRefreshing.value = false
    refreshError.value = null
  }

  function cancel(): void {
    invalidate()
    for (const controller of requests) controller.abort()
  }

  function reset(): void {
    cancel()
    data.value = undefined
    serverError.value = undefined
    clientError.value = undefined
    validationErrors.value = undefined
    businessError.value = undefined
  }

  if (options.abortOnDispose && getCurrentScope()) onScopeDispose(cancel)

  async function executeAsync(input: TInput): Promise<ActionResult<TOutput, TServerError, TBusinessError>> {
    if (options.cancelPrevious) cancel()
    const ownRevision = ++revision
    const controller = new AbortController()
    requests.add(controller)
    serverError.value = undefined
    clientError.value = undefined
    validationErrors.value = undefined
    status.value = 'executing'
    businessError.value = undefined
    isRefreshing.value = false
    refreshError.value = null
    notify(options.onExecute && (() => options.onExecute!({ input })))
    let timer: ReturnType<typeof setTimeout> | undefined
    let timedOut = false
    let rejectAbort: (error: Error) => void = () => {}
    const aborted = new Promise<never>((_, reject) => { rejectAbort = reject })
    const onAbort = () => rejectAbort(new Error(controller.signal.reason instanceof Error ? controller.signal.reason.message : 'Action request cancelled'))
    controller.signal.addEventListener('abort', onAbort, { once: true })
    const externalAbort = () => controller.abort(options.signal?.reason)
    options.signal?.addEventListener('abort', externalAbort, { once: true })
    if (options.signal?.aborted) externalAbort()
    if (options.timeout !== undefined && options.timeout > 0) {
      timer = setTimeout(() => {
        timedOut = true
        controller.abort(new Error('Action request timed out'))
      }, options.timeout)
    }

    let result: ActionResult<TOutput, TServerError, TBusinessError>
    try {
      if (typeof actionPath !== 'string' || !actionPath) throw new ActionTransportError('Expected a typed action reference from #safe-action/actions', 'invalid-reference')
      const url = actionMethod === 'GET' && input !== undefined
        ? `/api/_actions/${actionPath}?input=${encodeURIComponent(JSON.stringify(input))}`
        : `/api/_actions/${actionPath}`
      const headers = new Headers(typeof options.headers === 'function' ? options.headers() : options.headers)
      if (actionMethod !== 'GET' && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
      const body = actionMethod === 'GET' ? undefined : JSON.stringify(input)
      const request: RequestInit = { method: actionMethod, headers, signal: controller.signal, credentials: options.credentials, body }
      const transport = async (): Promise<unknown> => {
        if (controller.signal.aborted) throw new Error('Action request cancelled')
        if (options.detached) {
          const response = await fetch(url, request)
          if (!response.ok) throw new ActionTransportError(`HTTP ${response.status}`, 'http', response.status)
          return response.json()
        }
        // Disable ofetch's automatic retries: repeating mutations requires application-level idempotency.
        return $fetch(url, {
          method: actionMethod as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
          headers, signal: controller.signal, credentials: options.credentials, retry: 0,
          ...(actionMethod === 'GET' ? {} : { body }),
        })
      }
      const payload = await Promise.race([aborted, transport()])
      if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) throw new ActionTransportError('Invalid action response', 'invalid-response')
      // clientError is reserved for failures observed on this side of the wire.
      const { clientError: _serverSupplied, ...envelope } = payload as ActionResult<TOutput, TServerError, TBusinessError>
      result = envelope
    } catch (error) {
      const failure = toClientError(error, controller.signal, timedOut)
      result = { serverError: failure.message as TServerError, clientError: failure }
    } finally {
      if (timer !== undefined) clearTimeout(timer)
      options.signal?.removeEventListener('abort', externalAbort)
      controller.signal.removeEventListener('abort', onAbort)
      requests.delete(controller)
    }

    // A run that owns state when it completes delivers its whole lifecycle: once
    // onSuccess/onError fire, a reset() or new execution started from them only
    // releases reactive state, not this run's refresh or onSettled.
    if (ownRevision === revision) {
      if (result.serverError !== undefined || result.validationErrors !== undefined || result.businessError !== undefined) {
        serverError.value = result.serverError
        clientError.value = result.clientError
        validationErrors.value = result.validationErrors
        businessError.value = result.businessError
        status.value = 'hasErrored'
        notify(options.onError && (() => options.onError!({ error: { serverError: result.serverError, validationErrors: result.validationErrors, businessError: result.businessError, ...(result.clientError ? { clientError: result.clientError } : {}) }, input })))
      } else {
        // A void action serializes as {}; undefined is a valid success value.
        data.value = result.data
        status.value = 'hasSucceeded'
        notify(options.onSuccess && (() => options.onSuccess!({ data: result.data as TOutput, input })))
      }
      if (result.serverError === undefined && result.validationErrors === undefined && result.businessError === undefined && options.invalidate && nuxtApp) {
        try {
          const keys = resolveQueryKeys(nuxtApp, options.invalidate)
          if (keys.length) {
            if (ownRevision === revision) isRefreshing.value = true
            await nuxtApp.runWithContext(() => refreshNuxtData(keys))
          }
        } catch (error) {
          if (ownRevision === revision) refreshError.value = error instanceof Error ? error : new Error(String(error))
        } finally {
          if (ownRevision === revision) isRefreshing.value = false
        }
      }
      notify(options.onSettled && (() => options.onSettled!({ result, input })))
    }
    return result
  }

  function execute(input: TInput): void { void executeAsync(input) }
  const state = {
    execute, executeAsync, cancel, reset,
    businessError: readonly(businessError) as Readonly<import('vue').Ref<TBusinessError | undefined>>,
    isRefreshing: readonly(isRefreshing), refreshError: readonly(refreshError),
    data: readonly(data) as Readonly<import('vue').Ref<TOutput | undefined>>,
    serverError: readonly(serverError) as Readonly<import('vue').Ref<TServerError | undefined>>,
    clientError: readonly(clientError) as Readonly<import('vue').Ref<ActionClientError | undefined>>,
    validationErrors: readonly(validationErrors) as Readonly<import('vue').Ref<ValidationErrors | undefined>>, status: readonly(status),
    isIdle: computed(() => status.value === 'idle'),
    isExecuting: computed(() => status.value === 'executing'),
    hasSucceeded: computed(() => status.value === 'hasSucceeded'),
    hasErrored: computed(() => status.value === 'hasErrored'),
  }
  registerActionOwnership(state, invalidate)
  return state
}
