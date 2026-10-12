let owner: object & { runWithContext: <T>(callback: () => T) => T } = { runWithContext: callback => callback() }
let refresh: (keys: string[]) => Promise<void> = async () => {}

export function useNuxtApp() { return owner }
export function refreshNuxtData(keys: string[]) { return refresh(keys) }
export function setNuxtApp(app: typeof owner) { owner = app }
export function setQueryRefresh(handler: typeof refresh) { refresh = handler }
export function resetNuxtApp() {
  owner = { runWithContext: callback => callback() }
  refresh = async () => {}
}
