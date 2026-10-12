---
title: Home
description: Type-safe Nuxt server actions with Standard Schema validation, typed forms, middleware, and optimistic updates.
navigation: false
layout: page
---

::u-page-hero
#title
Type-safe Server Actions for [Nuxt]{style="color: var(--color-primary-500)"}

#description
Validate contracts with Zod, Valibot, ArkType, or Standard Schema. Build forms and mutations with typed middleware, predictable errors, cancellation, and optimistic updates.

#links
  :::u-button
  ---
  to: /getting-started/installation
  trailing-icon: i-lucide-arrow-right
  ---
  Get Started
  :::
  :::u-button
  ---
  color: neutral
  variant: outline
  to: /guide/forms
  ---
  Form Recipes
  :::
::

## Validated contracts, predictable forms

Input/output types flow through generated action references, including schema transforms. Typed middleware provides request context. `useAction` gives the latest request ownership of state, explicit cancellation, and callbacks. `useFormAction` adds typed values and snapshot submission; `useOptimisticAction` adds immutable updates with guarded rollback.

## Start with working examples

- [Your first action](/getting-started/usage)
- [HTML and Nuxt UI forms](/guide/forms)
- [Authentication and ownership](/guide/authentication)
- [Optimistic updates](/guide/optimistic-updates)
- [Nuxt SSR queries](/guide/queries)
- [Validator choice](/guide/validation)
- [Choosing an abstraction](/guide/comparison)

The module focuses on the form and mutation path and composes with Nuxt's existing query tools. Actions require a server deployment. Application authorization, CSRF policy, persistence, and idempotency remain explicit.
