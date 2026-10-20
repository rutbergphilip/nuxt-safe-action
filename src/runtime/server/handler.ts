import { createError, defineEventHandler, getHeader, getQuery, getRequestHost, isError, readBody, readRawBody } from 'h3'
import type { H3Event } from 'h3'
import type { SafeAction } from '../types'

export interface ActionHandlerOptions {
  /**
   * `'strict'` rejects non-GET requests that browsers can send cross-site without a
   * preflight: non-JSON bodies, cross-site `Sec-Fetch-Site`, and mismatched `Origin`.
   * `'off'` keeps the permissive H3 body parsing of earlier versions.
   * @default 'strict'
   */
  csrf?: 'strict' | 'off'
}

function isJsonMediaType(mediaType: string | undefined) {
  return mediaType === 'application/json' || !!mediaType?.endsWith('+json')
}

/** Rejects requests a third-party page could have triggered with the user's cookies. */
function assertSameOrigin(event: H3Event) {
  const fetchSite = getHeader(event, 'sec-fetch-site')?.toLowerCase()
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    throw createError({ statusCode: 403, statusMessage: 'Cross-site action request rejected' })
  }

  const origin = getHeader(event, 'origin')
  if (origin === undefined) return
  let originHost: string | undefined
  try {
    originHost = origin === 'null' ? undefined : new URL(origin).host
  } catch {
    originHost = undefined
  }
  if (!originHost || originHost.toLowerCase() !== getRequestHost(event, { xForwardedHost: true }).toLowerCase()) {
    throw createError({ statusCode: 403, statusMessage: 'Cross-origin action request rejected' })
  }
}

/** Shared generated route handler. Malformed JSON requests never execute the action. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createActionHandler(action: SafeAction<any, any, any, any>, method?: string, options: ActionHandlerOptions = {}) {
  const strict = (options.csrf ?? 'strict') === 'strict'

  return defineEventHandler(async (event) => {
    const isGet = (method || event.method).toUpperCase() === 'GET'
    const mediaType = getHeader(event, 'content-type')?.split(';', 1)[0]?.trim().toLowerCase()

    if (strict && !isGet) {
      assertSameOrigin(event)
    }

    let input: unknown
    try {
      if (isGet) {
        const queryInput = getQuery(event).input
        if (queryInput !== undefined && typeof queryInput !== 'string') {
          throw new Error('Expected one input query parameter')
        }
        input = queryInput === undefined ? undefined : JSON.parse(queryInput)
      } else if (isJsonMediaType(mediaType) || (strict && mediaType === undefined)) {
        // H3's permissive JSON parser also accepts JavaScript literals such as
        // NaN and undefined. JSON action requests must obey JSON syntax.
        const body = await readRawBody(event)
        if (!isJsonMediaType(mediaType) && body !== undefined && body !== '') {
          // A body without a content type can be sent cross-site without a preflight.
          throw createError({ statusCode: 415, statusMessage: 'Action requests must use application/json' })
        }
        input = body === undefined || body === '' ? undefined : JSON.parse(body)
      } else if (strict) {
        throw createError({ statusCode: 415, statusMessage: 'Action requests must use application/json' })
      } else {
        // csrf: 'off' preserves H3 parsing for form-urlencoded and text clients.
        input = await readBody(event)
      }
    } catch (error) {
      if (isError(error)) throw error
      return { validationErrors: { _errors: ['Invalid action input'] } }
    }
    return action._execute(input, event)
  })
}
