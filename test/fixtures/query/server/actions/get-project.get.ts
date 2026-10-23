import { z } from 'zod'
import { createSafeActionClient } from '#safe-action'
import { projectNames } from '../utils/projects'

export default createSafeActionClient()
  .schema(z.object({ id: z.string() }))
  .errors({ NOT_FOUND: 'Project not found' })
  .action(async ({ parsedInput, fail }) => {
    if (parsedInput.id === 'missing') fail('NOT_FOUND')
    return { id: parsedInput.id, name: projectNames.get(parsedInput.id) ?? `Project ${parsedInput.id}` }
  })
