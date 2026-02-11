import { createSafeActionClient } from '#safe-action'

export const actionClient = createSafeActionClient({
  handleServerError: (error) => error.message,
})
