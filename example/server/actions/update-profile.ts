import { z } from 'zod'
import { createSafeActionClient, returnValidationErrors } from '#safe-action'

// Demo only: validates and echoes a profile, without persistent storage.
export default createSafeActionClient()
  .schema(z.object({ profile: z.object({
    name: z.string().trim().min(2, 'Use at least two characters'),
    email: z.string().email('Enter a valid email'),
  }) }))
  .outputSchema(z.object({ profile: z.object({ name: z.string(), email: z.string() }) }))
  .action(({ parsedInput }) => {
    if (parsedInput.profile.name.toLowerCase() === 'admin') {
      returnValidationErrors({ 'profile.name': ['This name is reserved'] })
    }
    return { profile: parsedInput.profile }
  })
