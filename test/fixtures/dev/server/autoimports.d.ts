// The root package typecheck does not load this fixture's generated Nitro globals.
// These type-only declarations mirror public autoimports; dev execution still
// depends on Nitro injecting the actual runtime imports in the action file.
export {}
declare global {
  const createSafeActionClient: typeof import('#safe-action')['createSafeActionClient']
  const returnValidationErrors: typeof import('#safe-action')['returnValidationErrors']
  const ActionError: typeof import('#safe-action')['ActionError']
}
