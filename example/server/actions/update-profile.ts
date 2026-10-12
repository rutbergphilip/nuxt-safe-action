import { z } from 'zod'
import { createSafeActionClient, returnValidationErrors } from '#safe-action'
import { profileSchema } from '#shared/profile'
import { profileActivity } from '../utils/profile-state'

// Demo only: a fixed duplicate and delayed response demonstrate form state; no profiles are stored.
export default createSafeActionClient()
  .schema(profileSchema)
  .errors({ EMAIL_TAKEN: 'This email is already registered' })
  .outputSchema(z.object({ profile: z.object({ name: z.string(), email: z.string() }), acceptedProfiles: z.number() }))
  .action(async ({ parsedInput, fail }) => {
    await new Promise(resolve => setTimeout(resolve, 750))
    if (parsedInput.profile.email.toLowerCase() === 'taken@example.com') {
      fail('EMAIL_TAKEN', { validationErrors: { 'profile.email': ['Use a different email'] } })
    }
    if (parsedInput.profile.name.toLowerCase() === 'admin') {
      returnValidationErrors({ 'profile.name': ['This name is reserved'] })
    }
    profileActivity.acceptedProfiles++
    return { profile: parsedInput.profile, acceptedProfiles: profileActivity.acceptedProfiles }
  })
