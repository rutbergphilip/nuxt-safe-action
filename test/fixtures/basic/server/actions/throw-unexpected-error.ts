import { z } from 'zod'
import { actionClient } from '../utils/action-client'

export default actionClient
  .schema(z.object({
    trigger: z.string(),
  }))
  .action(async () => {
    // Simulate an unexpected error (e.g. DB connection failure)
    throw new Error('Database connection refused')
  })
