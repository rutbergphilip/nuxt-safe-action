import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { z } from 'zod'
import type { H3Event } from 'h3'
import type { InferSafeActionInput, InferSafeActionOutput, StandardSchemaV1, MiddlewareArgs } from '../src/runtime/types'
import { createSafeActionClient } from '../src/runtime/server/createSafeActionClient'
import { ActionError, returnValidationErrors } from '../src/runtime/server/errors'
import { formatValidationErrors } from '../src/runtime/server/validation'

const event = {} as H3Event

describe('server schema contracts', () => {
  it('separates raw input, parsed input and transformed output, including defaults', async () => {
    const action = createSafeActionClient()
      .schema(z.object({ count: z.string().default('2').transform(Number) }))
      .outputSchema(z.number().transform(async value => `count:${value}`))
      .action(({ parsedInput }) => {
        expectTypeOf(parsedInput.count).toEqualTypeOf<number>()
        return parsedInput.count
      })
    expectTypeOf<InferSafeActionInput<typeof action>>().toEqualTypeOf<{ count?: string }>()
    expectTypeOf<InferSafeActionOutput<typeof action>>().toEqualTypeOf<string>()
    expect(await action._execute({}, event)).toEqual({ data: 'count:2' })
  })

  it('awaits async legacy Zod refinements and returns field errors', async () => {
    const handler = vi.fn(() => 'ok')
    const action = createSafeActionClient()
      .schema(z.object({ name: z.string().refine(async value => value === 'allowed', 'Unavailable') }))
      .action(handler)
    expect(await action._execute({ name: 'denied' }, event)).toEqual({ validationErrors: { name: ['Unavailable'] } })
    expect(handler).not.toHaveBeenCalled()
    expect(await action._execute({ name: 'allowed' }, event)).toEqual({ data: 'ok' })
  })

  it('supports async structural Standard Schema validation without a validator import', async () => {
    const schema: StandardSchemaV1<string, number> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: async input => typeof input === 'string'
          ? { value: Number(input) }
          : { issues: [{ message: 'Expected string', path: [{ key: 'nested' }, 0, 'count'] }] },
      },
    }
    const action = createSafeActionClient().schema(schema).action(({ parsedInput }) => {
      expectTypeOf(parsedInput).toEqualTypeOf<number>()
      return parsedInput + 1
    })
    expectTypeOf<InferSafeActionInput<typeof action>>().toEqualTypeOf<string>()
    expect(await action._execute('4', event)).toEqual({ data: 5 })
    expect(await action._execute(4, event)).toEqual({ validationErrors: { 'nested.0.count': ['Expected string'] } })
  })

  it('formats inherited property names, nested and root paths safely', () => {
    const errors = formatValidationErrors([
      { path: ['__proto__'], message: 'first' },
      { path: ['__proto__'], message: 'second' },
      { path: ['constructor'], message: 'invalid' },
      { path: ['toString'], message: 'invalid' },
      { path: [{ key: 'items' }, 1, Symbol.for('value')], message: 'nested' },
      { message: 'root' },
    ])
    expect(Object.getPrototypeOf(errors)).toBeNull()
    expect(errors.__proto__).toEqual(['first', 'second'])
    expect(errors.constructor).toEqual(['invalid'])
    expect(errors['items.1.Symbol(value)']).toEqual(['nested'])
    expect(errors._root).toEqual(['root'])
  })

  it('masks output validation failures by default', async () => {
    const action = createSafeActionClient().outputSchema(z.string()).action(() => 1)
    expect(await action._execute(undefined, event)).toEqual({ serverError: 'An unexpected error occurred' })
  })

  it('supports void handlers without a schema', async () => {
    const action = createSafeActionClient().action(() => {})
    expectTypeOf<InferSafeActionInput<typeof action>>().toEqualTypeOf<undefined>()
    expectTypeOf<() => InferSafeActionOutput<typeof action>>().toEqualTypeOf<() => void>()
    expect(await action._execute(undefined, event)).toEqual({ data: undefined })
  })
})

