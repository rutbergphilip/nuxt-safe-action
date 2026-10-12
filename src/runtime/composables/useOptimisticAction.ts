import { readonly, getCurrentScope, onScopeDispose } from 'vue'
import type { Ref } from 'vue'
import type { SafeAction, SafeActionReference } from '../types'
import { useAction } from './useAction'
import type { UseActionOptions } from './useAction'

export type UseOptimisticActionOptions<TInput, TOutput, TData, TServerError = string, TBusinessError = never> = UseActionOptions<TInput, TOutput, TServerError, TBusinessError> & {
  currentData: Ref<TData>
  /** Return a new value; do not mutate currentData in place. */
  updateFn: (input: TInput, current: TData) => TData
}

/** A newer execution replaces the previous optimistic operation. Output is never assigned to currentData. */
export function useOptimisticAction<TInput, TOutput, TData, TServerError = string, TBusinessError = never>(
  action: SafeAction<TInput, TOutput, TServerError, TBusinessError> | SafeActionReference<TInput, TOutput, TServerError, TBusinessError>,
  options: UseOptimisticActionOptions<TInput, TOutput, TData, TServerError, TBusinessError>,
) {
  let pending: { baseline: TData; optimistic: TData } | undefined
  function rollback() {
    // An external refresh becomes authoritative; never overwrite it with an older snapshot.
    if (pending && Object.is(options.currentData.value, pending.optimistic)) options.currentData.value = pending.baseline
    pending = undefined
  }
  // Release ownership before user callbacks can start another mutation or reset.
  const execution = useAction(action, {
    ...options,
    onSuccess(args) {
      pending = undefined
      return options.onSuccess?.(args)
    },
    onError(args) {
      rollback()
      return options.onError?.(args)
    },
  })
  function cancel() {
    execution.cancel()
    rollback()
  }
  async function executeAsync(input: TInput) {
    cancel()
    const baseline = options.currentData.value
    options.currentData.value = options.updateFn(input, baseline)
    pending = { baseline, optimistic: options.currentData.value }
    return execution.executeAsync(input)
  }
  function execute(input: TInput): void {
    void executeAsync(input).catch((error) => {
      try { console.error('[nuxt-safe-action] Optimistic update failed:', error) } catch { /* logging is best effort */ }
    })
  }
  function reset() { cancel(); execution.reset() }
  if (options.abortOnDispose && getCurrentScope()) onScopeDispose(cancel)
  return { ...execution, execute, executeAsync, cancel, reset, optimisticData: readonly(options.currentData) as Readonly<Ref<TData>> }
}
