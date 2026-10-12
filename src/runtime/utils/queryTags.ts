/** Metadata only, isolated by the current Nuxt app (including each SSR request). */
const registries = new WeakMap<object, Map<string, Map<string, number>>>()

export interface ActionInvalidation {
  keys?: readonly string[]
  tags?: readonly string[]
}

export function registerQueryTags(owner: object, key: string, tags: readonly string[]): () => void {
  if (!key) throw new Error('Query keys must not be empty')
  const uniqueTags = [...new Set(tags.filter(Boolean))]
  if (!uniqueTags.length) return () => {}
  let registry = registries.get(owner)
  if (!registry) { registry = new Map(); registries.set(owner, registry) }
  let entries = registry.get(key)
  if (!entries) { entries = new Map(); registry.set(key, entries) }
  for (const tag of uniqueTags) entries.set(tag, (entries.get(tag) || 0) + 1)
  let released = false
  return () => {
    if (released) return
    released = true
    for (const tag of uniqueTags) {
      const count = entries!.get(tag) || 0
      if (count <= 1) entries!.delete(tag)
      else entries!.set(tag, count - 1)
    }
    if (!entries!.size && registry!.get(key) === entries) registry!.delete(key)
    if (!registry!.size && registries.get(owner) === registry) registries.delete(owner)
  }
}

export function resolveQueryKeys(owner: object, invalidation: ActionInvalidation): string[] {
  const keys = new Set(invalidation.keys?.filter(Boolean))
  const tags = new Set(invalidation.tags?.filter(Boolean))
  for (const [key, entries] of registries.get(owner) || []) {
    if ([...entries.keys()].some(tag => tags.has(tag))) keys.add(key)
  }
  return [...keys]
}
