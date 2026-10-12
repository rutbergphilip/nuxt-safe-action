# Runnable example

This standalone Nuxt app uses the published `nuxt-safe-action` package. It demonstrates a working HTML form, nested profile validation and business-rule errors, and optimistic success/rollback. Actions echo demonstration data; they do not authenticate users or persist records.

```bash
pnpm install
pnpm dev
```

Try the profile name `admin` for a field error, and the second optimistic task for a deliberate server failure. New optimistic executions replace pending ones.

Build with `pnpm build`. See the documentation authentication recipe before adapting these public demo endpoints to private data.
