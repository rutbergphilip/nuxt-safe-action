/* eslint-disable @typescript-eslint/no-explicit-any */
import { isError } from 'h3'
import type { H3Event } from 'h3'
import type {
  SafeAction,
  SafeActionClientOpts,
  ActionResult,
  ActionMetadata,
  MiddlewareFn,
  ActionHandler,
  ActionConfig,
  ActionSchema,
  InferSchemaInput,
  InferSchemaOutput,
  BusinessError,
  ServerErrorHandler,
} from '../types'
import { ActionError, ActionValidationError, DeclaredBusinessFailure } from './errors'
import { formatValidationErrors, normalizeValidationErrors, validateSchema } from './validation'

async function executeMiddlewareChain<TServerError>(
  middlewares: MiddlewareFn<any, any>[],
  initialCtx: Record<string, unknown>,
  clientInput: unknown,
  metadata: ActionMetadata,
  event: H3Event,
  innerFn: (ctx: any) => Promise<ActionResult<any, TServerError, unknown>>,
): Promise<ActionResult<any, TServerError, unknown>> {
  // Build the chain from inside-out
  let execute = innerFn

  for (let i = middlewares.length - 1; i >= 0; i--) {
    const nextExecute = execute
    const middleware = middlewares[i]!
    execute = async (ctx: any) => {
      let pending: Promise<ActionResult<any, TServerError, unknown>> | undefined
      let middlewareOpen = true
      let called = false
      let repeated = false
      try {
        await middleware({
          ctx,
          clientInput,
          metadata,
          event,
          next: ({ ctx: newCtx }) => {
            if (!middlewareOpen) {
              const rejected = Promise.reject(new Error('Middleware cannot call next() after it has settled.'))
              void rejected.catch(() => {})
              return rejected
            }
            if (called) {
              repeated = true
              throw new Error('Middleware must call next() exactly once.')
            }
            called = true
            pending = nextExecute(newCtx)
            const continuation = pending.then(() => ({ ctx: newCtx }))
            // A middleware may forget to await next(); still settle it below.
            void continuation.catch(() => {})
            return continuation
          },
        })
      } catch (error) {
        middlewareOpen = false
        // Do not leave an already-started mutation or rejection detached.
        await pending?.catch(() => {})
        throw error
      } finally {
        middlewareOpen = false
      }
      if (!pending) {
        throw new Error(
          'Middleware did not call next(). Every middleware must call next() to continue the chain.',
        )
      }
      const result = await pending
      if (repeated) throw new Error('Middleware must call next() exactly once.')
      return result
    }
  }

  return execute(initialCtx)
}

class SafeActionBuilder<TCtx, TInput, TParsedInput, TServerError, TOutputSchema extends ActionSchema | undefined = undefined, TBusinessError = never> {
  private _middlewares: MiddlewareFn<any, any>[]
  private _inputSchema?: ActionSchema
  private _outputSchema?: ActionSchema
  private _businessErrors: Readonly<Record<string, string>>
  private _metadata: ActionMetadata
  private _handleServerError?: ServerErrorHandler<TServerError>

  constructor(opts: {
    middlewares: MiddlewareFn<any, any>[]
    inputSchema?: ActionSchema
    outputSchema?: ActionSchema
    metadata: ActionMetadata
    businessErrors?: Readonly<Record<string, string>>
    handleServerError?: ServerErrorHandler<TServerError>
  }) {
    this._middlewares = opts.middlewares
    this._inputSchema = opts.inputSchema
    this._outputSchema = opts.outputSchema
    this._businessErrors = opts.businessErrors || Object.freeze(Object.create(null))
    this._metadata = opts.metadata
    this._handleServerError = opts.handleServerError
  }

  /**
   * Add a validation schema for input validation.
   */
  schema<TSchema extends ActionSchema>(
    schema: TSchema,
  ): SafeActionBuilder<TCtx, InferSchemaInput<TSchema>, InferSchemaOutput<TSchema>, TServerError, TOutputSchema, TBusinessError> {
    return new SafeActionBuilder<TCtx, InferSchemaInput<TSchema>, InferSchemaOutput<TSchema>, TServerError, TOutputSchema, TBusinessError>({
      middlewares: this._middlewares,
      inputSchema: schema,
      outputSchema: this._outputSchema,
      metadata: this._metadata,
      businessErrors: this._businessErrors,
      handleServerError: this._handleServerError,
    })
  }

