import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: { alias: { '#app': fileURLToPath(new URL('./test/mocks/nuxt-app.ts', import.meta.url)) } },
})
