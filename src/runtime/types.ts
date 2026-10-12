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

export interface ActionResult<TOutput, TServerError = string, TBusinessError = never> {
  data?: TOutput
  serverError?: TServerError
  businessError?: TBusinessError
  validationErrors?: ValidationErrors
}

export type ValidationErrors = Record<string, string[]>

/** Public, declared business failure. Unexpected exceptions never become codes. */
export interface BusinessError<TCode extends string = string> {
  code: TCode
  message: string
}

type JoinPath<TKey extends string | number, TPath> = TPath extends string | number ? `${TKey}.${TPath}` : never
type PathKeys<T> = T extends Date | ((...args: never[]) => unknown) ? never : T extends readonly unknown[] ? number : T extends object ? Extract<keyof T, string | number> : never
type PathChild<T, K extends string | number> = T extends readonly (infer TItem)[] ? TItem : K extends keyof T ? T[K] : never
type PathLevelOne<T> = PathKeys<T>
type PathLevelTwo<T> = { [K in PathKeys<T>]: JoinPath<K, PathLevelOne<PathChild<T, K>>> }[PathKeys<T>]
type PathLevelThree<T> = { [K in PathKeys<T>]: JoinPath<K, PathLevelTwo<PathChild<T, K>>> }[PathKeys<T>]
type PathLevelFour<T> = { [K in PathKeys<T>]: JoinPath<K, PathLevelThree<PathChild<T, K>>> }[PathKeys<T>]
/** Dotted raw-input paths capped at four segments, including array indices. */
export type FieldPath<T> = 0 extends (1 & T) ? string : `${PathLevelOne<T>}` | PathLevelTwo<T> | PathLevelThree<T> | PathLevelFour<T>
export type InputPath<T> = FieldPath<T>
type PathPart<T, TKey extends string> =
  T extends readonly (infer TItem)[] ? TKey extends `${number}` ? TItem : never :
  T extends object ? TKey extends keyof T ? T[TKey] : TKey extends `${infer N extends number}` ? N extends keyof T ? T[N] : never : never : never
export type FieldPathValue<T, TPath extends string> =
  TPath extends `${infer TKey}.${infer TRest}` ? FieldPathValue<PathPart<T, TKey>, TRest> : PathPart<T, TPath>

/** Typed helper errors; legacy ValidationErrors remains permissive. */
export type FieldErrors<TInput> = Partial<Record<FieldPath<TInput> | '_root' | '_errors', readonly string[]>>
export type BusinessErrorFn<TInput, TBusinessError = never> = [TBusinessError] extends [never] ? (code: never) => never : (
  code: TBusinessError extends BusinessError<infer TCode> ? TCode : never,
  options?: { validationErrors?: FieldErrors<TInput> },
) => never

/**
 * A safe action carries phantom types for input/output inference plus
 * an internal `_execute` method used by the generated Nitro handler.
 *
 * On the **client** side the runtime value is a lightweight reference
 * `{ __safeActionPath: string }` — the types are applied via a generated
 * declaration file so that `useAction` can infer `TInput` and `TOutput`.
 */
export interface SafeAction<TInput = unknown, TOutput = unknown, TServerError = string, TBusinessError = never> {
  /** phantom field — carries generic types for inference, never set at runtime */
  readonly _types: {
    input: TInput
    output: TOutput
    serverError: TServerError
    /** Optional to preserve existing manually constructed phantom types. */
    businessError?: TBusinessError
  }

  _execute: (rawInput: unknown, event: H3Event) => Promise<ActionResult<TOutput, TServerError, TBusinessError>>
}

export interface SafeActionReference<TInput = unknown, TOutput = unknown, TServerError = string, TBusinessError = never> {
  readonly __safeActionPath: string
  /** phantom field — carries generic types for inference, never set at runtime */
  readonly _types: {
    input: TInput
    output: TOutput
    serverError: TServerError
    /** Optional to preserve existing manually constructed phantom types. */
    businessError?: TBusinessError
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

export interface ActionHandlerArgs<TCtx, TInput, TBusinessError = never, TErrorInput = TInput> {
  parsedInput: TInput
  fail?: BusinessErrorFn<TErrorInput, TBusinessError>
  ctx: TCtx
  event: H3Event
}

export type ActionHandler<TCtx, TInput, TOutput, TBusinessError = never, TErrorInput = TInput> = (
  args: ActionHandlerArgs<TCtx, TInput, TBusinessError, TErrorInput> & ([TBusinessError] extends [never] ? unknown : { fail: BusinessErrorFn<TErrorInput, TBusinessError> }),
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
  businessErrors?: Readonly<Record<string, string>>
  handler: ActionHandler<any, any, any, any>
  handleServerError?: (error: Error) => TServerError
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export type ActionStatus = 'idle' | 'executing' | 'hasSucceeded' | 'hasErrored'

/* eslint-disable @typescript-eslint/no-explicit-any */
export type InferSafeActionInput<T> =
  T extends SafeAction<infer I, any, any, any> ? I :
  T extends SafeActionReference<infer I, any, any, any> ? I : never

export type InferSafeActionOutput<T> =
  T extends SafeAction<any, infer O, any, any> ? O :
  T extends SafeActionReference<any, infer O, any, any> ? O : never

export type InferSafeActionServerError<T> =
  T extends SafeAction<any, any, infer E, any> ? E :
  T extends SafeActionReference<any, any, infer E, any> ? E : string
export type InferSafeActionBusinessError<T> =
  T extends SafeAction<any, any, any, infer E> ? E :
  T extends SafeActionReference<any, any, any, infer E> ? E : never
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface UseActionReturn<TInput, TOutput, TServerError = string, TBusinessError = never> {
  execute: (input: TInput) => void
  executeAsync: (input: TInput) => Promise<ActionResult<TOutput, TServerError, TBusinessError>>
  data: Readonly<import('vue').Ref<TOutput | undefined>>
  serverError: Readonly<import('vue').Ref<TServerError | undefined>>
  businessError: Readonly<import('vue').Ref<TBusinessError | undefined>>
  isRefreshing: Readonly<import('vue').Ref<boolean>>
  refreshError: Readonly<import('vue').Ref<Error | null>>
  validationErrors: Readonly<import('vue').Ref<ValidationErrors | undefined>>
  status: Readonly<import('vue').Ref<ActionStatus>>
  isIdle: import('vue').ComputedRef<boolean>
  isExecuting: import('vue').ComputedRef<boolean>
  hasSucceeded: import('vue').ComputedRef<boolean>
  hasErrored: import('vue').ComputedRef<boolean>
  reset: () => void
}

export interface UseActionCallbacks<TInput, TOutput, TServerError = string, TBusinessError = never> {
  onSuccess?: (args: { data: TOutput; input: TInput }) => void
  onError?: (args: {
    error: { serverError?: TServerError; businessError?: TBusinessError; validationErrors?: ValidationErrors }
    input: TInput
  }) => void
  onSettled?: (args: { result: ActionResult<TOutput, TServerError, TBusinessError>; input: TInput }) => void
  onExecute?: (args: { input: TInput }) => void

  /**
   * Use native fetch instead of $fetch. Both transports can continue through
   * SPA navigation unless explicitly cancelled. This does not guarantee
   * completion through page unload, and native fetch requires a browser URL.
   */
  detached?: boolean
}
