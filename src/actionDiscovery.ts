import { existsSync, readdirSync } from 'node:fs'
import { basename, join, relative } from 'node:path'

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete'
const HTTP_METHODS: readonly HttpMethod[] = ['get', 'post', 'put', 'patch', 'delete']
export interface ActionFileInfo {
  name: string
  filePath: string
  method: HttpMethod
  exportName: string
}

/** Discover deterministic routes; reject ambiguity instead of silently shadowing actions. */
export function scanActionFiles(dir: string): ActionFileInfo[] {
  const found: Omit<ActionFileInfo, 'exportName'>[] = []
  function visit(folder: string, prefix = '') {
    if (!existsSync(folder)) return
    for (const entry of readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const filePath = join(folder, entry.name)
      const name = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) visit(filePath, name)
      else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts') && entry.name !== 'index.ts') {
        const raw = basename(entry.name, '.ts')
        const match = raw.match(/^(.*)\.(get|post|put|patch|delete)$/i)
        const actionName = match ? match[1]! : raw
        const method = match ? match[2]!.toLowerCase() as HttpMethod : 'post'
        if (!HTTP_METHODS.includes(method) || !/^[a-z_][\w-]*(?:\/[a-z_][\w-]*)*$/i.test(prefix ? `${prefix}/${actionName}` : actionName)) {
          throw new Error(`[nuxt-safe-action] Invalid action filename: ${filePath}. Use letters, numbers, underscores and hyphens; names must start with a letter or underscore.`)
        }
        found.push({ name: prefix ? `${prefix}/${actionName}` : actionName, filePath, method })
      }
    }
  }
  visit(dir)
  const routes = new Set<string>()
  const exports = new Map<string, string>()
  return found.map((action) => {
    const route = `${action.method} ${action.name}`
    if (routes.has(route)) throw new Error(`[nuxt-safe-action] Duplicate action route ${route}: ${action.filePath}`)
    routes.add(route)
    const base = action.name.replace(/[/-](\w)/g, (_, c: string) => c.toUpperCase()).replace(/^(\w)/, (_, c: string) => c.toLowerCase())
    const variants = found.filter(item => item.name === action.name).length
    const exportName = variants > 1 ? `${base}${action.method[0]!.toUpperCase()}${action.method.slice(1)}` : base
    if (!/^[a-z_$][\w$]*$/i.test(exportName)) throw new Error(`[nuxt-safe-action] Invalid action export name ${exportName}: ${action.filePath}. Use single hyphens between name segments.`)
    if (RESERVED_NAMES.has(exportName)) throw new Error(`[nuxt-safe-action] Reserved action export name ${exportName}: ${action.filePath}`)
    const previous = exports.get(exportName)
    if (previous) throw new Error(`[nuxt-safe-action] Action export collision ${exportName}: ${previous} and ${action.filePath}`)
    exports.set(exportName, action.filePath)
    return { ...action, exportName }
  })
}
const RESERVED_NAMES = new Set('await break case catch class const continue debugger default delete do else enum export extends false finally for function if import in instanceof interface let new null package private protected public return static super switch this throw true try typeof var void while with yield implements eval arguments'.split(' '))

export function generateReferences(actions: ActionFileInfo[], outputDir: string): string {
  if (!actions.length) return 'export {}\n'
  const lines = ["import type { SafeActionReference } from '#safe-action'", '']
  for (const action of actions) {
    let filePath = relative(outputDir, action.filePath).replaceAll('\\', '/').replace(/\.ts$/, '')
    if (!filePath.startsWith('.')) filePath = `./${filePath}`
    lines.push(`import type _action_${action.exportName} from ${JSON.stringify(filePath)}`)
  }
  lines.push('')
  for (const action of actions) {
    lines.push(`export const ${action.exportName}: SafeActionReference<(typeof _action_${action.exportName})['_types']['input'], (typeof _action_${action.exportName})['_types']['output'], (typeof _action_${action.exportName})['_types']['serverError']> = Object.freeze({ __safeActionPath: ${JSON.stringify(action.name)}, __safeActionMethod: ${JSON.stringify(action.method.toUpperCase())} }) as any`)
  }
  return lines.join('\n') + '\n'
}
