import { existsSync } from 'node:fs'
import { join, resolve as resolvePath, relative, isAbsolute } from 'node:path'
import { scanActionFiles, generateReferences } from './actionDiscovery'
import {
  defineNuxtModule,
  createResolver,
  addImportsDir,
  addImports,
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
  /**
   * Same-origin protection for generated action routes. `'strict'` requires JSON
   * bodies for non-GET actions and rejects cross-site `Sec-Fetch-Site` or a
   * mismatched `Origin`. `'off'` restores the permissive body parsing of 0.7.
   * @default 'strict'
   */
  csrf?: 'strict' | 'off'
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'nuxt-safe-action',
    configKey: 'safeAction',
    compatibility: {
      // addServerImports first shipped in @nuxt/kit 3.8.0.
      nuxt: '>=3.8.0',
    },
  },
  defaults: {
    actionsDir: 'actions',
    csrf: 'strict',
  },
  setup(options, nuxt) {
    const { resolve } = createResolver(import.meta.url)

    addImportsDir(resolve('./runtime/composables'))
    addImports({ name: 'toFormErrors', from: resolve('./runtime/utils/toFormErrors') })

    addServerImports([
      { name: 'createSafeActionClient', from: resolve('./runtime/server/createSafeActionClient') },
      { name: 'ActionError', from: resolve('./runtime/server/errors') },
      { name: 'ActionValidationError', from: resolve('./runtime/server/errors') },
      { name: 'returnValidationErrors', from: resolve('./runtime/server/errors') },
    ])

    nuxt.options.alias['#safe-action'] = resolve('./runtime/server/index')

    const actionsDir = options.actionsDir || 'actions'
    const fullActionsDir = resolvePath(nuxt.options.serverDir, actionsDir)
    const actionHandlerPath = resolve('./runtime/server/handler')
    const handlerOptions = JSON.stringify({ csrf: options.csrf === 'off' ? 'off' : 'strict' })

    // Append only after Nitro resolves its default exclusions; configuring exclude
    // earlier would suppress Nitro's .git/build/node_modules defaults.
    nuxt.hook('nitro:init', (nitro) => {
      if (nitro.options.imports !== false) {
        const exclude = nitro.options.imports.exclude
        nitro.options.imports.exclude = [...(Array.isArray(exclude) ? exclude : exclude ? [exclude] : []), `${resolve('./runtime/server')}/**`]
      }
    })

    nuxt.hook('nitro:config', (nitroConfig) => {

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
        const virtualKey = `#safe-action-handler/${action.method}/${action.name}`
        nitroConfig.virtual[virtualKey] = `import { createActionHandler } from ${JSON.stringify(actionHandlerPath)}\nimport action from ${JSON.stringify(action.filePath)}\nexport default createActionHandler(action, ${JSON.stringify(action.method)}, ${handlerOptions})\n`

        nitroConfig.handlers.push({
          route: `/api/_actions/${action.name}`,
          method: action.method,
          handler: virtualKey,
        })
      }
    })

    addTemplate({
      filename: 'safe-action/actions.ts',
      write: true,
      getContents: () => generateReferences(scanActionFiles(fullActionsDir), join(nuxt.options.buildDir, 'safe-action')),
    })

    // Regenerate both Nitro routes and client references when the set of files changes.
    nuxt.hook('builder:watch', async (event, path) => {
      if (!['add', 'unlink', 'addDir', 'unlinkDir'].includes(event)) return
      const changed = isAbsolute(path) ? path : resolvePath(nuxt.options.srcDir, path)
      const local = relative(fullActionsDir, changed)
      if (local === '' || (!local.startsWith('..') && !isAbsolute(local))) {
        await nuxt.callHook('restart')
      }
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
