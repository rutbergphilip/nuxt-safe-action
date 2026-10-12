import NuxtSafeAction from '../../../src/module'

let exclusions: string[] = []
let defaults: string[] = []

export default defineNuxtConfig({
  modules: [NuxtSafeAction],
  compatibilityDate: '2024-04-03',
  nitro: {
    virtual: { '#dev-import-options': () => `export const exclusions = ${JSON.stringify(exclusions)}; export const defaults = ${JSON.stringify(defaults)}\n` },
    hooks: {
      'rollup:before'(nitro) {
        const imports = nitro.options.imports
        const exclude = imports && imports.exclude
        exclusions = Array.isArray(exclude) ? exclude.map(String) : exclude ? [String(exclude)] : []
      },
    },
  },
  vite: { server: { hmr: false } },
  hooks: {
    'nitro:init'(nitro) {
      const imports = nitro.options.imports
      const exclude = imports && imports.exclude
      defaults = Array.isArray(exclude) ? exclude.map(String) : exclude ? [String(exclude)] : []
    },
  },
})
