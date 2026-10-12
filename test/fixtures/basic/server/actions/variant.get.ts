import { createSafeActionClient } from '../../../../../src/runtime/server/createSafeActionClient'

export default createSafeActionClient().action(() => ({ ok: true }))
