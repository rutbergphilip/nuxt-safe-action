import { computed, ref, toValue, watch } from 'vue'
import type { MaybeRefOrGetter, WatchSource } from 'vue'

let owner: object & { runWithContext: <T>(callback: () => T) => T } = { runWithContext: callback => callback() }
let refresh: (keys: string[]) => Promise<void> = async () => {}

export function useNuxtApp() { return owner }
export function refreshNuxtData(keys: string[]) { return refresh(keys) }
export function setNuxtApp(app: typeof owner) { owner = app }
export function setQueryRefresh(handler: typeof refresh) { refresh = handler }
export function resetNuxtApp() {
  owner = { runWithContext: callback => callback() }
  refresh = async () => {}
  requestHeaders = {}
  asyncDataCalls.length = 0
}

// Minimal useAsyncData: keyed, abortable, awaitable; enough to exercise useActionQuery wiring.

export interface AsyncDataCall { key: MaybeRefOrGetter<string>, options: Record<string, unknown> }
export const asyncDataCalls: AsyncDataCall[] = []
let requestHeaders: Record<string, string> = {}
export function setRequestHeaders(headers: Record<string, string>) { requestHeaders = headers }
export function useRequestHeaders(include?: string[]) {
  return Object.fromEntries(Object.entries(requestHeaders).filter(([name]) => !include || include.includes(name)))
}

export function useAsyncData(key: MaybeRefOrGetter<string>, handler: (app: unknown, ctx: { signal: AbortSignal }) => Promise<unknown>, options: { immediate?: boolean, watch?: WatchSource[] } = {}) {
  asyncDataCalls.push({ key, options })
  const data = ref<unknown>(null)
  const error = ref<unknown>(null)
  const status = ref<'idle' | 'pending' | 'success' | 'error'>('idle')
  let controller: AbortController | undefined
  async function refresh() {
    controller?.abort()
    const own = controller = new AbortController()
    status.value = 'pending'
    try {
      const value = await handler(owner, { signal: own.signal })
      if (own.signal.aborted) return
      data.value = value
      status.value = 'success'
    } catch (reason) {
      if (own.signal.aborted) return
      error.value = reason
      status.value = 'error'
    }
  }
  watch(computed(() => toValue(key)), () => { void refresh() })
  if (options.watch) watch(options.watch, () => { void refresh() })
  const state = { data, error, status, refresh, execute: refresh, clear: () => { data.value = null; status.value = 'idle' } }
  const promise = options.immediate === false ? Promise.resolve() : refresh()
  return Object.assign(promise.then(() => state), state)
}
