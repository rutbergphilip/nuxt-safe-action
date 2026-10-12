import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { z } from 'zod'
import type { H3Event } from 'h3'
import { createApp, toWebHandler } from 'h3'
import { createSafeActionClient } from '../src/runtime/server/createSafeActionClient'
import { createActionHandler } from '../src/runtime/server/handler'
import { ActionError, DeclaredBusinessFailure, returnValidationErrors } from '../src/runtime/server/errors'
import type { ActionConfig, ActionHandler, ActionHandlerArgs, BusinessError, FieldErrors, FieldPath, FieldPathValue, InferSafeActionBusinessError, SafeActionReference } from '../src/runtime/types'

const event = {} as H3Event

describe('declared business failures', () => {
  it('infers declared codes across builder chains and raw-input field paths', async () => {
    const action = createSafeActionClient()
      .errors({ NAME_TAKEN: 'That name is unavailable' })
      .use(async ({ next }) => next({ ctx: { userId: 'one' } }))
      .metadata({ name: 'profile' })
      .schema(z.object({ profile: z.object({ name: z.string() }), addresses: z.array(z.object({ city: z.string() })) }).transform(input => ({ name: input.profile.name })))
      .outputSchema(z.string())
      .action(({ parsedInput, ctx, fail }) => {
        expectTypeOf(parsedInput).toEqualTypeOf<{ name: string }>()
        expectTypeOf(ctx.userId).toEqualTypeOf<string>()
        if (parsedInput.name === '__typing_only__') {
          // @ts-expect-error codes must be declared on this action
          fail('UNDECLARED')
          // @ts-expect-error paths describe raw client input, not transformed handler input
          fail('NAME_TAKEN', { validationErrors: { name: ['Not a raw input path'] } })
        }
        fail('NAME_TAKEN', { validationErrors: { 'profile.name': ['Choose another'], 'addresses.0.city': ['Required'], _root: ['Please review'] } })
      })
    expectTypeOf<InferSafeActionBusinessError<typeof action>>().toEqualTypeOf<BusinessError<'NAME_TAKEN'>>()
    expect(await action._execute({ profile: { name: 'admin' }, addresses: [] }, event)).toEqual({
      businessError: { code: 'NAME_TAKEN', message: 'That name is unavailable' },
      validationErrors: { 'profile.name': ['Choose another'], 'addresses.0.city': ['Required'], _root: ['Please review'] },
    })
  })

  it('copies declarations, preserves builder isolation, and merges inherited codes', async () => {
    const declarations = { TAKEN: 'Original' }
    const base = createSafeActionClient().errors(declarations)
    declarations.TAKEN = 'Mutation must not change the public contract'
    const sibling = base.action(({ fail }) => fail('TAKEN'))
    const extended = base.errors({ NO_CREDITS: 'Not enough credits' }).action(({ fail }) => fail('NO_CREDITS'))
    expectTypeOf<InferSafeActionBusinessError<typeof extended>>().toEqualTypeOf<BusinessError<'TAKEN'> | BusinessError<'NO_CREDITS'>>()
    expect(await sibling._execute(undefined, event)).toEqual({ businessError: { code: 'TAKEN', message: 'Original' } })
    expect(await extended._execute(undefined, event)).toEqual({ businessError: { code: 'NO_CREDITS', message: 'Not enough credits' } })
    const invalidSibling = base.action(({ fail }) => {
      // @ts-expect-error extending another builder must not add codes here
      fail('NO_CREDITS')
    })
    expect(await invalidSibling._execute(undefined, event)).toEqual({ serverError: 'An unexpected error occurred' })
  })

  it('treats declaration keys as own properties and supports hostile string codes safely', async () => {
    const codes = Object.assign(Object.create({ INHERITED: 'Must not be exposed' }), { ['__proto__']: 'Public hostile code' })
    Object.defineProperty(codes, '__proto__', { value: 'Public hostile code', enumerable: true })
    const client = createSafeActionClient().errors(codes)
    expect(await client.action(({ fail }) => fail('__proto__'))._execute(undefined, event)).toEqual({ businessError: { code: '__proto__', message: 'Public hostile code' } })
    expect(await client.action(({ fail }) => fail('INHERITED'))._execute(undefined, event)).toEqual({ serverError: 'An unexpected error occurred' })
    // @ts-expect-error declarations require public string messages
    expect(() => createSafeActionClient().errors({ WRONG: { detail: 'Private' } })).toThrow('messages must be strings')
  })

  it('allows business-only failures and keeps validation failures separate', async () => {
    const handler = vi.fn(() => 'unreachable')
    const client = createSafeActionClient().errors({ DENIED: 'Permission denied' })
    const invalid = client.schema(z.string()).action(handler)
    expect((await invalid._execute(1, event)).validationErrors?._root).toBeDefined()
    expect(handler).not.toHaveBeenCalled()
    expect(await client.action(({ fail }) => fail('DENIED'))._execute(undefined, event)).toEqual({ businessError: { code: 'DENIED', message: 'Permission denied' } })
  })

  it('masks forged failures, undeclared codes, and unexpected exceptions', async () => {
    const client = createSafeActionClient().errors({ DENIED: 'Public message' })
    const unknown = client.action(({ fail }) => {
      // @ts-expect-error runtime also rejects bypassed undeclared codes
      fail('SECRET_CODE')
    })
    expect(await unknown._execute(undefined, event)).toEqual({ serverError: 'An unexpected error occurred' })
    const forged = client.action(() => { throw { code: 'DENIED', message: 'Secret exception', businessError: true } })
    expect(await forged._execute(undefined, event)).toEqual({ serverError: 'An unexpected error occurred' })
    const foreign = client.action(() => { throw new DeclaredBusinessFailure('DENIED', { DENIED: 'Secret foreign registry' }) })
    expect(await foreign._execute(undefined, event)).toEqual({ serverError: 'An unexpected error occurred' })
    expect(await client.action(() => { throw new Error('Database password') })._execute(undefined, event)).toEqual({ serverError: 'An unexpected error occurred' })
  })

  it('normalizes hostile field names, clones error arrays, and rejects malformed errors', async () => {
    const errors = Object.assign(Object.create({ inherited: ['Not public'] }), { constructor: ['Required'], ['__proto__']: ['Invalid'], _errors: ['Root message'] })
    Object.defineProperty(errors, '__proto__', { value: ['Invalid'], enumerable: true })
    const action = createSafeActionClient().errors({ DENIED: 'Denied' }).schema(z.record(z.string(), z.unknown())).action(({ fail }) => fail('DENIED', { validationErrors: errors }))
    const result = await action._execute({}, event)
    expect(Object.getPrototypeOf(result.validationErrors)).toBeNull()
    expect(result.validationErrors).toEqual({ constructor: ['Required'], ['__proto__']: ['Invalid'], _errors: ['Root message'] })
    errors.constructor.push('Later mutation')
    expect(result.validationErrors?.constructor).toEqual(['Required'])
    const malformed = createSafeActionClient().errors({ DENIED: 'Denied' }).action(({ fail }) => {
      // @ts-expect-error message arrays are required even at runtime
      fail('DENIED', { validationErrors: { _root: 'private malformed detail' } })
    })
    expect(await malformed._execute(undefined, event)).toEqual({ serverError: 'An unexpected error occurred' })
  })

  it('preserves ActionError, validation helpers, custom mappers and mapper fallback', async () => {
    const client = createSafeActionClient({ handleServerError: error => ({ message: error.message }) }).errors({ DENIED: 'Denied' })
    expect(await client.action(() => { throw new ActionError('Legacy public message') })._execute(undefined, event)).toEqual({ serverError: 'Legacy public message' })
    expect(await client.action(() => returnValidationErrors({ field: ['Legacy field'] }))._execute(undefined, event)).toEqual({ validationErrors: { field: ['Legacy field'] } })
    expect(await client.action(() => { throw new Error('Mapped') })._execute(undefined, event)).toEqual({ serverError: { message: 'Mapped' } })
    const broken = createSafeActionClient({ handleServerError: () => { throw new Error('Mapper secret') } }).errors({ DENIED: 'Denied' }).action(() => { throw new Error('Original secret') })
    expect(await broken._execute(undefined, event)).toEqual({ serverError: 'An unexpected error occurred' })
  })

  it('serializes business and field/root failures through the existing HTTP envelope', async () => {
    const action = createSafeActionClient().errors({ DENIED: 'Denied' }).schema(z.object({ name: z.string() })).action(({ fail }) => fail('DENIED', { validationErrors: { name: ['Not allowed'], _root: ['Please review'] } }))
    const response = await toWebHandler(createApp().use(createActionHandler(action)))(new Request('http://localhost/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"name":"one"}' }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ businessError: { code: 'DENIED', message: 'Denied' }, validationErrors: { name: ['Not allowed'], _root: ['Please review'] } })
  })
})

