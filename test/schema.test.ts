import { describe, expect, expectTypeOf, it } from 'vitest'
import { z as zod3 } from 'zod3'
import { z as zod4 } from 'zod4'
import * as v from 'valibot'
import { type } from 'arktype'
import type { H3Event } from 'h3'
import type { InferSafeActionInput, InferSafeActionOutput } from '../src/runtime/types'
import { createSafeActionClient } from '../src/runtime/server/createSafeActionClient'

const event = {} as H3Event

describe('validator compatibility', () => {
  it('supports legacy Zod 3.20 async transformations and defaults', async () => {
    const action = createSafeActionClient()
      .schema(zod3.object({ count: zod3.string().default('2').transform(async value => Number(value)) }))
      .outputSchema(zod3.number().transform(async value => String(value)))
      .action(({ parsedInput }) => {
        expectTypeOf(parsedInput.count).toEqualTypeOf<number>()
        return parsedInput.count
      })
    expectTypeOf<InferSafeActionInput<typeof action>>().toEqualTypeOf<{ count?: string }>()
    expectTypeOf<InferSafeActionOutput<typeof action>>().toEqualTypeOf<string>()
    expect(await action._execute({}, event)).toEqual({ data: '2' })
  })

  it('supports Zod 4 Standard Schema input and output transforms', async () => {
    const action = createSafeActionClient()
      .schema(zod4.string().transform(async value => Number(value)))
      .outputSchema(zod4.number().transform(value => ({ value })))
      .action(({ parsedInput }) => {
        expectTypeOf(parsedInput).toEqualTypeOf<number>()
        return parsedInput
      })
    expectTypeOf<InferSafeActionInput<typeof action>>().toEqualTypeOf<string>()
    expectTypeOf<InferSafeActionOutput<typeof action>>().toEqualTypeOf<{ value: number }>()
    expect(await action._execute('3', event)).toEqual({ data: { value: 3 } })
    expect((await action._execute(3, event)).validationErrors?._root).toBeDefined()
  })

  it('supports Valibot typed transformations and field errors', async () => {
    const action = createSafeActionClient()
      .schema(v.object({ count: v.pipe(v.string(), v.transform(Number)) }))
      .outputSchema(v.pipe(v.number(), v.transform(String)))
      .action(({ parsedInput }) => {
        expectTypeOf(parsedInput.count).toEqualTypeOf<number>()
        return parsedInput.count
      })
    expectTypeOf<InferSafeActionInput<typeof action>>().toEqualTypeOf<{ count: string }>()
    expectTypeOf<InferSafeActionOutput<typeof action>>().toEqualTypeOf<string>()
    expect(await action._execute({ count: '4' }, event)).toEqual({ data: '4' })
    expect((await action._execute({ count: 4 }, event)).validationErrors?.count).toBeDefined()
  })

  it('supports ArkType Standard Schema with inferred input and output', async () => {
    const action = createSafeActionClient()
      .schema(type({ count: 'string.numeric.parse' }))
      .action(({ parsedInput }) => {
        expectTypeOf(parsedInput.count).toEqualTypeOf<number>()
        return parsedInput.count
      })
    expectTypeOf<InferSafeActionInput<typeof action>>().toEqualTypeOf<{ count: string }>()
    expectTypeOf<InferSafeActionOutput<typeof action>>().toEqualTypeOf<number>()
    expect(await action._execute({ count: '5' }, event)).toEqual({ data: 5 })
    expect((await action._execute({ count: 'invalid' }, event)).validationErrors?.count).toBeDefined()
  })
})
