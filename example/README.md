# Runnable example

This standalone Nuxt app uses the published `nuxt-safe-action` package. It demonstrates a working HTML form, nested profile validation and business-rule errors, and optimistic success/rollback. Actions echo demonstration data; they do not authenticate users or persist records.

```bash
pnpm install
pnpm dev
```

Try the profile name `admin` for a field error, and the second optimistic task for a deliberate server failure. New optimistic executions replace pending ones.

Build with `pnpm build`. See the documentation authentication recipe before adapting these public demo endpoints to private data.


The profile form now demonstrates typed duplicate-email errors, nested field helpers, dirty/touched tracking, optional client validation, and successful-mutation refresh of an ordinary Nuxt query. Try `taken@example.com`, and edit a field while the delayed request is pending. Profile details are echoed but not stored; only an acceptance counter lives in demo process memory.
