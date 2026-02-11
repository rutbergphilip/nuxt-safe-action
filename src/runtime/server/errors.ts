import type { ValidationErrors } from '../types'

/**
 * Throw this inside an action handler or middleware to return a typed
 * server error to the client.
 *
 * ```ts
 * throw new ActionError('Not enough credits')
 * ```
 */
export class ActionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ActionError'
  }
}

/**
 * Throw this inside an action handler to return per-field validation
 * errors to the client (useful when Zod alone isn't enough).
 *
 * ```ts
 * throw new ActionValidationError({
 *   email: ['This email is already taken'],
 * })
 * ```
 */
export class ActionValidationError extends Error {
  public readonly validationErrors: ValidationErrors

  constructor(validationErrors: ValidationErrors) {
    super('Validation failed')
    this.name = 'ActionValidationError'
    this.validationErrors = validationErrors
  }
}

/**
 * Utility to throw validation errors from within an action handler.
 * Shorthand for `throw new ActionValidationError(errors)`.
 */
export function returnValidationErrors(errors: ValidationErrors): never {
  throw new ActionValidationError(errors)
}
