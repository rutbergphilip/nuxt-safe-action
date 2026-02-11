import { defineEventHandler, readBody } from 'h3'
import type { SafeAction } from '../types'

/**
 * Creates a Nitro event handler for a given safe action.
 * Used internally by the module to generate route handlers.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createActionHandler(action: SafeAction<any, any, any>) {
  return defineEventHandler(async (event) => {
    const body = await readBody(event).catch(() => undefined)
    return action._execute(body, event)
  })
}
