import { z } from 'zod'
import { actionClient } from '../utils/action-client'

export default actionClient
  .use(async ({ next: _next }) => {
    // Intentionally does NOT call next() - should throw
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { ctx: {} } as any
  })
  .schema(z.object({
    name: z.string(),
  }))
  .action(async ({ parsedInput }) => {
    return { greeting: `Hello, ${parsedInput.name}!` }
  })
