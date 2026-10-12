import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import ts from 'typescript'
import { scanActionFiles, generateReferences } from '../src/actionDiscovery'

function fixture(files: string[], check: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'safe-action-discovery-'))
  try {
    for (const file of files) {
      mkdirSync(join(dir, file, '..'), { recursive: true })
      writeFileSync(join(dir, file), 'export default {}')
    }
    check(dir)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

describe('action discovery and references', () => {
  it('preserves single action names and imports actual explicit POST files', () => {
    fixture(['greet.post.ts', 'auth/sign-in.ts', 'index.ts', 'ignored.d.ts'], dir => {
      const actions = scanActionFiles(dir)
      expect(actions.map(item => item.exportName)).toEqual(['authSignIn', 'greet'])
      const contents = generateReferences(actions, join(dir, 'custom-build/safe-action'))
      expect(contents).toContain('../../greet.post')
      expect(contents).toContain('__safeActionMethod: "POST"')
    })
  })
  it('distinguishes HTTP variants with stable method suffixes', () => {
    fixture(['user.get.ts', 'user.post.ts'], dir => {
      expect(scanActionFiles(dir).map(item => item.exportName)).toEqual(['userGet', 'userPost'])
    })
  })
  it.each([
    [['user.ts', 'user.post.ts'], 'Duplicate action route'],
    [['auth-login.ts', 'auth/login.ts'], 'Action export collision'],
    [['class.ts'], 'Reserved action export name'],
    [['eval.ts'], 'Reserved action export name'],
    [['arguments.ts'], 'Reserved action export name'],
    [['foo-.ts'], 'Invalid action export name'],
    [['foo--bar.ts'], 'Invalid action export name'],
    [['hello.world.ts'], 'Invalid action filename'],
    [['two words.ts'], 'Invalid action filename'],
    [['user.get.ts', 'user.post.ts', 'user-get.ts'], 'Action export collision'],
  ])('rejects ambiguous or invalid files %j', (files, message) => {
    fixture(files as string[], dir => expect(() => scanActionFiles(dir)).toThrow(message as string))
  })
  it('generates declarations accepted by the TypeScript parser', () => {
    fixture(['greet.post.ts', 'auth/sign-in.ts', 'user.get.ts', 'user.post.ts', 'with_underscore.ts'], dir => {
      const source = generateReferences(scanActionFiles(dir), join(dir, 'build/safe-action'))
      const parsed = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext }, reportDiagnostics: true })
      expect(parsed.diagnostics).toEqual([])
    })
  })
  it('escapes import paths and handles absent directories', () => {
    fixture(["greet.post.ts"], dir => {
      const actions = scanActionFiles(dir)
      actions[0]!.filePath = join(dir, "owner's\\folder/greet.post.ts")
      expect(generateReferences(actions, dir)).toContain("owner's/folder/greet.post")
    })
    expect(scanActionFiles('/definitely-missing-safe-action')).toEqual([])
  })
})
