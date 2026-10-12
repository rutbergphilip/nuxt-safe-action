# Contributing

Issues and pull requests are welcome. For a bug, include a minimal reproduction, module/Nuxt/validator versions, expected behavior, and actual behavior. Remove secrets and private data.

## Local development

Use Node 24 for the repository toolchain and the pnpm version declared in `package.json`.

```bash
pnpm install
pnpm dev:prepare
pnpm dev
```

Run the relevant focused tests while working, then the complete verification gate:

```bash
pnpm verify
```

Keep existing public APIs compatible. Add regression coverage for changed runtime behavior and compile-time coverage for changed inference. Update README, documentation, examples, and changelog together. The documentation landing page is `docs/app/pages/index.vue`; `docs/content/index.md` also contains the content introduction.

Examples must identify demo storage and omitted application infrastructure explicitly. Claims about performance, size, or security need reproducible evidence. Fair comparisons should acknowledge what alternatives provide.

Report vulnerabilities using [SECURITY.md](./SECURITY.md), rather than posting exploit details in a public issue.
