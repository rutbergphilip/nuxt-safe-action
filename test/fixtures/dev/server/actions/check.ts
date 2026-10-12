import { z } from 'zod'

// Intentionally use the public server autoimports. Excluding the module's own
// runtime from transformation must not disable autoimports in user action files.
export default createSafeActionClient()
  .errors({ DENIED: 'Demonstration business rejection' })
  .schema(z.object({ mode: z.enum(['success', 'business', 'field', 'legacy']) }))
  .action(({ parsedInput, fail }) => {
    if (parsedInput.mode === 'business') fail('DENIED')
    if (parsedInput.mode === 'field') returnValidationErrors({ mode: ['Choose another mode'] })
    if (parsedInput.mode === 'legacy') throw new ActionError('Legacy public rejection')
    return { ok: true }
  })
