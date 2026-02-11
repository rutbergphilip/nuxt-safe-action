import { z } from 'zod'
import { actionClient } from '../utils/action-client'

export default actionClient
  .schema(
    z.object({
      title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
      body: z.string().min(1, 'Body is required'),
    }),
  )
  .action(async ({ parsedInput }) => {
    return {
      id: crypto.randomUUID(),
      title: parsedInput.title,
      body: parsedInput.body,
      createdAt: new Date().toISOString(),
    }
  })
