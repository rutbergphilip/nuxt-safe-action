import { defineEventHandler, getHeader, getQuery, readBody, readRawBody } from 'h3'
import type { SafeAction } from '../types'

/** Shared generated route handler. Malformed JSON requests never execute the action. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createActionHandler(action: SafeAction<any, any, any>, method?: string) {
  return defineEventHandler(async (event) => {
    let input: unknown
    try {
      if ((method || event.method).toUpperCase() === 'GET') {
        const queryInput = getQuery(event).input
        if (queryInput !== undefined && typeof queryInput !== 'string') {
          throw new Error('Expected one input query parameter')
        }
        input = queryInput === undefined ? undefined : JSON.parse(queryInput)
      } else {
        const mediaType = getHeader(event, 'content-type')?.split(';', 1)[0]?.trim().toLowerCase()
        if (mediaType === 'application/json' || mediaType?.endsWith('+json')) {
          // H3's permissive JSON parser also accepts JavaScript literals such as
          // NaN and undefined. JSON action requests must obey JSON syntax.
          const body = await readRawBody(event)
          input = body === undefined || body === '' ? undefined : JSON.parse(body)
        } else {
          // Preserve H3 parsing for existing form-urlencoded and text clients.
          input = await readBody(event)
        }
      }
    } catch {
      return { validationErrors: { _errors: ['Invalid action input'] } }
    }
    return action._execute(input, event)
  })
}
