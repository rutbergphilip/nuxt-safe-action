import { ref, computed, readonly, getCurrentScope, onScopeDispose } from 'vue'
import type { SafeAction, SafeActionReference, ActionResult, ActionStatus, ValidationErrors, UseActionReturn, UseActionCallbacks } from '../types'

export interface ActionRequestOptions {
  headers?: HeadersInit | (() => HeadersInit)
  credentials?: RequestCredentials
  signal?: AbortSignal
  /** Timeout in milliseconds. No timeout is applied by default. */
  timeout?: number
  /** Opt in to aborting owned requests when the component scope is disposed. */
  abortOnDispose?: boolean
  cancelPrevious?: boolean
}

export type UseActionOptions<TInput, TOutput, TServerError = string> = UseActionCallbacks<TInput, TOutput, TServerError> & ActionRequestOptions

/** Latest execution owns reactive state; each call still resolves its own result. */
export function useAction<TInput, TOutput, TServerError = string>(
  action: SafeAction<TInput, TOutput, TServerError> | SafeActionReference<TInput, TOutput, TServerError>,
  options: UseActionOptions<TInput, TOutput, TServerError> = {},
): UseActionReturn<TInput, TOutput, TServerError> & { cancel: () => void } {
  const reference = action as SafeActionReference<TInput, TOutput, TServerError> & { __safeActionMethod?: string }
  const actionPath = reference.__safeActionPath
  const actionMethod = reference.__safeActionMethod || 'POST'
  const data = ref<TOutput>() as import('vue').Ref<TOutput | undefined>
  const serverError = ref<TServerError>() as import('vue').Ref<TServerError | undefined>
  const validationErrors = ref<ValidationErrors>()
  const status = ref<ActionStatus>('idle')
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

  function cancel(): void {
    revision++
    for (const controller of requests) controller.abort()
    status.value = 'idle'
  }

  function reset(): void {
    cancel()
    data.value = undefined
    serverError.value = undefined
    validationErrors.value = undefined
  }

  if (options.abortOnDispose && getCurrentScope()) onScopeDispose(cancel)

  async function executeAsync(input: TInput): Promise<ActionResult<TOutput, TServerError>> {
    if (options.cancelPrevious) cancel()
    const ownRevision = ++revision
    const controller = new AbortController()
    requests.add(controller)
    serverError.value = undefined
    validationErrors.value = undefined
    status.value = 'executing'
    notify(options.onExecute && (() => options.onExecute!({ input })))
    let timer: ReturnType<typeof setTimeout> | undefined
    let rejectAbort: (error: Error) => void = () => {}
    const aborted = new Promise<never>((_, reject) => { rejectAbort = reject })
    const onAbort = () => rejectAbort(new Error(controller.signal.reason instanceof Error ? controller.signal.reason.message : 'Action request cancelled'))
    controller.signal.addEventListener('abort', onAbort, { once: true })
    const externalAbort = () => controller.abort(options.signal?.reason)
    options.signal?.addEventListener('abort', externalAbort, { once: true })
    if (options.signal?.aborted) externalAbort()
    if (options.timeout !== undefined && options.timeout > 0) {
      timer = setTimeout(() => controller.abort(new Error('Action request timed out')), options.timeout)
    }

    let result: ActionResult<TOutput, TServerError>
    try {
      if (typeof actionPath !== 'string' || !actionPath) throw new Error('Expected a typed action reference from #safe-action/actions')
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
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
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
      if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid action response')
      result = payload as ActionResult<TOutput, TServerError>
    } catch (error) {
      result = { serverError: (error instanceof Error ? error.message : 'An unexpected error occurred') as TServerError }
    } finally {
      if (timer !== undefined) clearTimeout(timer)
      options.signal?.removeEventListener('abort', externalAbort)
      controller.signal.removeEventListener('abort', onAbort)
      requests.delete(controller)
    }

    if (ownRevision === revision) {
      if (result.serverError !== undefined || result.validationErrors !== undefined) {
        serverError.value = result.serverError
        validationErrors.value = result.validationErrors
        status.value = 'hasErrored'
        notify(options.onError && (() => options.onError!({ error: { serverError: result.serverError, validationErrors: result.validationErrors }, input })))
      } else {
        // A void action serializes as {}; undefined is a valid success value.
        data.value = result.data
        status.value = 'hasSucceeded'
        notify(options.onSuccess && (() => options.onSuccess!({ data: result.data as TOutput, input })))
      }
      if (ownRevision === revision) notify(options.onSettled && (() => options.onSettled!({ result, input })))
    }
    return result
  }

  function execute(input: TInput): void { void executeAsync(input) }
  return {
    execute, executeAsync, cancel, reset,
    data: readonly(data) as Readonly<import('vue').Ref<TOutput | undefined>>,
    serverError: readonly(serverError) as Readonly<import('vue').Ref<TServerError | undefined>>,
    validationErrors: readonly(validationErrors) as Readonly<import('vue').Ref<ValidationErrors | undefined>>, status: readonly(status),
    isIdle: computed(() => status.value === 'idle'),
    isExecuting: computed(() => status.value === 'executing'),
    hasSucceeded: computed(() => status.value === 'hasSucceeded'),
    hasErrored: computed(() => status.value === 'hasErrored'),
  }
}
