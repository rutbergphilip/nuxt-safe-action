/** JSON with object keys sorted, so equal inputs share one cache entry. */
export function stableStringify(value: unknown): string | undefined {
  return JSON.stringify(value, (_key, current: unknown) => {
    if (current === null || typeof current !== 'object' || Array.isArray(current)) return current
    const prototype = Object.getPrototypeOf(current)
    if (prototype !== Object.prototype && prototype !== null) return current
    const record = current as Record<string, unknown>
    return Object.fromEntries(Object.keys(record).sort().map(name => [name, record[name]]))
  })
}

/** cyrb53: a fast, well-distributed 53-bit string hash; not cryptographic. */
function hash(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index)
    h1 = Math.imul(h1 ^ code, 2654435761)
    h2 = Math.imul(h2 ^ code, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

export function actionQueryKey(path: string, input: unknown): string {
  const serialized = stableStringify(input)
  return serialized === undefined ? `safe-action:${path}` : `safe-action:${path}:${hash(serialized)}`
}
