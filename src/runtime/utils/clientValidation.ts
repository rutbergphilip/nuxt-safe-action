import type { StandardSchemaV1, SchemaIssue, ValidationErrors } from '../types'

function issuesToErrors(issues: readonly SchemaIssue[]): ValidationErrors {
  const errors: ValidationErrors = Object.create(null)
  for (const issue of issues) {
    const path = issue.path?.map(segment => String(typeof segment === 'object' ? segment.key : segment)).join('.') || '_root'
    ;(errors[path] ??= []).push(issue.message)
  }
  return errors
}

export async function validateFormSnapshot(schema: StandardSchemaV1<unknown, unknown>, snapshot: unknown): Promise<ValidationErrors> {
  try {
    const result = await schema['~standard'].validate(snapshot)
    if (!result || typeof result !== 'object') throw new Error('Invalid client schema result')
    if (result.issues !== undefined) {
      if (!Array.isArray(result.issues) || result.issues.some(issue => !issue || typeof issue.message !== 'string')) throw new Error('Invalid client schema issues')
      if (!result.issues.length) return { _root: ['Client validation failed'] }
      return issuesToErrors(result.issues)
    }
    if (!Object.hasOwn(result, 'value')) throw new Error('Invalid client schema result')
    return {}
  } catch (error) {
    try { console.error('[nuxt-safe-action] Client validation failed:', error) } catch { /* logging is best effort */ }
    return { _root: ['Client validation failed'] }
  }
}
