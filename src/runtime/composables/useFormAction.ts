import { ref, computed, toRaw } from 'vue'
import type { Ref } from 'vue'
import type { SafeAction, SafeActionReference, ValidationErrors } from '../types'
import { useAction } from './useAction'
import type { UseActionOptions } from './useAction'

export type UseFormActionOptions<TInput, TOutput, TServerError = string> = UseActionOptions<TInput, TOutput, TServerError> & { initialValues: TInput }

/** Form values should be plain objects, arrays, primitives, or Dates. */
function cloneValues<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value
  const raw = toRaw(value)
  if (raw instanceof Date) return new Date(raw.getTime()) as T
  if (Array.isArray(raw)) return raw.map(cloneValues) as T
  return Object.fromEntries(Object.entries(raw).map(([key, child]) => [key, cloneValues(child)])) as T
}

/** Bind values to inputs; submit uses a snapshot so subsequent edits cannot change the request. */
export function useFormAction<TInput, TOutput, TServerError = string>(
  action: SafeAction<TInput, TOutput, TServerError> | SafeActionReference<TInput, TOutput, TServerError>,
  options: UseFormActionOptions<TInput, TOutput, TServerError>,
) {
  const initialValues = cloneValues(options.initialValues)
  const values = ref(cloneValues(initialValues)) as Ref<TInput>
  const execution = useAction(action, options)
  const rootErrors = computed(() => [...(execution.validationErrors.value?._root || []), ...(execution.validationErrors.value?._errors || [])])
  const fieldErrors = computed<ValidationErrors>(() => Object.fromEntries(
    Object.entries(execution.validationErrors.value || {}).filter(([key]) => key !== '_errors' && key !== '_root'),
  ))
  function submit() { return execution.executeAsync(cloneValues(values.value)) }
  function reset() {
    execution.reset()
    values.value = cloneValues(initialValues)
  }
  return { ...execution, values, submit, reset, fieldErrors, rootErrors }
}
