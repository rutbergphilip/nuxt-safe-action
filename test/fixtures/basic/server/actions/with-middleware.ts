import { z } from 'zod'
import { actionClient } from '../utils/action-client'

export default actionClient
  .use(async ({ next }) => {
    return next({ ctx: { requestId: 'req-123', timestamp: 1000 } })
  })
  .use(async ({ ctx, next }) => {
    // Second middleware extends context from first
    return next({ ctx: { ...ctx, role: 'admin' } })
  })
  .schema(z.object({
    name: z.string(),
  }))
  .action(async ({ parsedInput, ctx }) => {
    // Return the context to prove middleware ran and chained properly
    const c = ctx as Record<string, unknown>
    return {
      name: parsedInput.name,
      requestId: c.requestId,
      role: c.role,
      timestamp: c.timestamp,
    }
  })
