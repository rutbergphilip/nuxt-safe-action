// Mutable stand-in for the build template; ES live bindings let tests flip it.
// eslint-disable-next-line import/no-mutable-exports
export let reactiveAsyncDataKeys = true
export function setReactiveAsyncDataKeys(value: boolean) { reactiveAsyncDataKeys = value }
