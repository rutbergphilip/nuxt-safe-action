import { z } from 'zod'
import { createSafeActionClient } from '#safe-action'
import { projectNames } from '../utils/projects'

export default createSafeActionClient()
  .schema(z.object({ id: z.string(), name: z.string() }))
  .action(({ parsedInput }) => { projectNames.set(parsedInput.id, parsedInput.name) })
