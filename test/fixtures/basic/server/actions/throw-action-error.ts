import { z } from 'zod'
import { actionClient } from '../utils/action-client'
import { ActionError } from '#safe-action'

export default actionClient
  .schema(z.object({
    shouldThrow: z.boolean(),
  }))
  .action(async ({ parsedInput }) => {
    if (parsedInput.shouldThrow) {
      throw new ActionError('Not enough credits')
    }
    return { ok: true }
  })