  /**
   * Add a validation schema for output validation.
   */
  outputSchema<TSchema extends ActionSchema>(
    schema: TSchema,
  ): SafeActionBuilder<TCtx, TInput, TParsedInput, TServerError, TSchema, TBusinessError> {
    return new SafeActionBuilder<TCtx, TInput, TParsedInput, TServerError, TSchema, TBusinessError>({
      middlewares: this._middlewares,
      inputSchema: this._inputSchema,
      outputSchema: schema,
      metadata: this._metadata,
      businessErrors: this._businessErrors,
      handleServerError: this._handleServerError,
    })
  }

  /**
   * Add middleware to the action chain.
   * Middleware runs in order, and each can extend the context.
   */
  use<TNewCtx>(
    middleware: MiddlewareFn<TCtx, TNewCtx>,
  ): SafeActionBuilder<TNewCtx, TInput, TParsedInput, TServerError, TOutputSchema, TBusinessError> {
    return new SafeActionBuilder<TNewCtx, TInput, TParsedInput, TServerError, TOutputSchema, TBusinessError>({
      middlewares: [...this._middlewares, middleware as MiddlewareFn<any, any>],
      inputSchema: this._inputSchema,
      outputSchema: this._outputSchema,
      metadata: this._metadata,
      businessErrors: this._businessErrors,
      handleServerError: this._handleServerError,
    })
  }

  /**
   * Attach metadata to the action (e.g. action name, tags).
   * Accessible in middleware via `args.metadata`.
   */
  metadata(meta: ActionMetadata): SafeActionBuilder<TCtx, TInput, TParsedInput, TServerError, TOutputSchema, TBusinessError> {
    return new SafeActionBuilder<TCtx, TInput, TParsedInput, TServerError, TOutputSchema, TBusinessError>({
      middlewares: this._middlewares,
      inputSchema: this._inputSchema,
      outputSchema: this._outputSchema,
      metadata: { ...this._metadata, ...meta },
      businessErrors: this._businessErrors,
      handleServerError: this._handleServerError,
    })
  }

  /** Declare intentional public failures without changing unexpected-error handling. */
  errors<const TErrors extends Record<string, string>>(
    errors: TErrors,
  ): SafeActionBuilder<TCtx, TInput, TParsedInput, TServerError, TOutputSchema, TBusinessError | BusinessError<Extract<keyof TErrors, string>>> {
    const declarations: Record<string, string> = Object.assign(Object.create(null), this._businessErrors)
    for (const [code, message] of Object.entries(errors)) {
      if (typeof message !== 'string') throw new Error('Business error messages must be strings.')
      declarations[code] = message
    }
    return new SafeActionBuilder<TCtx, TInput, TParsedInput, TServerError, TOutputSchema, TBusinessError | BusinessError<Extract<keyof TErrors, string>>>({
      middlewares: this._middlewares,
      inputSchema: this._inputSchema,
      outputSchema: this._outputSchema,
      metadata: this._metadata,
      businessErrors: Object.freeze(declarations),
      handleServerError: this._handleServerError,
    })
  }

  /**
   * Define the action handler. This is the terminal method of the chain.
   * Returns a `SafeAction` object that can be exported from `server/actions/`.
   */
  action<TOutput>(
    handler: ActionHandler<TCtx, TParsedInput, TOutput, TBusinessError, TInput>,
  ): SafeAction<TInput, TOutputSchema extends ActionSchema ? InferSchemaOutput<TOutputSchema> : TOutput, TServerError, TBusinessError> {
    const config: ActionConfig<TServerError> = {
      middlewares: this._middlewares,
      inputSchema: this._inputSchema,
      outputSchema: this._outputSchema,
      metadata: this._metadata,
      businessErrors: this._businessErrors,
      handler: handler as ActionHandler<any, any, any, any>,
      handleServerError: this._handleServerError,
    }

    return {
      _execute: (rawInput: unknown, event: H3Event) => executeAction(rawInput, event, config),
    } as SafeAction<TInput, TOutputSchema extends ActionSchema ? InferSchemaOutput<TOutputSchema> : TOutput, TServerError, TBusinessError>
  }
}

