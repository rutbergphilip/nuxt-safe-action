/* eslint-disable @typescript-eslint/no-explicit-any */
import { ref, computed, readonly } from 'vue'
import type {
  SafeAction,
  SafeActionReference,
  ActionResult,
  ActionStatus,
  ValidationErrors,
  UseActionReturn,
  UseActionCallbacks,
} from '../types'

/**
 * Vue composable for executing a safe action with reactive status tracking.
 *
 * ```vue
 * <script setup lang="ts">
 * import { createPost } from '#safe-action/actions'
 *
 * const { execute, data, status, error } = useAction(createPost, {
 *   onSuccess({ data }) { console.log('Created:', data) },
 * })
 * </script>
 * ```
 */
export function useAction<TInput, TOutput, TServerError = string>(
  action:
    | SafeAction<TInput, TOutput, TServerError>
    | SafeActionReference<TInput, TOutput, TServerError>,
  callbacks?: UseActionCallbacks<TInput, TOutput, TServerError>,
): UseActionReturn<TInput, TOutput, TServerError> {
  const actionPath = (action as any).__safeActionPath as string

  const data = ref<TOutput>() as import('vue').Ref<TOutput | undefined>
  const serverError = ref<TServerError>() as import('vue').Ref<TServerError | undefined>
  const validationErrors = ref<ValidationErrors>() as import('vue').Ref<
    ValidationErrors | undefined
  >
  const status = ref<ActionStatus>('idle') as import('vue').Ref<ActionStatus>

  async function executeAsync(input: TInput): Promise<ActionResult<TOutput, TServerError>> {
    // Reset error state
    serverError.value = undefined
    validationErrors.value = undefined
    status.value = 'executing'

    callbacks?.onExecute?.({ input })

    try {
      const result = await $fetch<ActionResult<TOutput, TServerError>>(
        `/api/_actions/${actionPath}`,
        {
          method: 'POST',
          body: input as Record<string, unknown>,
        },
      )

      if (result.data !== undefined) {
        data.value = result.data
        status.value = 'hasSucceeded'
        callbacks?.onSuccess?.({ data: result.data, input })
      } else if (result.serverError !== undefined) {
        serverError.value = result.serverError
        status.value = 'hasErrored'
        callbacks?.onError?.({
          error: { serverError: result.serverError },
          input,
        })
      } else if (result.validationErrors !== undefined) {
        validationErrors.value = result.validationErrors
        status.value = 'hasErrored'
        callbacks?.onError?.({
          error: { validationErrors: result.validationErrors },
          input,
        })
      }

      callbacks?.onSettled?.({ result, input })
      return result
    } catch (fetchError) {
      const message =
        fetchError instanceof Error ? fetchError.message : 'An unexpected error occurred'

      serverError.value = message as TServerError
      status.value = 'hasErrored'

      const result: ActionResult<TOutput, TServerError> = {
        serverError: message as TServerError,
      }

      callbacks?.onError?.({ error: { serverError: message as TServerError }, input })
      callbacks?.onSettled?.({ result, input })

      return result
    }
  }

  function execute(input: TInput): void {
    executeAsync(input)
  }

  function reset(): void {
    data.value = undefined
    serverError.value = undefined
    validationErrors.value = undefined
    status.value = 'idle'
  }

  return {
    execute,
    executeAsync,
    data: readonly(data) as Readonly<import('vue').Ref<TOutput | undefined>>,
    serverError: readonly(serverError) as Readonly<import('vue').Ref<TServerError | undefined>>,
    validationErrors: readonly(validationErrors) as Readonly<
      import('vue').Ref<ValidationErrors | undefined>
    >,
    status: readonly(status) as Readonly<import('vue').Ref<ActionStatus>>,
    isIdle: computed(() => status.value === 'idle'),
    isExecuting: computed(() => status.value === 'executing'),
    hasSucceeded: computed(() => status.value === 'hasSucceeded'),
    hasErrored: computed(() => status.value === 'hasErrored'),
    reset,
  }
}
