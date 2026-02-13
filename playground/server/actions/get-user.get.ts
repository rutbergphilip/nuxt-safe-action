import { z } from 'zod'
import { actionClient } from '../utils/action-client'

export default actionClient
  .schema(
    z.object({
      id: z.string().min(1, 'User ID is required'),
    }),
  )
  .action(async ({ parsedInput }) => {
    await new Promise((resolve) => setTimeout(resolve, 300))

    const users: Record<string, { name: string; email: string }> = {
      '1': { name: 'Alice Johnson', email: 'alice@example.com' },
      '2': { name: 'Bob Smith', email: 'bob@example.com' },
      '3': { name: 'Charlie Brown', email: 'charlie@example.com' },
    }

    const user = users[parsedInput.id]
    if (!user) {
      throw new ActionError(`User with ID "${parsedInput.id}" not found`)
    }

    return { id: parsedInput.id, ...user }
  })
