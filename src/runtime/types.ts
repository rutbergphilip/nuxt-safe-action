import type { H3Event } from 'h3'
import type { ZodType } from 'zod'

// ---------------------------------------------------------------------------
// Action Result — returned to the client from every action execution
// ---------------------------------------------------------------------------

export interface ActionResult<TOutput, TServerError = string> {
  data?: TOutput
  serverError?: TServerError
  validationErrors?: ValidationErrors
}

export type ValidationErrors = Record<string, string[]>

// ---------------------------------------------------------------------------
// Safe Action — the object produced by the builder chain
// ---------------------------------------------------------------------------

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

  /** used by the generated Nitro handler */
  _execute: (rawInput: unknown, event: H3Event) => Promise<ActionResult<TOutput, TServerError>>
}

// ---------------------------------------------------------------------------
// Client-side action reference (the thin stub used in composables)
// ---------------------------------------------------------------------------

export interface SafeActionReference<TInput = unknown, TOutput = unknown, TServerError = string> {
  readonly __safeActionPath: string
  /** phantom field — carries generic types for inference, never set at runtime */
  readonly _types: {
    input: TInput
    output: TOutput
    serverError: TServerError
  }
}

// ---------------------------------------------------------------------------
// Middleware types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Action handler
// ---------------------------------------------------------------------------

export interface ActionHandlerArgs<TCtx, TInput> {
  parsedInput: TInput
  ctx: TCtx
  event: H3Event
}

export type ActionHandler<TCtx, TInput, TOutput> = (
  args: ActionHandlerArgs<TCtx, TInput>,
) => Promise<TOutput> | TOutput

// ---------------------------------------------------------------------------
// Action metadata
// ---------------------------------------------------------------------------

export type ActionMetadata = Record<string, unknown>

// ---------------------------------------------------------------------------
// Client configuration
// ---------------------------------------------------------------------------

export interface SafeActionClientOpts<TServerError = string> {
  handleServerError?: (error: Error) => TServerError
}

// ---------------------------------------------------------------------------
// Internal — stored on the built action for the execution engine
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface ActionConfig<TServerError = string> {
  middlewares: MiddlewareFn<any, any>[]
  inputSchema?: ZodType
  outputSchema?: ZodType
  metadata: ActionMetadata
  handler: ActionHandler<any, any, any>
  handleServerError?: (error: Error) => TServerError
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Status type used by composables
// ---------------------------------------------------------------------------

export type ActionStatus = 'idle' | 'executing' | 'hasSucceeded' | 'hasErrored'

// ---------------------------------------------------------------------------
// Type extraction helpers — Volar-friendly inference for generated .d.ts
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// useAction return type
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// useAction options
// ---------------------------------------------------------------------------

export interface UseActionCallbacks<TInput, TOutput, TServerError = string> {
  onSuccess?: (args: { data: TOutput; input: TInput }) => void
  onError?: (args: {
    error: { serverError?: TServerError; validationErrors?: ValidationErrors }
    input: TInput
  }) => void
  onSettled?: (args: { result: ActionResult<TOutput, TServerError>; input: TInput }) => void
  onExecute?: (args: { input: TInput }) => void
}
