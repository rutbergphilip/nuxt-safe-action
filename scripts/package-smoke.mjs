import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { mkdtempSync, writeFileSync, readdirSync, readFileSync, rmSync, mkdirSync, cpSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Install the actual tarball in an independent Nuxt app, then typecheck generated references and build.
const folder = mkdtempSync(join(tmpdir(), 'nuxt-safe-action-smoke-'))
let server
const sentinel = 'SAFE_ACTION_SERVER_SECRET_SENTINEL_91d8e6'
const run = (command, args, cwd = folder) => execFileSync(command, args, { cwd, stdio: 'inherit' })
try {
  run('npm', ['pack', '--ignore-scripts', '--pack-destination', folder], process.cwd())
  const tarball = readdirSync(folder).find(name => name.endsWith('.tgz'))
  writeFileSync(join(folder, 'package.json'), JSON.stringify({ private: true, type: 'module', dependencies: { 'nuxt-safe-action': `file:${tarball}`, nuxt: process.env.SMOKE_NUXT_VERSION || '^4.3.1', zod: process.env.SMOKE_ZOD_VERSION || '^3.25.76', typescript: '~5.9.3', 'vue-tsc': '^3.2.4' } }))
  writeFileSync(join(folder, 'nuxt.config.ts'), `export default defineNuxtConfig({ modules: ['nuxt-safe-action'], serverDir: './backend', buildDir: './.generated' })\n`)
  writeFileSync(join(folder, 'app.vue'), `<script setup lang="ts">\nimport { greet } from '#safe-action/actions'\nconst action = useAction(greet)\nfunction checkTypes() {\naction.execute({ name: 'Smoke' })\n// @ts-expect-error generated references preserve schema input types\naction.execute({ name: 123 })\n}\nvoid checkTypes\n</script>\n<template><button @click="action.execute({ name: 'Smoke' })">Package smoke</button></template>\n`)
  mkdirSync(join(folder, 'backend/actions'), { recursive: true })
  writeFileSync(join(folder, 'backend/actions/greet.post.ts'), `import { z } from 'zod'\nimport { createSafeActionClient } from '#safe-action'\nconst serverOnlySecret = '${sentinel}'\nlet executions = 0\nexport default createSafeActionClient().schema(z.object({ name: z.string() })).action(({ parsedInput }) => { executions++; if (parsedInput.name === serverOnlySecret) throw new Error(serverOnlySecret); return { message: parsedInput.name, executions } })\n`)
  for (const filename of ['echo.post.ts', 'query.get.ts']) {
    writeFileSync(join(folder, 'backend/actions', filename), `import { createSafeActionClient } from '#safe-action'\nexport default createSafeActionClient().action(({ parsedInput }) => ({ value: parsedInput }))\n`)
  }
  writeFileSync(join(folder, 'tsconfig.json'), JSON.stringify({ extends: './.generated/tsconfig.json' }))
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'])
  run('npx', ['nuxt', 'prepare'])
  run('npx', ['vue-tsc', '--noEmit'])
  const references = readFileSync(join(folder, '.generated/safe-action/actions.ts'), 'utf8')
  assert.match(references, /__safeActionPath: "greet", __safeActionMethod: "POST"/)
  assert.match(references, /__safeActionPath: "query", __safeActionMethod: "GET"/)
  run('npx', ['nuxt', 'build'])
  function checkClientAssets(dir) {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, item.name)
      if (item.isDirectory()) checkClientAssets(path)
      else assert.ok(!readFileSync(path).includes(Buffer.from(sentinel)), `Server secret leaked into ${path}`)
    }
  }
  checkClientAssets(join(folder, '.output/public'))
  function hasServerSecret(dir) {
    return readdirSync(dir, { withFileTypes: true }).some(item => item.isDirectory()
      ? hasServerSecret(join(dir, item.name))
      : readFileSync(join(dir, item.name)).includes(Buffer.from(sentinel)))
  }
  assert.ok(hasServerSecret(join(folder, '.output/server')), 'Secret sentinel must exist in the server build for the isolation check to be meaningful')
  const portProbe = createServer()
  await new Promise(resolve => portProbe.listen(0, '127.0.0.1', resolve))
  const port = portProbe.address().port
  await new Promise(resolve => portProbe.close(resolve))
  let serverLogs = ''
  server = spawn(process.execPath, ['.output/server/index.mjs'], { cwd: folder, env: { ...process.env, NITRO_HOST: '127.0.0.1', NITRO_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] })
  server.stdout.on('data', chunk => { serverLogs += chunk })
  server.stderr.on('data', chunk => { serverLogs += chunk })
  const base = `http://127.0.0.1:${port}`
  const deadline = Date.now() + 20000
  while (true) {
    try { if ((await fetch(base)).ok) break } catch { /* Wait for the built server. */ }
    if (server.exitCode !== null || Date.now() > deadline) throw new Error(`Packed consumer server failed to start: ${serverLogs}`)
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  async function post(name, value) {
    const response = await fetch(`${base}/api/_actions/${name}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) })
    assert.equal(response.status, 200)
    return response.json()
  }
  assert.deepEqual(await post('greet', { name: 'Smoke' }), { data: { message: 'Smoke', executions: 1 } })
  const invalid = await post('greet', { name: 123 })
  assert.ok(invalid.validationErrors?.name?.length)
  assert.equal(invalid.data, undefined)
  assert.deepEqual(await post('greet', { name: 'After invalid' }), { data: { message: 'After invalid', executions: 2 } })
  for (const value of ['primitive', null, false, 0]) assert.deepEqual(await post('echo', value), { data: { value } })
  const query = await fetch(`${base}/api/_actions/query?input=null`)
  assert.equal(query.status, 200)
  assert.deepEqual(await query.json(), { data: { value: null } })
  const malformed = await fetch(`${base}/api/_actions/query?input=%7B`)
  assert.deepEqual(await malformed.json(), { validationErrors: { _errors: ['Invalid action input'] } })
  console.log('Packed Nuxt consumer: types, build, client isolation and HTTP execution passed.')
  // Reuse this independently installed tarball and dependency graph for the exact repository example.
  // Copy only checked-in sources; no source aliases or workspace links can mask package problems.
  for (const name of ['app.vue', 'nuxt.config.ts', 'server', 'components']) {
    cpSync(join(process.cwd(), 'example', name), join(folder, name), { recursive: true })
  }
  writeFileSync(join(folder, 'tsconfig.json'), JSON.stringify({ extends: './.nuxt/tsconfig.json' }))
  run('npx', ['nuxt', 'prepare'])
  run('npx', ['vue-tsc', '--noEmit'])
  run('npx', ['nuxt', 'build'])
  console.log('Repository example: installed tarball, generated types and production build passed.')
} finally {
  if (server && server.exitCode === null) {
    server.kill('SIGTERM')
    await new Promise(resolve => {
      const timer = setTimeout(() => { server.kill('SIGKILL'); resolve() }, 5000)
      server.once('close', () => { clearTimeout(timer); resolve() })
    })
  }
  rmSync(folder, { recursive: true, force: true })
}
