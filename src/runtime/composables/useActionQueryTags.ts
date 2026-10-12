import { getCurrentScope, onScopeDispose } from 'vue'
import { useNuxtApp } from '#app'
import { registerQueryTags } from '../utils/queryTags'

/** Associate opt-in tags with an explicit useAsyncData/useFetch key. */
export function useActionQueryTags(key: string, tags: readonly string[]): () => void {
  const release = registerQueryTags(useNuxtApp(), key, tags)
  if (getCurrentScope()) onScopeDispose(release)
  return release
}
