import { toRaw } from 'vue'

const unsafeSegments = new Set(['__proto__', 'prototype', 'constructor'])

function segments(path: string): string[] {
  const parts = path.split('.')
  if (parts.some(part => !part || unsafeSegments.has(part))) throw new Error('Invalid form field path')
  return parts
}

export function cloneFormValue<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value
  const raw = toRaw(value)
  if (raw instanceof Date) return new Date(raw.getTime()) as T
  if (Array.isArray(raw)) return raw.map(cloneFormValue) as T
  return Object.fromEntries(Object.entries(raw).map(([key, child]) => [key, cloneFormValue(child)])) as T
}

export function sameFormValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
  const left = toRaw(a)
  const right = toRaw(b)
  if (left instanceof Date || right instanceof Date) return left instanceof Date && right instanceof Date && Object.is(left.getTime(), right.getTime())
  if (Array.isArray(left) !== Array.isArray(right)) return false
  if (Array.isArray(left) && Array.isArray(right) && left.length !== right.length) return false
  const keys = Object.keys(left)
  if (keys.length !== Object.keys(right).length) return false
  return keys.every(key => Object.hasOwn(right, key) && sameFormValue((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]))
}

export function getFormValue(value: unknown, path: string): unknown {
  if (!path) return value
  let current = value
  for (const part of segments(path)) {
    if (current === null || typeof current !== 'object' || !Object.hasOwn(current, part)) return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

export function setFormValue(value: unknown, path: string, nextValue: unknown): void {
  const parts = segments(path)
  let current = value
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index]!
    if (current === null || typeof current !== 'object') throw new Error('Cannot set a field on a non-object form value')
    if (Array.isArray(current) && (!/^(?:0|[1-9]\d*)$/.test(part) || Number(part) >= 4294967295)) throw new Error('Invalid array field index')
    const object = current as Record<string, unknown>
    if (index === parts.length - 1) { object[part] = nextValue; return }
    if (!Object.hasOwn(object, part) || object[part] === undefined || object[part] === null) {
      object[part] = /^(?:0|[1-9]\d*)$/.test(parts[index + 1]!) ? [] : {}
    }
    current = object[part]
  }
}

function collectPaths(value: unknown, path: string, paths: Set<string>): void {
  if (path) paths.add(path)
  if (value === null || typeof value !== 'object' || value instanceof Date) return
  for (const [key, child] of Object.entries(value)) {
    if (!unsafeSegments.has(key) && key && !key.includes('.')) collectPaths(child, path ? `${path}.${key}` : key, paths)
  }
}

export function dirtyFormPaths(value: unknown, baseline: unknown): string[] {
  const paths = new Set<string>()
  collectPaths(value, '', paths)
  collectPaths(baseline, '', paths)
  return [...paths].filter(path => !sameFormValue(getFormValue(value, path), getFormValue(baseline, path)))
}

/** Capture row identity separately from cloned values to recognize duplicate-row reorders. */
export function captureArrayTopology(value: unknown, path = '', topology = new Map<string, unknown[]>()): Map<string, unknown[]> {
  if (value === null || typeof value !== 'object' || value instanceof Date) return topology
  const raw = toRaw(value)
  if (Array.isArray(raw)) topology.set(path, raw.map(item => item !== null && typeof item === 'object' ? toRaw(item) : item))
  for (const [key, child] of Object.entries(raw)) {
    if (!unsafeSegments.has(key) && key && !key.includes('.')) captureArrayTopology(child, path ? `${path}.${key}` : key, topology)
  }
  return topology
}

export function unchangedArrayTopology(values: unknown, path: string, topology: Map<string, unknown[]>): boolean {
  for (const [arrayPath, rows] of topology) {
    if (arrayPath && path !== arrayPath && !path.startsWith(`${arrayPath}.`)) continue
    const current = getFormValue(values, arrayPath)
    if (!Array.isArray(current) || current.length !== rows.length) return false
    if (!current.every((item, index) => Object.is(item !== null && typeof item === 'object' ? toRaw(item) : item, rows[index]))) return false
  }
  return true
}
