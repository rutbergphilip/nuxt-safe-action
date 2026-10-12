import { createSafeActionClient } from '#safe-action'
import { profileActivity } from '../utils/profile-state'

export default createSafeActionClient().action(() => ({ acceptedProfiles: profileActivity.acceptedProfiles }))
