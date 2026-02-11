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
      nuxt: '>=4.0.0',
    },
  },
  defaults: {
    actionsDir: 'actions',
  },
  setup(options, nuxt) {
    const { resolve } = createResolver(import.meta.url)

    // ------------------------------------------------------------------
    // 1. Auto-import composables (useAction)
    // ------------------------------------------------------------------
    addImportsDir(resolve('./runtime/composables'))

    // ------------------------------------------------------------------
    // 2. Auto-import server utilities (createSafeActionClient, errors)
    // ------------------------------------------------------------------
    addServerImports([
      { name: 'createSafeActionClient', from: resolve('./runtime/server/createSafeActionClient') },
      { name: 'ActionError', from: resolve('./runtime/server/errors') },
      { name: 'ActionValidationError', from: resolve('./runtime/server/errors') },
      { name: 'returnValidationErrors', from: resolve('./runtime/server/errors') },
    ])

    // ------------------------------------------------------------------
    // 3. Provide #safe-action alias for explicit server-side imports
    // ------------------------------------------------------------------
    nuxt.options.alias['#safe-action'] = resolve('./runtime/server/index')

    // ------------------------------------------------------------------
    // 4. Scan server/actions and generate routes + typed references
    // ------------------------------------------------------------------
    const actionsDir = options.actionsDir || 'actions'

    // We need to hook into build to scan actions and generate handlers
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
        `Found ${actionFiles.length} action file(s): ${actionFiles.map((a) => a.name).join(', ')}`,
      )

      // Register virtual route handlers for each action
      nitroConfig.virtual = nitroConfig.virtual || {}
      nitroConfig.handlers = nitroConfig.handlers || []

      for (const action of actionFiles) {
        const virtualKey = `#safe-action-handler/${action.name}`

        // The virtual module imports the action and wraps it in a handler
        nitroConfig.virtual[virtualKey] = generateHandlerCode(action)

        nitroConfig.handlers.push({
          route: `/api/_actions/${action.name}`,
          method: 'post',
          handler: virtualKey,
        })
      }
    })

    // ------------------------------------------------------------------
    // 5. Generate typed action references for client-side use
    // ------------------------------------------------------------------
    const serverDir = nuxt.options.serverDir
    const fullActionsDir = join(serverDir, actionsDir)

    // Generate the runtime module with typed action references.
    // Types are embedded directly in the .ts file (not a separate .d.ts)
    // because TypeScript ignores .d.ts when a .ts file exists at the same path.
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

        // Type-only imports from each action file (erased at runtime)
        for (const action of actionFiles) {
          const exportName = toCamelCase(action.name)
          const relativePath = posix.join('../..', 'server', actionsDir, action.name)
          lines.push(`import type _action_${exportName} from '${relativePath}'`)
        }

        lines.push('')

        // Typed exports — use indexed access on the _types phantom field
        for (const action of actionFiles) {
          const exportName = toCamelCase(action.name)
          lines.push(
            `export const ${exportName}: SafeActionReference<(typeof _action_${exportName})['_types']['input'], (typeof _action_${exportName})['_types']['output'], (typeof _action_${exportName})['_types']['serverError']> = Object.freeze({ __safeActionPath: '${action.name}' }) as any`,
          )
        }

        return lines.join('\n') + '\n'
      },
    })

    // Register the #safe-action/actions alias
    nuxt.hook('prepare:types', ({ tsConfig }) => {
      tsConfig.compilerOptions = tsConfig.compilerOptions || {}
      tsConfig.compilerOptions.paths = tsConfig.compilerOptions.paths || {}
      tsConfig.compilerOptions.paths['#safe-action/actions'] = ['./safe-action/actions']
      tsConfig.compilerOptions.paths['#safe-action'] = [
        resolve('./runtime/server/index').replace(/\.ts$/, ''),
      ]
    })

    // Add alias for runtime resolution
    nuxt.options.alias['#safe-action/actions'] = join(nuxt.options.buildDir, 'safe-action/actions')
  },
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ActionFileInfo {
  /** kebab-case name derived from file path (e.g. 'create-post') */
  name: string
  /** Absolute path to the action file */
  filePath: string
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
      const name = prefix ? `${prefix}/${basename(entry.name, '.ts')}` : basename(entry.name, '.ts')

      results.push({ name, filePath: fullPath })
    }
  }

  return results
}

/**
 * Generate the virtual handler module code for a given action.
 */
function generateHandlerCode(action: ActionFileInfo): string {
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
