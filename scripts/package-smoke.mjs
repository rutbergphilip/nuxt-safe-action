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
const schemaSentinel = 'YUP_SERVER_SCHEMA_ERROR_SENTINEL_2bc71a'
const run = (command, args, cwd = folder) => execFileSync(command, args, { cwd, stdio: 'inherit' })
async function startServer() {
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
  return base
}
async function stopServer() {
  if (server && server.exitCode === null) {
    server.kill('SIGTERM')
    await new Promise(resolve => {
      const timer = setTimeout(() => { server.kill('SIGKILL'); resolve() }, 5000)
      server.once('close', () => { clearTimeout(timer); resolve() })
    })
  }
  server = undefined
}
try {
  run('npm', ['pack', '--ignore-scripts', '--pack-destination', folder], process.cwd())
  const tarball = readdirSync(folder).find(name => name.endsWith('.tgz'))
  writeFileSync(join(folder, 'package.json'), JSON.stringify({ private: true, type: 'module', dependencies: { 'nuxt-safe-action': `file:${tarball}`, nuxt: process.env.SMOKE_NUXT_VERSION || '^4.3.1', yup: '^1.7.1', typescript: '~5.9.3', 'vue-tsc': '^3.2.4' } }))
  writeFileSync(join(folder, 'nuxt.config.ts'), `export default defineNuxtConfig({ modules: ['nuxt-safe-action'], serverDir: './backend', buildDir: './.generated' })\n`)
  writeFileSync(join(folder, 'app.vue'), `<script setup lang="ts">\nimport { greet, reserve } from '#safe-action/actions'\nconst action = useAction(greet)\nconst reservation = useAction(reserve)\nfunction checkTypes() {\naction.execute({ name: 'Smoke' })\n// @ts-expect-error generated references preserve schema input types\naction.execute({ name: 123 })\nconst businessCode: 'DUPLICATE' | undefined = reservation.businessError.value?.code\n// @ts-expect-error undeclared business codes cannot be inferred from the reference\nconst wrongCode: 'UNKNOWN' | undefined = reservation.businessError.value?.code\nvoid businessCode; void wrongCode\nconst adapter: { name: string; message: string }[] = toFormErrors({ email: ['Invalid'], _root: ['Separate'] })\nvoid adapter\n}\nvoid checkTypes\n</script>\n<template><button @click="action.execute({ name: 'Smoke' })">Package smoke</button></template>\n`)
  mkdirSync(join(folder, 'backend/actions'), { recursive: true })
  writeFileSync(join(folder, 'backend/actions/greet.post.ts'), `import * as yup from 'yup'\nimport { createSafeActionClient } from '#safe-action'\nconst serverOnlySecret = '${sentinel}'\nlet executions = 0\nexport default createSafeActionClient().schema(yup.object({ name: yup.string().required('${schemaSentinel}') }).required()).action(({ parsedInput }) => { executions++; if (parsedInput.name === serverOnlySecret) throw new Error(serverOnlySecret); return { message: parsedInput.name, executions } })\n`)
  for (const filename of ['echo.post.ts', 'query.get.ts']) {
    writeFileSync(join(folder, 'backend/actions', filename), `import { createSafeActionClient } from '#safe-action'\nexport default createSafeActionClient().action(({ parsedInput }) => ({ value: parsedInput }))\n`)
  }
  writeFileSync(join(folder, 'backend/actions/normalize.post.ts'), `import * as yup from 'yup'\nimport { createSafeActionClient } from '#safe-action'\nexport default createSafeActionClient().schema(yup.object({ count: yup.number().default(2), profile: yup.object({ email: yup.string().trim().lowercase().email().required() }).required() }).required()).outputSchema(yup.object({ count: yup.number().required(), email: yup.string().required() }).noUnknown().required()).action(({ parsedInput }) => ({ count: parsedInput.count, email: parsedInput.profile.email, privateField: 'must be stripped' }))\n`)
  writeFileSync(join(folder, 'backend/actions/reserve.post.ts'), `import * as yup from 'yup'\nimport { createSafeActionClient } from '#safe-action'\nexport default createSafeActionClient().schema(yup.object({ email: yup.string().email().required() }).required()).errors({ DUPLICATE: 'This email is already registered' }).action(({ parsedInput, fail }) => { if (parsedInput.email === 'taken@example.com') fail('DUPLICATE', { validationErrors: { email: ['Use a different email'] } }); return { accepted: true } })\n`)
  writeFileSync(join(folder, 'tsconfig.json'), JSON.stringify({ extends: './.generated/tsconfig.json' }))
  const consumerPackage = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8'))
  assert.equal(consumerPackage.dependencies.zod, undefined, 'Yup consumer must not directly depend on Zod')
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'])
  const installedPackage = JSON.parse(readFileSync(join(folder, 'node_modules/nuxt-safe-action/package.json'), 'utf8'))
  assert.equal(installedPackage.dependencies?.zod, undefined, 'The module must not require Zod at runtime')
  assert.equal(installedPackage.peerDependenciesMeta?.zod?.optional, true)
  const publicTypes = readFileSync(join(folder, 'node_modules/nuxt-safe-action/dist/runtime/types.d.ts'), 'utf8')
  assert.doesNotMatch(publicTypes, /(?:from\s*['"]zod|import\(['"]zod)/)
  console.log('Yup-only direct consumer dependencies; module runtime/types do not require Zod.')
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
      else {
        const content = readFileSync(path)
        assert.ok(!content.includes(Buffer.from(sentinel)), `Server secret leaked into ${path}`)
        assert.ok(!content.includes(Buffer.from(schemaSentinel)), `Yup server schema leaked into ${path}`)
      }
    }
  }
  checkClientAssets(join(folder, '.output/public'))
  function hasServerSecret(dir, needle = sentinel) {
    return readdirSync(dir, { withFileTypes: true }).some(item => item.isDirectory()
      ? hasServerSecret(join(dir, item.name), needle)
      : readFileSync(join(dir, item.name)).includes(Buffer.from(needle)))
  }
  assert.ok(hasServerSecret(join(folder, '.output/server')), 'Secret sentinel must exist in the server build for the isolation check to be meaningful')
  assert.ok(hasServerSecret(join(folder, '.output/server'), schemaSentinel), 'Yup schema sentinel must exist in the server build')
  let base = await startServer()
  async function post(name, value) {
    const response = await fetch(`${base}/api/_actions/${name}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) })
    assert.equal(response.status, 200)
    return response.json()
  }
  assert.deepEqual(await post('greet', { name: 'Smoke' }), { data: { message: 'Smoke', executions: 1 } })
  const invalid = await post('greet', { name: null })
  assert.ok(invalid.validationErrors?.name?.length)
  assert.equal(invalid.data, undefined)
  assert.deepEqual(await post('greet', { name: 'After invalid' }), { data: { message: 'After invalid', executions: 2 } })
  for (const value of ['primitive', null, false, 0]) assert.deepEqual(await post('echo', value), { data: { value } })
  const query = await fetch(`${base}/api/_actions/query?input=null`)
  assert.equal(query.status, 200)
  assert.deepEqual(await query.json(), { data: { value: null } })
  const malformed = await fetch(`${base}/api/_actions/query?input=%7B`)
  assert.deepEqual(await malformed.json(), { validationErrors: { _errors: ['Invalid action input'] } })
  assert.deepEqual(await post('normalize', { count: '3', profile: { email: '  HELLO@EXAMPLE.COM  ' } }), { data: { count: 3, email: 'hello@example.com' } })
  assert.deepEqual(await post('normalize', { profile: { email: 'hello@example.com' } }), { data: { count: 2, email: 'hello@example.com' } })
  const nestedInvalid = await post('normalize', { profile: { email: 'invalid' } })
  assert.ok(nestedInvalid.validationErrors?.['profile.email']?.length)
  assert.equal(nestedInvalid.data, undefined)
  assert.deepEqual(await post('reserve', { email: 'taken@example.com' }), {
    businessError: { code: 'DUPLICATE', message: 'This email is already registered' },
    validationErrors: { email: ['Use a different email'] },
  })
  assert.deepEqual(await post('reserve', { email: 'available@example.com' }), { data: { accepted: true } })
  console.log('Packed Yup Nuxt consumer: types, build, client isolation and HTTP execution passed.')
  await stopServer()
  // The repository example intentionally uses Zod; install it only after proving Yup-only adoption.
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', `zod@${process.env.SMOKE_ZOD_VERSION || '^3.25.76'}`])
  // Reuse this independently installed tarball and dependency graph for the exact repository example.
  // Copy only checked-in sources; no source aliases or workspace links can mask package problems.
  for (const name of ['app.vue', 'nuxt.config.ts', 'server', 'components', 'shared']) {
    cpSync(join(process.cwd(), 'example', name), join(folder, name), { recursive: true })
  }
  writeFileSync(join(folder, 'tsconfig.json'), JSON.stringify({ extends: './.nuxt/tsconfig.json' }))
  run('npx', ['nuxt', 'prepare'])
  run('npx', ['vue-tsc', '--noEmit'])
  run('npx', ['nuxt', 'build'])
  base = await startServer()
  const readProfileCount = async () => {
    const response = await fetch(`${base}/api/_actions/get-profile-summary`)
    assert.equal(response.status, 200)
    return response.json()
  }
  assert.deepEqual(await readProfileCount(), { data: { acceptedProfiles: 0 } })
  assert.deepEqual(await post('update-profile', { profile: { name: 'Alice', email: 'taken@example.com' } }), {
    businessError: { code: 'EMAIL_TAKEN', message: 'This email is already registered' },
    validationErrors: { 'profile.email': ['Use a different email'] },
  })
  assert.deepEqual(await readProfileCount(), { data: { acceptedProfiles: 0 } })
  assert.deepEqual(await post('update-profile', { profile: { name: 'Alice', email: 'alice@example.com' } }), {
    data: { profile: { name: 'Alice', email: 'alice@example.com' }, acceptedProfiles: 1 },
  })
  assert.deepEqual(await readProfileCount(), { data: { acceptedProfiles: 1 } })
  const page = await fetch(base)
  assert.equal(page.status, 200)
  const html = await page.text()
  assert.match(html, /data-testid="profile-count"[^>]*>1</, 'Actual example SSR query must expose the accepted mutation count')
  console.log('Repository example: installed tarball, generated types, production build and SSR/business mutation HTTP passed.')
 } finally {
  await stopServer()
  rmSync(folder, { recursive: true, force: true })
}
