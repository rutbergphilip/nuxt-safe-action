import { getCookie } from 'h3'
import { createSafeActionClient } from '#safe-action'

export default createSafeActionClient().action(({ event }) => ({ user: getCookie(event, 'session') ?? 'anonymous' }))
