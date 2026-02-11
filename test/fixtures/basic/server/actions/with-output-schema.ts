import { z } from 'zod'
import { actionClient } from '../utils/action-client'

export default actionClient
  .schema(z.object({
    value: z.number(),
  }))
  .outputSchema(z.object({
    doubled: z.number().max(100),
  }))
  .action(async ({ parsedInput }) => {
    // When value > 50, doubled > 100, which violates the output schema
    return { doubled: parsedInput.value * 2 }
  })
