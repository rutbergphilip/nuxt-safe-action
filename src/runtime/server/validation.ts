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
