import { z } from 'zod'
import { createSafeActionClient, ActionError } from '#safe-action'

// Demo only: echoes desired state; "fail" exercises optimistic rollback.
export default createSafeActionClient()
  .schema(z.object({ id: z.string().min(1), done: z.boolean() }))
  .outputSchema(z.object({ id: z.string(), done: z.boolean() }))
  .action(async ({ parsedInput }) => {
    await new Promise(resolve => setTimeout(resolve, 500))
    if (parsedInput.id === 'fail') throw new ActionError('Demonstration failure: the change was rolled back')
    return parsedInput
  })