function logUnexpectedError(event: H3Event, error: unknown): void {
  try {
    console.error(`[nuxt-safe-action] Unhandled error in ${event.method} ${event.path}:`, error)
  } catch { /* logging is best effort */ }
}

async function executeAction<TServerError>(
  rawInput: unknown,
  event: H3Event,
  config: ActionConfig<TServerError>,
): Promise<ActionResult<any, TServerError, unknown>> {
  const businessErrors = config.businessErrors || Object.freeze(Object.create(null)) as Readonly<Record<string, string>>
  try {
    return await executeMiddlewareChain(
      config.middlewares,
      {},
      rawInput,
      config.metadata,
      event,
      async (ctx) => {
        // 1. Validate input
        let parsedInput = rawInput
        if (config.inputSchema) {
          const result = await validateSchema(config.inputSchema, rawInput)
          if (result.issues) {
            return { validationErrors: formatValidationErrors(result.issues) }
          }
          parsedInput = result.value
        }

        // 2. Run handler
        const data = await config.handler({
          parsedInput,
          fail: (code, options) => {
            if (typeof code !== 'string' || !Object.hasOwn(businessErrors, code)) {
              throw new Error('Undeclared business error code.')
            }
            const validationErrors = options?.validationErrors === undefined
              ? undefined
              : normalizeValidationErrors(options.validationErrors)
            throw new DeclaredBusinessFailure(code, businessErrors, validationErrors)
          },
          ctx,
          event,
        })

        // 3. Validate output (optional)
        if (config.outputSchema) {
          const result = await validateSchema(config.outputSchema, data)
          if (result.issues) {
            throw new Error(
              `Output validation failed: ${JSON.stringify(formatValidationErrors(result.issues))}`,
            )
          }
          return { data: result.value }
        }

        return { data }
      },
    )
  } catch (error) {
    // Only a helper failure from this action's declarations can expose a business code.
    if (error instanceof DeclaredBusinessFailure && error.declarations === businessErrors && Object.hasOwn(businessErrors, error.code)) {
      return {
        businessError: { code: error.code, message: businessErrors[error.code]! },
        ...(error.validationErrors === undefined ? {} : { validationErrors: error.validationErrors }),
      }
    }

    // Explicit validation errors thrown from the handler
    if (error instanceof ActionValidationError) {
      return { validationErrors: error.validationErrors }
    }

    // Explicit action errors
    if (error instanceof ActionError) {
      return { serverError: error.message as TServerError }
    }

    const normalizedError = error instanceof Error ? error : new Error(String(error))

    // Unexpected errors — pass through the user's error handler
    if (config.handleServerError) {
      try {
        return { serverError: config.handleServerError(normalizedError, { event, metadata: config.metadata, clientInput: rawInput }) }
      } catch (mapperError) {
        logUnexpectedError(event, mapperError)
        return { serverError: 'An unexpected error occurred' as TServerError }
      }
    }

    // Intentional client errors such as createError({ statusCode: 401 }) keep their public message.
    if (isError(error) && error.statusCode >= 400 && error.statusCode < 500) {
      return { serverError: (error.statusMessage || error.message || 'Request failed') as TServerError }
    }

    // Fallback: mask the message for the client but keep a server-side trace.
    logUnexpectedError(event, normalizedError)
    return { serverError: 'An unexpected error occurred' as TServerError }
  }
}

/**
 * Create a safe action client with optional global configuration.
 *
 * ```ts
 * import { createSafeActionClient } from '#safe-action'
 *
 * export const actionClient = createSafeActionClient({
 *   handleServerError: (error) => {
 *     console.error('Action failed:', error)
 *     return 'Something went wrong. Please try again.'
 *   },
 * })
 * ```
 */
export function createSafeActionClient<TServerError = string>(
  opts: SafeActionClientOpts<TServerError> = {},
): SafeActionBuilder<Record<string, never>, undefined, undefined, TServerError> {
  return new SafeActionBuilder<Record<string, never>, undefined, undefined, TServerError>({
    middlewares: [],
    metadata: {},
    handleServerError: opts.handleServerError,
  })
}
