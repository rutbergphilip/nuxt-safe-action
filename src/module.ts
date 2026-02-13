import { existsSync, readdirSync } from 'node:fs'
import { join, basename, posix } from 'node:path'
import {
  defineNuxtModule,
  createResolver,
  addImportsDir,
  addServerImports,
  addTemplate,
  useLogger,
} from '@nuxt/kit'

const logger = useLogger('nuxt-safe-action')

export interface ModuleOptions {
  /**
   * Directory where action files are located, relative to the server directory.
   * @default 'actions'
   */
  actionsDir?: string
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'nuxt-safe-action',
    configKey: 'safeAction',
    compatibility: {
      nuxt: '>=3.0.0',
    },
  },
  defaults: {
    actionsDir: 'actions',
  },
  setup(options, nuxt) {
    const { resolve } = createResolver(import.meta.url)

    addImportsDir(resolve('./runtime/composables'))

    addServerImports([
      { name: 'createSafeActionClient', from: resolve('./runtime/server/createSafeActionClient') },
      { name: 'ActionError', from: resolve('./runtime/server/errors') },
      { name: 'ActionValidationError', from: resolve('./runtime/server/errors') },
      { name: 'returnValidationErrors', from: resolve('./runtime/server/errors') },
    ])

    nuxt.options.alias['#safe-action'] = resolve('./runtime/server/index')

    const actionsDir = options.actionsDir || 'actions'

    nuxt.hook('nitro:config', (nitroConfig) => {
      const serverDir = nuxt.options.serverDir
      const fullActionsDir = join(serverDir, actionsDir)

      if (!existsSync(fullActionsDir)) {
        logger.info(
          `No actions directory found at ${fullActionsDir} — skipping action route generation.`,
        )
        return
      }

      const actionFiles = scanActionFiles(fullActionsDir)

      if (actionFiles.length === 0) {
        logger.info('No action files found.')
        return
      }

      logger.info(
        `Found ${actionFiles.length} action file(s): ${actionFiles.map((a) => `${a.method.toUpperCase()} ${a.name}`).join(', ')}`,
      )

      nitroConfig.virtual = nitroConfig.virtual || {}
      nitroConfig.handlers = nitroConfig.handlers || []

      for (const action of actionFiles) {
        const virtualKey = `#safe-action-handler/${action.name}`
        nitroConfig.virtual[virtualKey] = generateHandlerCode(action)

        nitroConfig.handlers.push({
          route: `/api/_actions/${action.name}`,
          method: action.method,
          handler: virtualKey,
        })
      }
    })

    const serverDir = nuxt.options.serverDir
    const fullActionsDir = join(serverDir, actionsDir)

    // Types are embedded in .ts (not .d.ts) because TypeScript ignores
    // .d.ts when a .ts file exists at the same path.
    addTemplate({
      filename: 'safe-action/actions.ts',
      write: true,
      getContents: () => {
        if (!existsSync(fullActionsDir)) {
          return 'export {}\n'
        }

        const actionFiles = scanActionFiles(fullActionsDir)
        if (actionFiles.length === 0) {
          return 'export {}\n'
        }

        const lines: string[] = [
          `import type { SafeActionReference } from '#safe-action'`,
          '',
        ]

        for (const action of actionFiles) {
          const exportName = toCamelCase(action.name)
          const fileBasename = action.method === 'post'
            ? action.name
            : `${action.name}.${action.method}`
          const relativePath = posix.join('../..', 'server', actionsDir, fileBasename)
          lines.push(`import type _action_${exportName} from '${relativePath}'`)
        }

        lines.push('')

        for (const action of actionFiles) {
          const exportName = toCamelCase(action.name)
          lines.push(
            `export const ${exportName}: SafeActionReference<(typeof _action_${exportName})['_types']['input'], (typeof _action_${exportName})['_types']['output'], (typeof _action_${exportName})['_types']['serverError']> = Object.freeze({ __safeActionPath: '${action.name}', __safeActionMethod: '${action.method.toUpperCase()}' }) as any`,
          )
        }

        return lines.join('\n') + '\n'
      },
    })

    nuxt.hook('prepare:types', ({ tsConfig }) => {
      tsConfig.compilerOptions = tsConfig.compilerOptions || {}
      tsConfig.compilerOptions.paths = tsConfig.compilerOptions.paths || {}
      tsConfig.compilerOptions.paths['#safe-action/actions'] = ['./safe-action/actions']
      tsConfig.compilerOptions.paths['#safe-action'] = [
        resolve('./runtime/server/index').replace(/\.ts$/, ''),
      ]
    })

    nuxt.options.alias['#safe-action/actions'] = join(nuxt.options.buildDir, 'safe-action/actions')
  },
})

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete'

const HTTP_METHODS: readonly HttpMethod[] = ['get', 'post', 'put', 'patch', 'delete'] as const

interface ActionFileInfo {
  name: string
  filePath: string
  method: HttpMethod
}

/**
 * Parse an optional HTTP method suffix from a filename.
 * e.g. 'get-user.get' → { name: 'get-user', method: 'get' }
 *      'create-post'  → { name: 'create-post', method: 'post' }
 */
function parseMethodSuffix(filename: string): { name: string; method: HttpMethod } {
  const dotIndex = filename.lastIndexOf('.')
  if (dotIndex > 0) {
    const suffix = filename.slice(dotIndex + 1).toLowerCase()
    if (HTTP_METHODS.includes(suffix as HttpMethod)) {
      return { name: filename.slice(0, dotIndex), method: suffix as HttpMethod }
    }
  }
  return { name: filename, method: 'post' }
}

/**
 * Recursively scan a directory for `.ts` action files.
 * Returns info about each file (excluding index.ts, .d.ts, etc.)
 */
function scanActionFiles(dir: string, prefix = ''): ActionFileInfo[] {
  const results: ActionFileInfo[] = []

  if (!existsSync(dir)) return results

  const entries = readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)

    if (entry.isDirectory()) {
      results.push(...scanActionFiles(fullPath, prefix ? `${prefix}/${entry.name}` : entry.name))
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.d.ts') &&
      entry.name !== 'index.ts'
    ) {
      const raw = basename(entry.name, '.ts')
      const { name: parsedName, method } = parseMethodSuffix(raw)
      const name = prefix ? `${prefix}/${parsedName}` : parsedName

      results.push({ name, filePath: fullPath, method })
    }
  }

  return results
}

/**
 * Generate the virtual handler module code for a given action.
 */
function generateHandlerCode(action: ActionFileInfo): string {
  if (action.method === 'get') {
    return `
import { defineEventHandler, getQuery } from 'h3'
import action from '${action.filePath}'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const rawInput = query.input ? JSON.parse(query.input) : undefined
  return action._execute(rawInput, event)
})
`
  }

  return `
import { defineEventHandler, readBody } from 'h3'
import action from '${action.filePath}'

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => undefined)
  return action._execute(body, event)
})
`
}

/**
 * Convert kebab-case or slash-separated name to camelCase.
 * e.g. 'create-post' → 'createPost', 'auth/login' → 'authLogin'
 */
function toCamelCase(name: string): string {
  return name
    .replace(/[/-](\w)/g, (_, c: string) => c.toUpperCase())
    .replace(/^(\w)/, (_, c: string) => c.toLowerCase())
}
