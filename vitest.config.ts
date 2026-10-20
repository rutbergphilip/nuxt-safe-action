import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '#app': fileURLToPath(new URL('./test/mocks/nuxt-app.ts', import.meta.url)),
      '#safe-action/config': fileURLToPath(new URL('./test/mocks/safe-action-config.ts', import.meta.url)),
    },
  },
})
