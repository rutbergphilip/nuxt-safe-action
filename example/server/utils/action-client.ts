import { createSafeActionClient } from '#safe-action'

export const actionClient = createSafeActionClient({
  handleServerError: (error) => {
    console.error('Action error:', error.message)
    return error.message
  },
})
