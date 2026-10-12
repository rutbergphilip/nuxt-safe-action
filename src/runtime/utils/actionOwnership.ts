// Internal ownership handoff for wrappers that do asynchronous work before a request.
// Invalidating presentation does not cancel an older caller's transport promise.
const invalidators = new WeakMap<object, () => void>()

export function registerActionOwnership(action: object, invalidate: () => void): void { invalidators.set(action, invalidate) }
export function invalidateActionOwnership(action: object): void { invalidators.get(action)?.() }
