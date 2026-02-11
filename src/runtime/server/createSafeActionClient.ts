/* eslint-disable @typescript-eslint/no-explicit-any */
import type { H3Event } from 'h3'
import type { ZodType, ZodError } from 'zod'
import type {
  SafeAction,
  SafeActionClientOpts,
  ActionResult,
  ActionMetadata,
  MiddlewareFn,
  ActionHandler,
  ActionConfig,
  ValidationErrors,
} from '../types'
import { ActionError, ActionValidationError } from './errors'

// ---------------------------------------------------------------------------
// Zod error formatting
// ---------------------------------------------------------------------------

function formatZodErrors(zodError: ZodError): ValidationErrors {
  const errors: ValidationErrors = {}
  for (const issue of zodError.issues) {
    const path = issue.path.join('.') || '_root'
    if (!errors[path]) {
      errors[path] = []
    }
    errors[path]!.push(issue.message)
  }
  return errors
}

// ---------------------------------------------------------------------------
// Middleware chain execution (onion model)
// ---------------------------------------------------------------------------

async function executeMiddlewareChain<TServerError>(
  middlewares: MiddlewareFn<any, any>[],
  initialCtx: Record<string, unknown>,
  clientInput: unknown,
  metadata: ActionMetadata,
  event: H3Event,
  innerFn: (ctx: any) => Promise<ActionResult<any, TServerError>>,
): Promise<ActionResult<any, TServerError>> {
  // Build the chain from inside-out
  let execute = innerFn

  for (let i = middlewares.length - 1; i >= 0; i--) {
    const nextExecute = execute
    const middleware = middlewares[i]!
    execute = async (ctx: any) => {
      let result: ActionResult<any, TServerError> | undefined
      await middleware({
        ctx,
        clientInput,
        metadata,
        event,
        next: async ({ ctx: newCtx }) => {
          result = await nextExecute(newCtx)
          return { ctx: newCtx }
        },
      })
      return result!
    }
  }

  return execute(initialCtx)
}

// ---------------------------------------------------------------------------
// Action builder — the chain: .schema() → .use() → .metadata() → .action()
// ---------------------------------------------------------------------------

class SafeActionBuilder<TCtx, TInput, TServerError> {
  private _middlewares: MiddlewareFn<any, any>[]
  private _inputSchema?: ZodType
  private _outputSchema?: ZodType
  private _metadata: ActionMetadata
  private _handleServerError?: (error: Error) => TServerError

  constructor(opts: {
    middlewares: MiddlewareFn<any, any>[]
    inputSchema?: ZodType
    outputSchema?: ZodType
    metadata: ActionMetadata
    handleServerError?: (error: Error) => TServerError
  }) {
    this._middlewares = opts.middlewares
    this._inputSchema = opts.inputSchema
    this._outputSchema = opts.outputSchema
    this._metadata = opts.metadata
    this._handleServerError = opts.handleServerError
  }

  /**
   * Add a Zod schema for input validation.
   */
  schema<TSchema extends ZodType>(
    schema: TSchema,
  ): SafeActionBuilder<TCtx, TSchema extends ZodType<infer T> ? T : never, TServerError> {
    return new SafeActionBuilder({
      middlewares: this._middlewares,
      inputSchema: schema,
      outputSchema: this._outputSchema,
      metadata: this._metadata,
      handleServerError: this._handleServerError,
    })
  }

  /**
   * Add a Zod schema for output validation.
   */
  outputSchema<TSchema extends ZodType>(
    schema: TSchema,
  ): SafeActionBuilder<TCtx, TInput, TServerError> {
    return new SafeActionBuilder({
      middlewares: this._middlewares,
      inputSchema: this._inputSchema,
      outputSchema: schema,
      metadata: this._metadata,
      handleServerError: this._handleServerError,
    })
  }

