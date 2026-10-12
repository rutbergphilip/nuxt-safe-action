import type { H3Event } from 'h3'

/** Structural Standard Schema v1 support; no validator runtime dependency. */
export interface StandardSchemaV1<TInput = unknown, TOutput = TInput> {
  readonly '~standard': {
    readonly version: 1
    readonly vendor: string
    readonly types?: { readonly input: TInput; readonly output: TOutput }
    readonly validate: (input: unknown) => SchemaResult<TOutput> | Promise<SchemaResult<TOutput>>
  }
}

export interface SchemaIssue {
  readonly message: string
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }>
}

export type SchemaResult<TOutput> =
  | { readonly value: TOutput; readonly issues?: undefined }
  | { readonly issues: ReadonlyArray<SchemaIssue> }

/** Zod before Standard Schema support, including Zod 3.20. */
export interface LegacyActionSchema<TInput = unknown, TOutput = unknown> {
  readonly _input: TInput
  readonly _output: TOutput
  safeParseAsync: (input: unknown) => Promise<
    | { success: true; data: TOutput }
    | { success: false; error: { issues: ReadonlyArray<SchemaIssue> } }
  >
}

export type ActionSchema = StandardSchemaV1 | LegacyActionSchema
export type InferSchemaInput<TSchema> =
  TSchema extends StandardSchemaV1<infer TInput, unknown> ? TInput :
  TSchema extends LegacyActionSchema<infer TInput, unknown> ? TInput : never
export type InferSchemaOutput<TSchema> =
  TSchema extends StandardSchemaV1<unknown, infer TOutput> ? TOutput :
  TSchema extends LegacyActionSchema<unknown, infer TOutput> ? TOutput : never

export interface ActionResult<TOutput, TServerError = string> {
  data?: TOutput
  serverError?: TServerError
  validationErrors?: ValidationErrors
}

export type ValidationErrors = Record<string, string[]>

/**
 * A safe action carries phantom types for input/output inference plus
 * an internal `_execute` method used by the generated Nitro handler.
 *
 * On the **client** side the runtime value is a lightweight reference
 * `{ __safeActionPath: string }` — the types are applied via a generated
 * declaration file so that `useAction` can infer `TInput` and `TOutput`.
 */
export interface SafeAction<TInput = unknown, TOutput = unknown, TServerError = string> {
  /** phantom field — carries generic types for inference, never set at runtime */
  readonly _types: {
    input: TInput
    output: TOutput
    serverError: TServerError
  }

  _execute: (rawInput: unknown, event: H3Event) => Promise<ActionResult<TOutput, TServerError>>
}

export interface SafeActionReference<TInput = unknown, TOutput = unknown, TServerError = string> {
  readonly __safeActionPath: string
  /** phantom field — carries generic types for inference, never set at runtime */
  readonly _types: {
    input: TInput
    output: TOutput
    serverError: TServerError
  }
}

export interface MiddlewareArgs<TCtx> {
  ctx: TCtx
  clientInput: unknown
  metadata: ActionMetadata
  event: H3Event
  next: <TNewCtx>(opts: { ctx: TNewCtx }) => Promise<MiddlewareResult<TNewCtx>>
}

export interface MiddlewareResult<TCtx> {
  ctx: TCtx
}

export type MiddlewareFn<TCtxIn = Record<string, unknown>, TCtxOut = TCtxIn> = (
  args: MiddlewareArgs<TCtxIn>,
) => Promise<MiddlewareResult<TCtxOut>>

export interface ActionHandlerArgs<TCtx, TInput> {
  parsedInput: TInput
  ctx: TCtx
  event: H3Event
}

export type ActionHandler<TCtx, TInput, TOutput> = (
  args: ActionHandlerArgs<TCtx, TInput>,
) => Promise<TOutput> | TOutput

export type ActionMetadata = Record<string, unknown>

export interface SafeActionClientOpts<TServerError = string> {
  handleServerError?: (error: Error) => TServerError
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface ActionConfig<TServerError = string> {
  middlewares: MiddlewareFn<any, any>[]
  inputSchema?: ActionSchema
  outputSchema?: ActionSchema
  metadata: ActionMetadata
  handler: ActionHandler<any, any, any>
  handleServerError?: (error: Error) => TServerError
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export type ActionStatus = 'idle' | 'executing' | 'hasSucceeded' | 'hasErrored'

/* eslint-disable @typescript-eslint/no-explicit-any */
export type InferSafeActionInput<T> =
  T extends SafeAction<infer I, any, any> ? I :
  T extends SafeActionReference<infer I, any, any> ? I : never

export type InferSafeActionOutput<T> =
  T extends SafeAction<any, infer O, any> ? O :
  T extends SafeActionReference<any, infer O, any> ? O : never

export type InferSafeActionServerError<T> =
  T extends SafeAction<any, any, infer E> ? E :
  T extends SafeActionReference<any, any, infer E> ? E : string
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface UseActionReturn<TInput, TOutput, TServerError = string> {
  execute: (input: TInput) => void
  executeAsync: (input: TInput) => Promise<ActionResult<TOutput, TServerError>>
  data: Readonly<import('vue').Ref<TOutput | undefined>>
  serverError: Readonly<import('vue').Ref<TServerError | undefined>>
  validationErrors: Readonly<import('vue').Ref<ValidationErrors | undefined>>
  status: Readonly<import('vue').Ref<ActionStatus>>
  isIdle: import('vue').ComputedRef<boolean>
  isExecuting: import('vue').ComputedRef<boolean>
  hasSucceeded: import('vue').ComputedRef<boolean>
  hasErrored: import('vue').ComputedRef<boolean>
  reset: () => void
}

export interface UseActionCallbacks<TInput, TOutput, TServerError = string> {
  onSuccess?: (args: { data: TOutput; input: TInput }) => void
  onError?: (args: {
    error: { serverError?: TServerError; validationErrors?: ValidationErrors }
    input: TInput
  }) => void
  onSettled?: (args: { result: ActionResult<TOutput, TServerError>; input: TInput }) => void
  onExecute?: (args: { input: TInput }) => void

  /**
   * Use native fetch instead of $fetch. Both transports can continue through
   * SPA navigation unless explicitly cancelled. This does not guarantee
   * completion through page unload, and native fetch requires a browser URL.
   */
  detached?: boolean
}
