import { z } from 'zod'
import { actionClient } from '../utils/action-client'
import { returnValidationErrors } from '#safe-action'

export default actionClient
  .schema(z.object({
    email: z.string().email(),
  }))
  .action(async ({ parsedInput }) => {
    // Simulate a uniqueness check that Zod can't handle
    if (parsedInput.email === 'taken@example.com') {
      returnValidationErrors({
        email: ['This email is already taken'],
      })
    }
    return { registered: true }
  })