describe('shared path and legacy structural types', () => {
  it('types nested, optional, union and array paths with a finite recursion limit', () => {
    type Input = { profile?: { name: string }; addresses: { city: string }[]; count: number }
    expectTypeOf<FieldPath<Input>>().toEqualTypeOf<'profile' | 'profile.name' | 'addresses' | `addresses.${number}` | `addresses.${number}.city` | 'count'>()
    expectTypeOf<FieldPathValue<Input, 'profile.name'>>().toEqualTypeOf<string>()
    expectTypeOf<FieldPath<{ profile: { name: string } } | { count: number }>>().toEqualTypeOf<'profile' | 'profile.name' | 'count'>()
    expectTypeOf<FieldPath<{ created: Date }>>().toEqualTypeOf<'created'>()
    expectTypeOf<FieldPathValue<Input, 'addresses.0.city'>>().toEqualTypeOf<string>()
    const errors: FieldErrors<Input> = { 'addresses.0.city': ['Required'], _root: ['Review'] }
    expect(errors._root).toEqual(['Review'])
    type Recursive = { value: string; children: Recursive[] }
    const bounded: FieldPath<Recursive> = 'children.0.children.1'
    expect(bounded).toBe('children.0.children.1')
    // @ts-expect-error paths are intentionally capped at four segments
    const tooDeep: FieldPath<Recursive> = 'children.0.children.1.value'
    void tooDeep
  })

  it('preserves three-generic references and manually constructed handler/config types', () => {
    const reference: SafeActionReference<string, number> = { __safeActionPath: 'legacy', _types: { input: '', output: 1, serverError: '' } }
    expectTypeOf<InferSafeActionBusinessError<typeof reference>>().toEqualTypeOf<never>()
    expect(reference.__safeActionPath).toBe('legacy')
    const args: ActionHandlerArgs<Record<string, never>, string> = { parsedInput: 'legacy', ctx: {}, event }
    const handler: ActionHandler<Record<string, never>, string, string> = ({ parsedInput }) => parsedInput
    const config: ActionConfig = { middlewares: [], metadata: {}, handler: () => 'legacy' }
    expect(handler(args)).toBe('legacy')
    expect(config.businessErrors).toBeUndefined()
  })
})
