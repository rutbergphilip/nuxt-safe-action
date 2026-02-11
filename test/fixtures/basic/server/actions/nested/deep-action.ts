import { z } from 'zod'
import { actionClient } from '../../utils/action-client'

export default actionClient
  .schema(z.object({
    message: z.string(),
  }))
  .action(async ({ parsedInput }) => {
    return { reply: `Nested: ${parsedInput.message}` }
  })
