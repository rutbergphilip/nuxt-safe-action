import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import * as validator from 'yup-min'
import { z } from 'zod4'
import type { H3Event } from 'h3'
import type { InferSafeActionInput, InferSafeActionOutput } from '../src/runtime/types'
import { createSafeActionClient } from '../src/runtime/server/createSafeActionClient'

const event = {} as H3Event

describe('native Yup 1.7.0 compatibility', () => {
  it('accepts the native Standard Schema contract and preserves inferred input/output', async () => {
    const schema = validator.object({ name: validator.string().trim().required() }).required()
    expect(schema['~standard'].version).toBe(1)
    expect(schema['~standard'].vendor).toBe('yup')
    const action = createSafeActionClient().schema(schema).action(({ parsedInput }) => {
      expectTypeOf(parsedInput).toEqualTypeOf<{ name: string }>()
      return { greeting: parsedInput.name }
    })
    expectTypeOf<InferSafeActionInput<typeof action>>().toEqualTypeOf<{ name: string }>()
    expectTypeOf<InferSafeActionOutput<typeof action>>().toEqualTypeOf<{ greeting: string }>()
    expect(await action._execute({ name: '  Ada  ' }, event)).toEqual({ data: { greeting: 'Ada' } })
  })

  it('keeps scalar default input optional while parsed/output defaults are defined', async () => {
    const action = createSafeActionClient()
      .schema(validator.number().default(2))
      .outputSchema(validator.number().default(10))
      .action(({ parsedInput }) => {
        expectTypeOf(parsedInput).toEqualTypeOf<number>()
        return parsedInput
      })
    expectTypeOf<InferSafeActionInput<typeof action>>().toEqualTypeOf<number | undefined>()
    expectTypeOf<InferSafeActionOutput<typeof action>>().toEqualTypeOf<number>()
    expect(await action._execute(undefined, event)).toEqual({ data: 2 })
    const defaultOutput = createSafeActionClient().outputSchema(validator.number().default(10)).action(() => undefined)
    expect(await defaultOutput._execute(undefined, event)).toEqual({ data: 10 })
  })

  it('respects strict parsing and requires explicit definedness when defaults cannot apply', async () => {
    const strictDefault = validator.number().default(2).strict()
    // This is Yup's native runtime behavior even though its declared output is number.
    expect(await strictDefault['~standard'].validate(undefined)).toEqual({ value: undefined })
    const handler = vi.fn(() => 'unreachable')
    const action = createSafeActionClient().schema(strictDefault.defined('A value is required')).action(handler)
    expect(await action._execute(undefined, event))
      .toEqual({ validationErrors: { _root: ['A value is required'] } })
    expect(handler).not.toHaveBeenCalled()
    const strictNumber = createSafeActionClient().schema(validator.number().strict().required()).action(handler)
    expect((await strictNumber._execute('2', event)).validationErrors?._root).toBeDefined()
    expect(handler).not.toHaveBeenCalled()
  })

  it('casts numeric strings at runtime while respecting Yup declared numeric input', async () => {
    const action = createSafeActionClient().schema(validator.number().required()).action(({ parsedInput }) => {
      expectTypeOf(parsedInput).toEqualTypeOf<number>()
      return parsedInput + 1
    })
    // Yup's runtime coercion accepts more shapes than its declared Standard input type.
    expectTypeOf<InferSafeActionInput<typeof action>>().toEqualTypeOf<number>()
    // @ts-expect-error Yup does not declare coercible numeric strings as typed input.
    const rejectedInput: InferSafeActionInput<typeof action> = '4'
    void rejectedInput
    expect(await action._execute('4', event)).toEqual({ data: 5 })
    expect((await action._execute('not a number', event)).validationErrors?._root).toBeDefined()
  })

  it('awaits asynchronous tests and collects all expected field errors before calling a handler', async () => {
    let tested = false
    const handler = vi.fn(({ parsedInput }: { parsedInput: { name: string } }) => {
      expect(tested).toBe(true)
      return parsedInput.name
    })
    const action = createSafeActionClient().schema(validator.object({
      name: validator.string().required().min(3, 'Too short').test('available', 'Unavailable', async (value) => {
        await Promise.resolve()
        tested = true
        return value === 'allowed'
      }),
    }).required()).action(handler)
    const failed = await action._execute({ name: 'x' }, event)
    expect(failed.validationErrors?.name).toEqual(expect.arrayContaining(['Too short', 'Unavailable']))
    expect(handler).not.toHaveBeenCalled()
    tested = false
    expect(await action._execute({ name: 'allowed' }, event)).toEqual({ data: 'allowed' })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('maps nested array errors to dotted paths and root errors to the existing root key', async () => {
    const handler = vi.fn(() => 'unreachable')
    const schema = validator.object({
      addresses: validator.array().of(validator.object({ city: validator.string().required('City required') }).required()).required(),
    }).required()
    const action = createSafeActionClient().schema(schema).action(handler)
    expect(await action._execute({ addresses: [{ city: '' }] }, event))
      .toEqual({ validationErrors: { 'addresses.0.city': ['City required'] } })
    expect(handler).not.toHaveBeenCalled()
    const rootAction = createSafeActionClient().schema(validator.string().required().test('root', 'Root rejected', () => false)).action(handler)
    expect(await rootAction._execute('value', event)).toEqual({ validationErrors: { _root: ['Root rejected'] } })
  })

  it('validates and transforms output, stripping explicitly excluded and unknown fields', async () => {
    const schema = validator.object({
      name: validator.string().trim().required(),
      password: validator.string().strip(),
    }).stripUnknown().required()
    const action = createSafeActionClient().outputSchema(schema).action(() => ({
      name: '  Ada  ', password: 'private password', internalNote: 'private note',
    }))
    expectTypeOf<InferSafeActionOutput<typeof action>>().toEqualTypeOf<{ name: string }>()
    expect(await action._execute(undefined, event)).toEqual({ data: { name: 'Ada' } })
    const invalid = createSafeActionClient().outputSchema(validator.number().required()).action(() => 'invalid')
    expect(await invalid._execute(undefined, event)).toEqual({ serverError: 'An unexpected error occurred' })
  })

  it('awaits asynchronous output validation and masks output issues', async () => {
    let tested = false
    const action = createSafeActionClient().outputSchema(validator.string().required().test('allowed', 'Output denied', async value => {
      await Promise.resolve()
      tested = true
      return value === 'allowed'
    })).action(() => 'denied')
    expect(await action._execute(undefined, event)).toEqual({ serverError: 'An unexpected error occurred' })
    expect(tested).toBe(true)
  })

  it('supports Yup input with Zod output and Zod input with Yup output', async () => {
    const yupInput = createSafeActionClient()
      .schema(validator.string().trim().required())
      .outputSchema(z.string().transform(value => ({ label: value })))
      .action(({ parsedInput }) => parsedInput)
    expectTypeOf<InferSafeActionInput<typeof yupInput>>().toEqualTypeOf<string>()
    expectTypeOf<InferSafeActionOutput<typeof yupInput>>().toEqualTypeOf<{ label: string }>()
    expect(await yupInput._execute('  value  ', event)).toEqual({ data: { label: 'value' } })
    const yupOutput = createSafeActionClient()
      .schema(z.string().transform(Number))
      .outputSchema(validator.number().transform(value => value * 2).required())
      .action(({ parsedInput }) => parsedInput)
    expectTypeOf<InferSafeActionInput<typeof yupOutput>>().toEqualTypeOf<string>()
    expectTypeOf<InferSafeActionOutput<typeof yupOutput>>().toEqualTypeOf<number>()
    expect(await yupOutput._execute('3', event)).toEqual({ data: 6 })
  })

  it('supports native lazy schemas with inferred union input/output', async () => {
    const schema = validator.lazy(value => typeof value === 'string'
      ? validator.string().trim().required()
      : validator.number().required())
    const action = createSafeActionClient().schema(schema).action(({ parsedInput }) => parsedInput)
    expectTypeOf<InferSafeActionInput<typeof action>>().toEqualTypeOf<string | number>()
    expectTypeOf<InferSafeActionOutput<typeof action>>().toEqualTypeOf<string | number>()
    expect(await action._execute('  value  ', event)).toEqual({ data: 'value' })
    expect(await action._execute(2, event)).toEqual({ data: 2 })
    expect((await action._execute({}, event)).validationErrors?._root).toBeDefined()
  })

  it('masks unexpected test exceptions and never calls the action handler', async () => {
    const handler = vi.fn(() => 'unreachable')
    const action = createSafeActionClient().schema(validator.string().required().test('broken', 'Expected issue', async () => {
      throw new Error('private database detail')
    })).action(handler)
    expect(await action._execute('value', event)).toEqual({ serverError: 'An unexpected error occurred' })
    expect(handler).not.toHaveBeenCalled()
  })
})
