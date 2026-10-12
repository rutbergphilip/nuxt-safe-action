import { ref, computed, readonly, getCurrentScope, onScopeDispose } from 'vue'
import type { Ref } from 'vue'
import type { SafeAction, SafeActionReference, ValidationErrors, StandardSchemaV1, FieldPath, FieldPathValue, ActionStatus, ActionResult } from '../types'
import { useAction } from './useAction'
import type { UseActionOptions } from './useAction'
import { cloneFormValue, sameFormValue, getFormValue, setFormValue, dirtyFormPaths, captureArrayTopology, unchangedArrayTopology } from '../utils/formValues'
import { validateFormSnapshot } from '../utils/clientValidation'
import { invalidateActionOwnership } from '../utils/actionOwnership'

export type UseFormActionOptions<TInput, TOutput, TServerError = string, TBusinessError = never> = UseActionOptions<TInput, TOutput, TServerError, TBusinessError> & {
  initialValues: TInput
  /** Validate before submission; parsed output is discarded so the server receives raw input. */
  clientSchema?: StandardSchemaV1<TInput, unknown>
}

/** Typed form values remain editable; validation and requests operate on raw snapshots. */
export function useFormAction<TInput, TOutput, TServerError = string, TBusinessError = never>(
  action: SafeAction<TInput, TOutput, TServerError, TBusinessError> | SafeActionReference<TInput, TOutput, TServerError, TBusinessError>,
  options: UseFormActionOptions<TInput, TOutput, TServerError, TBusinessError>,
) {
  const initialValues = cloneFormValue(options.initialValues)
  const values = ref(cloneFormValue(initialValues)) as Ref<TInput>
  const touched = ref<string[]>([])
  const clientErrors = ref<ValidationErrors>({})
  const serverErrors = ref<ValidationErrors>({})
  const isValidating = ref(false)
  const localStatus = ref<ActionStatus>()
  let clientSnapshot: TInput | undefined
  let serverSnapshot: TInput | undefined
  let clientTopology = new Map<string, unknown[]>()
  let serverTopology = new Map<string, unknown[]>()
  let formGeneration = 0
  let validationGeneration = 0
  let requestGeneration = 0
  let nextSubmissionTopology: Map<string, unknown[]> | undefined

  function notify(callback: (() => unknown) | undefined): void {
    if (!callback) return
    const diagnose = (error: unknown) => {
      try { console.error('[nuxt-safe-action] Action callback failed:', error) } catch { /* logging is best effort */ }
    }
    try { void Promise.resolve(callback()).catch(diagnose) } catch (error) { diagnose(error) }
  }

  const execution = useAction(action, {
    ...options,
    onExecute(args) {
      requestGeneration = ++formGeneration
      serverSnapshot = cloneFormValue(args.input)
      serverTopology = nextSubmissionTopology || captureArrayTopology(values.value)
      nextSubmissionTopology = undefined
      validationGeneration++
      isValidating.value = false
      clientErrors.value = {}
      serverErrors.value = {}
      localStatus.value = undefined
      return options.onExecute?.(args)
    },
    onSuccess(args) {
      if (requestGeneration !== formGeneration) return
      serverErrors.value = {}
      return options.onSuccess?.(args)
    },
    onError(args) {
      if (requestGeneration !== formGeneration) return
      serverErrors.value = args.error.validationErrors || {}
      return options.onError?.(args)
    },
    onSettled(args) {
      if (requestGeneration === formGeneration) return options.onSettled?.(args)
    },
  })

  function visibleErrors(errors: ValidationErrors, snapshot: TInput | undefined, topology: Map<string, unknown[]>): ValidationErrors {
    const result: ValidationErrors = Object.create(null)
    for (const [path, messages] of Object.entries(errors)) {
      if (path === '_root' || path === '_errors') { result[path] = messages; continue }
      try {
        if (sameFormValue(getFormValue(values.value, path), getFormValue(snapshot, path)) && unchangedArrayTopology(values.value, path, topology)) result[path] = messages
      } catch { /* Unsafe or unsupported server paths are not exposed as editable fields. */ }
    }
    return result
  }
  const validationErrors = computed<ValidationErrors | undefined>(() => {
    const combined = { ...visibleErrors(serverErrors.value, serverSnapshot, serverTopology), ...visibleErrors(clientErrors.value, clientSnapshot, clientTopology) }
    return Object.keys(combined).length ? combined : undefined
  })
  const rootErrors = computed(() => [...(validationErrors.value?._root || []), ...(validationErrors.value?._errors || [])])
  const fieldErrors = computed<ValidationErrors>(() => Object.fromEntries(Object.entries(validationErrors.value || {}).filter(([key]) => key !== '_errors' && key !== '_root')))
  const dirtyFields = computed(() => dirtyFormPaths(values.value, initialValues) as readonly FieldPath<TInput>[])
  const touchedFields = computed(() => [...touched.value] as readonly FieldPath<TInput>[])
  const isDirty = computed(() => !sameFormValue(values.value, initialValues))
  const isTouched = computed(() => touched.value.length > 0)
  const status = computed(() => localStatus.value || execution.status.value)

  function getFieldValue<P extends string>(path: P & FieldPath<TInput>): FieldPathValue<TInput, P> | undefined { return getFormValue(values.value, path) as FieldPathValue<TInput, P> | undefined }
  function setFieldValue<P extends string>(path: P & FieldPath<TInput>, value: FieldPathValue<TInput, P>): void { setFormValue(values.value, path, value) }
  function getFieldErrors<P extends string>(path: P & FieldPath<TInput>): readonly string[] { return fieldErrors.value[path] || [] }
  function isFieldDirty<P extends string>(path: P & FieldPath<TInput>): boolean { return !sameFormValue(getFormValue(values.value, path), getFormValue(initialValues, path)) }
  function isFieldTouched<P extends string>(path: P & FieldPath<TInput>): boolean { return touched.value.includes(path) }
  function setTouched<P extends string>(path: P & FieldPath<TInput>, touch = true): void {
    // Validate paths even though touching itself never writes into form values.
    getFormValue(values.value, path)
    touched.value = touch ? [...new Set([...touched.value, path])] : touched.value.filter(item => item !== path)
  }
  function clearErrors<P extends string>(path?: P & FieldPath<TInput>): void {
    const cleared = (errors: ValidationErrors) => Object.fromEntries(Object.entries(errors).filter(([key]) => path !== undefined && key !== path && !key.startsWith(`${path}.`)))
    clientErrors.value = cleared(clientErrors.value)
    serverErrors.value = cleared(serverErrors.value)
  }

  async function validate(): Promise<ValidationErrors> {
    const ownGeneration = ++validationGeneration
    const snapshot = cloneFormValue(values.value)
    const topology = captureArrayTopology(values.value)
    if (!options.clientSchema) return {}
    isValidating.value = true
    const errors = await validateFormSnapshot(options.clientSchema, cloneFormValue(snapshot))
    if (ownGeneration === validationGeneration) {
      clientErrors.value = errors
      clientSnapshot = snapshot
      clientTopology = topology
      isValidating.value = false
    }
    return errors
  }

  async function submit(): Promise<ActionResult<TOutput, TServerError, TBusinessError>> {
    invalidateActionOwnership(execution)
    const snapshot = cloneFormValue(values.value)
    const topology = captureArrayTopology(values.value)
    const ownFormGeneration = ++formGeneration
    const ownValidationGeneration = ++validationGeneration
    clientErrors.value = {}
    serverErrors.value = {}
    if (options.clientSchema) {
      localStatus.value = 'executing'
      isValidating.value = true
      const errors = await validateFormSnapshot(options.clientSchema, cloneFormValue(snapshot))
      if (ownFormGeneration !== formGeneration || ownValidationGeneration !== validationGeneration) {
        if (ownFormGeneration === formGeneration) localStatus.value = undefined
        return { serverError: 'Action request cancelled' as TServerError }
      }
      isValidating.value = false
      clientErrors.value = errors
      clientSnapshot = snapshot
      clientTopology = topology
      if (Object.keys(errors).length) {
        localStatus.value = 'hasErrored'
        const result: ActionResult<TOutput, TServerError, TBusinessError> = { validationErrors: errors }
        notify(options.onError && (() => options.onError!({ error: { validationErrors: errors }, input: snapshot })))
        if (ownFormGeneration === formGeneration) notify(options.onSettled && (() => options.onSettled!({ result, input: snapshot })))
        return result
      }
    }
    nextSubmissionTopology = topology
    return execution.executeAsync(snapshot)
  }

  function cancel(): void {
    formGeneration++
    validationGeneration++
    isValidating.value = false
    localStatus.value = undefined
    execution.cancel()
  }
  function reset(): void {
    cancel()
    execution.reset()
    clientErrors.value = {}
    serverErrors.value = {}
    touched.value = []
    values.value = cloneFormValue(initialValues)
  }

  if (options.abortOnDispose && getCurrentScope()) onScopeDispose(cancel)

  return {
    ...execution, values, submit, cancel, reset, fieldErrors, rootErrors,
    getFieldValue, setFieldValue, getFieldErrors, setTouched, isFieldDirty, isFieldTouched, clearErrors, validate,
    dirtyFields, touchedFields, isDirty, isTouched, isValidating: readonly(isValidating), validationErrors, status,
    serverError: computed(() => localStatus.value ? undefined : execution.serverError.value),
    businessError: computed(() => localStatus.value ? undefined : execution.businessError.value),
    isIdle: computed(() => status.value === 'idle'),
    isExecuting: computed(() => status.value === 'executing'),
    hasSucceeded: computed(() => status.value === 'hasSucceeded'),
    hasErrored: computed(() => status.value === 'hasErrored'),
  }
}
