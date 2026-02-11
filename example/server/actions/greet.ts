import { z } from 'zod'
import { actionClient } from '../utils/action-client'

export default actionClient
  .schema(
    z.object({
      name: z.string().min(1, 'Name is required'),
    }),
  )
  .action(async ({ parsedInput }) => {
    return {
      greeting: `Hello, ${parsedInput.name}!`,
      timestamp: new Date().toISOString(),
    }
  })
