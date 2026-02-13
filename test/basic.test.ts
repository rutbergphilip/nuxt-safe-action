import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'

describe('nuxt-safe-action', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/basic', import.meta.url)),
  })

  describe('basic action execution', () => {
    it('renders the index page', async () => {
      const html = await $fetch('/')
      expect(html).toContain('<div>basic</div>')
    })

    it('executes a safe action and returns data', async () => {
      const result = await $fetch('/api/_actions/greet', {
        method: 'POST',
        body: { name: 'World' },
      })

      expect(result).toEqual({
        data: { greeting: 'Hello, World!' },
      })
    })

    it('returns only the data key on success (no serverError or validationErrors)', async () => {
      const result = await $fetch<Record<string, unknown>>('/api/_actions/greet', {
        method: 'POST',
        body: { name: 'Test' },
      })

      expect(result.data).toBeDefined()
      expect(result.serverError).toBeUndefined()
      expect(result.validationErrors).toBeUndefined()
    })
  })

  describe('input validation', () => {
    it('returns validation errors for invalid input', async () => {
      const result = await $fetch<{ validationErrors?: Record<string, string[]> }>(
        '/api/_actions/greet',
        {
          method: 'POST',
          body: { name: '' },
        },
      )

      expect(result.validationErrors).toBeDefined()
      expect(result.validationErrors!.name).toContain('Name is required')
    })

    it('returns validation errors for missing required fields', async () => {
      const result = await $fetch<{ validationErrors?: Record<string, string[]> }>(
        '/api/_actions/greet',
        {
          method: 'POST',
          body: {},
        },
      )

      expect(result.validationErrors).toBeDefined()
      expect(result.validationErrors!.name).toBeDefined()
    })

    it('returns validation errors for wrong types', async () => {
      const result = await $fetch<{ validationErrors?: Record<string, string[]> }>(
        '/api/_actions/greet',
        {
          method: 'POST',
          body: { name: 123 },
        },
      )

      expect(result.validationErrors).toBeDefined()
    })

    it('does not include data when validation fails', async () => {
      const result = await $fetch<Record<string, unknown>>('/api/_actions/greet', {
        method: 'POST',
        body: { name: '' },
      })

      expect(result.data).toBeUndefined()
      expect(result.validationErrors).toBeDefined()
    })
  })

  describe('action without schema', () => {
    it('passes raw input through when no schema is defined', async () => {
      const result = await $fetch('/api/_actions/no-schema', {
        method: 'POST',
        body: { anything: 'goes', nested: { deep: true } },
      })

      expect(result).toEqual({
        data: { echo: { anything: 'goes', nested: { deep: true } } },
      })
    })

    it('works with empty body when no schema is defined', async () => {
      const result = await $fetch('/api/_actions/no-schema', {
        method: 'POST',
        body: {},
      })

      expect(result).toEqual({
        data: { echo: {} },
      })
    })
  })

  describe('ActionError', () => {
    it('returns serverError when ActionError is thrown', async () => {
      const result = await $fetch<{ serverError?: string; data?: unknown }>(
        '/api/_actions/throw-action-error',
        {
          method: 'POST',
          body: { shouldThrow: true },
        },
      )

      expect(result.serverError).toBe('Not enough credits')
      expect(result.data).toBeUndefined()
    })

    it('returns data normally when ActionError is not thrown', async () => {
      const result = await $fetch('/api/_actions/throw-action-error', {
        method: 'POST',
        body: { shouldThrow: false },
      })

      expect(result).toEqual({ data: { ok: true } })
    })
  })

  describe('returnValidationErrors', () => {
    it('returns validation errors thrown from handler', async () => {
      const result = await $fetch<{ validationErrors?: Record<string, string[]> }>(
        '/api/_actions/throw-validation-error',
        {
          method: 'POST',
          body: { email: 'taken@example.com' },
        },
      )

      expect(result.validationErrors).toBeDefined()
      expect(result.validationErrors!.email).toContain('This email is already taken')
    })

    it('returns data when validation passes', async () => {
      const result = await $fetch('/api/_actions/throw-validation-error', {
        method: 'POST',
        body: { email: 'fresh@example.com' },
      })

      expect(result).toEqual({ data: { registered: true } })
    })

    it('validates with Zod before reaching the handler', async () => {
      const result = await $fetch<{ validationErrors?: Record<string, string[]> }>(
        '/api/_actions/throw-validation-error',
        {
          method: 'POST',
          body: { email: 'not-an-email' },
        },
      )

      expect(result.validationErrors).toBeDefined()
      expect(result.validationErrors!.email).toBeDefined()
      expect(result.validationErrors!.email).not.toContain('This email is already taken')
    })
  })

  describe('handleServerError', () => {
    it('transforms unexpected errors through handleServerError', async () => {
      const result = await $fetch<{ serverError?: string }>(
        '/api/_actions/throw-unexpected-error',
        {
          method: 'POST',
          body: { trigger: 'go' },
        },
      )

      expect(result.serverError).toBe('Database connection refused')
    })

    it('uses fallback message when no handleServerError is configured', async () => {
      const result = await $fetch<{ serverError?: string }>(
        '/api/_actions/no-error-handler',
        {
          method: 'POST',
          body: { trigger: 'go' },
        },
      )

      expect(result.serverError).toBe('An unexpected error occurred')
    })
  })

  describe('output schema', () => {
    it('returns data when output passes schema validation', async () => {
      const result = await $fetch('/api/_actions/with-output-schema', {
        method: 'POST',
        body: { value: 10 },
      })

      expect(result).toEqual({ data: { doubled: 20 } })
    })

    it('returns serverError when output fails schema validation', async () => {
      const result = await $fetch<{ serverError?: string; data?: unknown }>(
        '/api/_actions/with-output-schema',
        {
          method: 'POST',
          body: { value: 60 },
        },
      )

      expect(result.serverError).toBeDefined()
      expect(result.serverError).toContain('Output validation failed')
      expect(result.data).toBeUndefined()
    })
  })

  describe('middleware', () => {
    it('executes middleware chain and passes context to handler', async () => {
      const result = await $fetch('/api/_actions/with-middleware', {
        method: 'POST',
        body: { name: 'Alice' },
      })

      expect(result).toEqual({
        data: {
          name: 'Alice',
          requestId: 'req-123',
          role: 'admin',
          timestamp: 1000,
        },
      })
    })

    it('throws error when middleware does not call next()', async () => {
      const result = await $fetch<{ serverError?: string }>(
        '/api/_actions/middleware-no-next',
        {
          method: 'POST',
          body: { name: 'Test' },
        },
      )

      expect(result.serverError).toBeDefined()
      expect(result.serverError).toContain('Middleware did not call next()')
    })
  })

  describe('metadata', () => {
    it('makes metadata accessible in middleware', async () => {
      const result = await $fetch('/api/_actions/with-metadata', {
        method: 'POST',
        body: { input: 'hello' },
      })

      expect(result).toEqual({
        data: {
          input: 'hello',
          actionName: 'with-metadata',
        },
      })
    })
  })

  describe('nested actions', () => {
    it('registers actions from subdirectories with path prefix', async () => {
      const result = await $fetch('/api/_actions/nested/deep-action', {
        method: 'POST',
        body: { message: 'hi' },
      })

      expect(result).toEqual({
        data: { reply: 'Nested: hi' },
      })
    })
  })

  describe('HTTP method support', () => {
    it('executes GET action with query params', async () => {
      const result = await $fetch(
        `/api/_actions/get-user?input=${encodeURIComponent(JSON.stringify({ id: '123' }))}`,
        { method: 'GET' },
      )
      expect(result).toEqual({ data: { id: '123', name: 'Test User' } })
    })

    it('executes PUT action with body', async () => {
      const result = await $fetch('/api/_actions/update-user', {
        method: 'PUT',
        body: { id: '123', name: 'Updated' },
      })
      expect(result).toEqual({ data: { id: '123', name: 'Updated', updated: true } })
    })

    it('executes DELETE action with body', async () => {
      const result = await $fetch('/api/_actions/remove-item', {
        method: 'DELETE',
        body: { id: '123' },
      })
      expect(result).toEqual({ data: { id: '123', deleted: true } })
    })

    it('returns validation errors for GET action with invalid input', async () => {
      const result = await $fetch<{ validationErrors?: Record<string, string[]> }>(
        `/api/_actions/get-user?input=${encodeURIComponent(JSON.stringify({ id: 123 }))}`,
        { method: 'GET' },
      )
      expect(result.validationErrors).toBeDefined()
    })

    it('existing POST actions still work without suffix', async () => {
      const result = await $fetch('/api/_actions/greet', {
        method: 'POST',
        body: { name: 'World' },
      })
      expect(result).toEqual({ data: { greeting: 'Hello, World!' } })
    })
  })

  describe('route generation', () => {
    it('generates routes for each action file with correct methods', async () => {
      const postRoutes = [
        '/api/_actions/greet',
        '/api/_actions/no-schema',
        '/api/_actions/throw-action-error',
        '/api/_actions/throw-validation-error',
        '/api/_actions/throw-unexpected-error',
        '/api/_actions/with-output-schema',
        '/api/_actions/with-middleware',
        '/api/_actions/middleware-no-next',
        '/api/_actions/with-metadata',
        '/api/_actions/no-error-handler',
        '/api/_actions/nested/deep-action',
      ]

      for (const route of postRoutes) {
        const result = await $fetch<Record<string, unknown>>(route, {
          method: 'POST',
          body: {},
        })

        expect(
          result.data !== undefined
          || result.validationErrors !== undefined
          || result.serverError !== undefined,
        ).toBe(true)
      }

      const methodRoutes: { route: string; method: string; body?: Record<string, unknown>; query?: string }[] = [
        { route: '/api/_actions/get-user', method: 'GET', query: `input=${encodeURIComponent(JSON.stringify({ id: '1' }))}` },
        { route: '/api/_actions/update-user', method: 'PUT', body: { id: '1', name: 'x' } },
        { route: '/api/_actions/remove-item', method: 'DELETE', body: { id: '1' } },
      ]

      for (const { route, method, body, query } of methodRoutes) {
        const url = query ? `${route}?${query}` : route
        const result = await $fetch<Record<string, unknown>>(url, {
          method,
          ...(body ? { body } : {}),
        })

        expect(
          result.data !== undefined
          || result.validationErrors !== undefined
          || result.serverError !== undefined,
        ).toBe(true)
      }
    })
  })

  describe('edge cases', () => {
    it('handles null body gracefully', async () => {
      const result = await $fetch<Record<string, unknown>>('/api/_actions/no-schema', {
        method: 'POST',
      })

      expect(result).toBeDefined()
    })

    it('handles multiple validation errors on the same field', async () => {
      const result = await $fetch<{ validationErrors?: Record<string, string[]> }>(
        '/api/_actions/greet',
        {
          method: 'POST',
          body: { name: 42 },
        },
      )

      expect(result.validationErrors).toBeDefined()
      const nameErrors = result.validationErrors!.name
      expect(Array.isArray(nameErrors)).toBe(true)
    })
  })
})
