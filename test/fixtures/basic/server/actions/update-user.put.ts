import { z } from 'zod'
import { actionClient } from '../utils/action-client'

export default actionClient
  .schema(
    z.object({
      id: z.string(),
      name: z.string(),
    }),
  )
  .action(async ({ parsedInput }) => {
    return { ...parsedInput, updated: true }
  })
