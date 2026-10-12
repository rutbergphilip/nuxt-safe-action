import type { ActionSchema, SchemaIssue, SchemaResult, ValidationErrors } from '../types'

export function formatValidationErrors(issues: ReadonlyArray<SchemaIssue>): ValidationErrors {
  const errors: ValidationErrors = Object.create(null)
  for (const issue of issues) {
    const path = issue.path?.map(segment => String(
      typeof segment === 'object' ? segment.key : segment,
    )).join('.') || '_root'
    ;(errors[path] ??= []).push(issue.message)
  }
  return errors
}

export async function validateSchema(schema: ActionSchema, input: unknown): Promise<SchemaResult<unknown>> {
  if ('~standard' in schema) {
    return await schema['~standard'].validate(input)
  }
  const result = await schema.safeParseAsync(input)
  return result.success ? { value: result.data } : { issues: result.error.issues }
}

/** Clone helper-provided errors without inherited keys or unsafe prototype writes. */
export function normalizeValidationErrors(errors: Readonly<Record<string, readonly string[] | undefined>>): ValidationErrors {
  if (errors === null || typeof errors !== 'object' || Array.isArray(errors)) throw new Error('Invalid business validation errors.')
  const normalized: ValidationErrors = Object.create(null)
  for (const [path, messages] of Object.entries(errors)) {
    if (messages === undefined) continue
    if (!Array.isArray(messages) || messages.some(message => typeof message !== 'string')) throw new Error('Invalid business validation errors.')
    normalized[path] = [...messages]
  }
  return normalized
}
