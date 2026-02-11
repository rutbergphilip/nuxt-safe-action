import { z } from 'zod'
import { actionClient } from '../utils/action-client'

export default actionClient
  .schema(
    z.object({
      name: z.string().min(1, 'Name is required'),
    }),
  )
  .action(async ({ parsedInput }) => {
    await new Promise((resolve) => setTimeout(resolve, 500))

    return {
      greeting: `Hello, ${parsedInput.name}!`,
      timestamp: new Date().toISOString(),
    }
  })
