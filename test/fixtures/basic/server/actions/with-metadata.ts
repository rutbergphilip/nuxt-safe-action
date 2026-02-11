import { z } from 'zod'
import { actionClient } from '../utils/action-client'

export default actionClient
  .use(async ({ metadata, next }) => {
    // Pass metadata through context so handler can return it
    return next({ ctx: { actionName: metadata.actionName } })
  })
  .metadata({ actionName: 'with-metadata' })
  .schema(z.object({
    input: z.string(),
  }))
  .action(async ({ parsedInput, ctx }) => {
    return {
      input: parsedInput.input,
      actionName: (ctx as Record<string, unknown>).actionName,
    }
  })
