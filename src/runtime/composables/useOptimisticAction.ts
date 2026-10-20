import { readonly, toRaw, getCurrentScope, onScopeDispose } from 'vue'
import type { Ref } from 'vue'
import type { ActionResult, SafeAction, SafeActionReference } from '../types'
import { useAction } from './useAction'
import type { UseActionOptions } from './useAction'

export type UseOptimisticActionOptions<TInput, TOutput, TData, TServerError = string, TBusinessError = never> = UseActionOptions<TInput, TOutput, TServerError, TBusinessError> & {
  currentData: Ref<TData>
  /** Return a new value; do not mutate currentData in place. May be replayed in `merge` mode, so keep it pure. */
  updateFn: (input: TInput, current: TData) => TData
  /**
   * `replace` (default): a newer execution cancels and rolls back the previous one.
   * `merge`: executions run concurrently; each failure rolls back only its own update.
   */
  mode?: 'replace' | 'merge'
}

interface MergeEntry<TInput, TData> { input: TInput; value: TData; confirmed: boolean }

function succeeded(result: ActionResult<unknown, unknown, unknown>): boolean {
  return result.serverError === undefined && result.validationErrors === undefined && result.businessError === undefined
}

/** Output is never assigned to currentData. See `mode` for how concurrent executions interact. */
export function useOptimisticAction<TInput, TOutput, TData, TServerError = string, TBusinessError = never>(
  action: SafeAction<TInput, TOutput, TServerError, TBusinessError> | SafeActionReference<TInput, TOutput, TServerError, TBusinessError>,
  options: UseOptimisticActionOptions<TInput, TOutput, TData, TServerError, TBusinessError>,
) {
  const merge = options.mode === 'merge'
  let pending: { baseline: TData; optimistic: TData } | undefined
  // Merge mode: confirmed base plus ordered updates; each entry caches the value after applying it.
  let base: TData
  let entries: MergeEntry<TInput, TData>[] = []
  let latest: MergeEntry<TInput, TData> | undefined
  function rollback() {
    // An external refresh becomes authoritative; never overwrite it with an older snapshot.
    if (pending && Object.is(options.currentData.value, pending.optimistic)) options.currentData.value = pending.baseline
    pending = undefined
  }
  function owned(): boolean {
    // Same identity guard as replace mode (deep refs return proxies): an external write releases every pending update.
    if (entries.length && !Object.is(toRaw(options.currentData.value), toRaw(entries[entries.length - 1]!.value))) entries = []
    return entries.length > 0
  }
  function replay(from: number) {
    let value = from ? entries[from - 1]!.value : base
    for (let index = from; index < entries.length; index++) {
      try {
        value = entries[index]!.value = options.updateFn(entries[index]!.input, value)
      } catch (error) {
        entries.length = index
        try { console.error('[nuxt-safe-action] Optimistic replay failed:', error) } catch { /* logging is best effort */ }
      }
    }
    options.currentData.value = value
    while (entries[0]?.confirmed) base = entries.shift()!.value
  }
  function settle(entry: MergeEntry<TInput, TData> | undefined, ok: boolean) {
    const index = entry && owned() ? entries.indexOf(entry) : -1
    if (index < 0) return
    if (ok) entry!.confirmed = true
    else entries.splice(index, 1)
    replay(ok ? entries.length : index)
  }
  // Release ownership before user callbacks can start another mutation or reset.
  const execution = useAction(action, {
    ...options,
    onSuccess(args) {
      if (merge) settle(latest, true)
      else pending = undefined
      return options.onSuccess?.(args)
    },
    onError(args) {
      if (merge) settle(latest, false)
      else rollback()
      return options.onError?.(args)
    },
  })
  function cancel() {
    execution.cancel()
    if (!merge) return rollback()
    if (!owned()) return
    entries = entries.filter(entry => entry.confirmed)
    replay(0)
  }
  async function executeAsync(input: TInput) {
    if (!merge) {
      cancel()
      const baseline = options.currentData.value
      options.currentData.value = options.updateFn(input, baseline)
      pending = { baseline, optimistic: options.currentData.value }
      return execution.executeAsync(input)
    }
    const current = options.currentData.value
    if (!owned()) base = current
    const entry: MergeEntry<TInput, TData> = { input, value: options.updateFn(input, current), confirmed: false }
    entries.push(entry)
    options.currentData.value = entry.value
    latest = entry
    const result = await execution.executeAsync(input)
    // Callbacks only fire for the latest execution; earlier ones settle here.
    settle(entry, succeeded(result))
    return result
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
