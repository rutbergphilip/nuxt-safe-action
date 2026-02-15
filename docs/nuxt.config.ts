import { fileURLToPath, URL } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { version } = require('../package.json')

export default defineNuxtConfig({
  extends: ['docus'],

  modules: ['nuxt-shiki'],

  app: {
    head: {
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      ],
    },
  },

  site: {
    name: 'nuxt-safe-action',
  },

  runtimeConfig: {
    public: {
      version,
    },
  },

  vite: {
    resolve: {
      alias: {
        'shiki/wasm': fileURLToPath(new URL('./shiki-wasm-stub.mjs', import.meta.url)),
      },
    },
  },

  hooks: {
    'pages:extend'(pages) {
      // Replace auto-detected index route with our custom landing page
      const indexIdx = pages.findIndex((p) => p.path === '/')
      if (indexIdx !== -1) {
        pages.splice(indexIdx, 1)
      }
      pages.push({
        name: 'landing',
        path: '/',
        file: fileURLToPath(new URL('./app/pages/index.vue', import.meta.url)),
      })
    },
  },

  shiki: {
    bundledThemes: ['github-dark', 'github-light'],
    bundledLangs: ['typescript', 'vue'],
    defaultTheme: {
      light: 'github-light',
      dark: 'github-dark',
    },
  },
})