  /**
   * Add middleware to the action chain.
   * Middleware runs in order, and each can extend the context.
   */
  use<TNewCtx>(
    middleware: MiddlewareFn<TCtx, TNewCtx>,
  ): SafeActionBuilder<TNewCtx, TInput, TServerError> {
    return new SafeActionBuilder({
      middlewares: [...this._middlewares, middleware as MiddlewareFn<any, any>],
      inputSchema: this._inputSchema,
      outputSchema: this._outputSchema,
      metadata: this._metadata,
      handleServerError: this._handleServerError,
    })
  }

  /**
   * Attach metadata to the action (e.g. action name, tags).
   * Accessible in middleware via `args.metadata`.
   */
  metadata(meta: ActionMetadata): SafeActionBuilder<TCtx, TInput, TServerError> {
    return new SafeActionBuilder({
      middlewares: this._middlewares,
      inputSchema: this._inputSchema,
      outputSchema: this._outputSchema,
      metadata: { ...this._metadata, ...meta },
      handleServerError: this._handleServerError,
    })
  }

  /**
   * Define the action handler. This is the terminal method of the chain.
   * Returns a `SafeAction` object that can be exported from `server/actions/`.
   */
  action<TOutput>(
    handler: ActionHandler<TCtx, TInput, TOutput>,
  ): SafeAction<TInput, TOutput, TServerError> {
    const config: ActionConfig<TServerError> = {
      middlewares: this._middlewares,
      inputSchema: this._inputSchema,
      outputSchema: this._outputSchema,
      metadata: this._metadata,
      handler: handler as ActionHandler<any, any, any>,
      handleServerError: this._handleServerError,
    }

    return {
      _execute: (rawInput: unknown, event: H3Event) => executeAction(rawInput, event, config),
    } as SafeAction<TInput, TOutput, TServerError>
  }
}

// ---------------------------------------------------------------------------
// Action execution engine
// ---------------------------------------------------------------------------

async function executeAction<TServerError>(
  rawInput: unknown,
  event: H3Event,
  config: ActionConfig<TServerError>,
): Promise<ActionResult<any, TServerError>> {
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
          const result = config.inputSchema.safeParse(rawInput)
          if (!result.success) {
            return { validationErrors: formatZodErrors(result.error) }
          }
          parsedInput = result.data
        }

        // 2. Run handler
        const data = await config.handler({
          parsedInput,
          ctx,
          event,
        })

        // 3. Validate output (optional)
        if (config.outputSchema) {
          const result = config.outputSchema.safeParse(data)
          if (!result.success) {
            throw new Error(
              `Output validation failed: ${JSON.stringify(formatZodErrors(result.error))}`,
            )
          }
          return { data: result.data }
        }

        return { data }
      },
    )
  } catch (error) {
    // Explicit validation errors thrown from the handler
    if (error instanceof ActionValidationError) {
      return { validationErrors: error.validationErrors }
    }

    // Explicit action errors
    if (error instanceof ActionError) {
      return { serverError: error.message as TServerError }
    }

    // Unexpected errors — pass through the user's error handler
    if (config.handleServerError) {
      return { serverError: config.handleServerError(error as Error) }
    }

    // Fallback
    return { serverError: 'An unexpected error occurred' as TServerError }
  }
}

// ---------------------------------------------------------------------------
// Factory — the public API
// ---------------------------------------------------------------------------

/**
 * Create a safe action client with optional global configuration.
 *
 * ```ts
 * import { createSafeActionClient } from '#safe-action'
 *
 * export const actionClient = createSafeActionClient({
 *   handleServerError: (e) => e.message,
 * })
 * ```
 */
export function createSafeActionClient<TServerError = string>(
  opts: SafeActionClientOpts<TServerError> = {},
): SafeActionBuilder<Record<string, never>, undefined, TServerError> {
  return new SafeActionBuilder({
    middlewares: [],
    metadata: {},
    handleServerError: opts.handleServerError as ((error: Error) => TServerError) | undefined,
  })
}