describe('middleware and error safety', () => {
  it('preserves replacement context with typed chained extensions', async () => {
    const action = createSafeActionClient()
      .use(async ({ next }) => next({ ctx: { userId: 'one' } }))
      .use(async ({ ctx, next }) => {
        expectTypeOf(ctx.userId).toEqualTypeOf<string>()
        return next({ ctx: { role: 'admin' } })
      })
      .action(({ ctx }) => {
        expectTypeOf(ctx).toEqualTypeOf<{ role: string }>()
        return ctx
      })
    expect(await action._execute(undefined, event)).toEqual({ data: { role: 'admin' } })
  })

  it('awaits a started continuation when middleware omits await', async () => {
    const action = createSafeActionClient()
      .use(async ({ next }) => {
        void next({ ctx: { id: 1 } })
        return { ctx: { id: 1 } }
      })
      .action(async ({ ctx }) => {
        await Promise.resolve()
        return ctx.id
      })
    expect(await action._execute(undefined, event)).toEqual({ data: 1 })
  })

  it('does not execute a mutation twice, even when middleware catches duplicate-next', async () => {
    const mutation = vi.fn(async () => 'done')
    const action = createSafeActionClient({ handleServerError: error => error.message })
      .use(async ({ next }) => {
        await next({ ctx: {} })
        try { await next({ ctx: {} }) } catch { /* intentionally ignored */ }
        return { ctx: {} }
      })
      .action(mutation)
    expect(await action._execute(undefined, event)).toEqual({ serverError: 'Middleware must call next() exactly once.' })
    expect(mutation).toHaveBeenCalledTimes(1)
  })

  it('settles omitted-await continuation failures and preserves no-next errors', async () => {
    const client = createSafeActionClient({ handleServerError: error => error.message })
    const noNext = client.use(async () => ({ ctx: {} })).action(() => 'unreachable')
    expect((await noNext._execute(undefined, event)).serverError).toContain('Middleware did not call next()')
    const failed = client.use(async ({ next }) => {
      void next({ ctx: {} })
      return { ctx: {} }
    }).action(() => { throw new Error('failure') })
    expect(await failed._execute(undefined, event)).toEqual({ serverError: 'failure' })
  })

  it.each([false, true])('rejects retained next after middleware settles (throws=%s)', async (throws) => {
    let capturedNext: MiddlewareArgs<Record<string, never>>['next'] | undefined
    const mutation = vi.fn(() => 'mutation')
    const action = createSafeActionClient({ handleServerError: error => error.message })
      .use(async ({ next }) => {
        capturedNext = next
        if (throws) throw new Error('Stopped')
        return { ctx: {} }
      })
      .action(mutation)
    expect((await action._execute(undefined, event)).serverError).toBeDefined()
    await expect(capturedNext!({ ctx: {} })).rejects.toThrow('after it has settled')
    expect(mutation).not.toHaveBeenCalled()
  })

  it('normalizes thrown values for the error mapper and masks mapper failures', async () => {
    const mapped = createSafeActionClient({ handleServerError: error => {
      expect(error).toBeInstanceOf(Error)
      return { message: error.message }
    } }).action(() => { throw 'primitive' })
    expect(await mapped._execute(undefined, event)).toEqual({ serverError: { message: 'primitive' } })
    const brokenMapper = createSafeActionClient({ handleServerError: () => { throw new Error('secret') } })
      .action(() => { throw new Error('database password') })
    expect(await brokenMapper._execute(undefined, event)).toEqual({ serverError: 'An unexpected error occurred' })
  })

  it('preserves intentional action and field errors', async () => {
    const client = createSafeActionClient({ handleServerError: () => 'mapped' })
    expect(await client.action(() => { throw new ActionError('Public message') })._execute(undefined, event))
      .toEqual({ serverError: 'Public message' })
    expect(await client.action(() => returnValidationErrors({ email: ['Taken'] }))._execute(undefined, event))
      .toEqual({ validationErrors: { email: ['Taken'] } })
  })
})
