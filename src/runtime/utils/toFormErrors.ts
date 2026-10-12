/** Nuxt UI-compatible error shape, without depending on a UI package. */
export function toFormErrors(errors: Readonly<Record<string, readonly string[]>> | undefined): { name: string; message: string }[] {
  return Object.entries(errors || {})
    .filter(([name]) => name !== '_root' && name !== '_errors')
    .flatMap(([name, messages]) => messages.map(message => ({ name, message })))
}
