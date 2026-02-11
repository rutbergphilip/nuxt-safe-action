import { z } from 'zod'
import { createSafeActionClient } from '#safe-action'

// Action client without handleServerError - tests the fallback
const bareClient = createSafeActionClient()

export default bareClient
  .schema(z.object({
    trigger: z.string(),
  }))
  .action(async () => {
    throw new Error('Something broke')
  })
