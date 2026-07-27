# Repository agent guidance

This is the `stopcock` monorepo: TypeScript packages under `packages/*` (the
core being `@stopcock/fp` and its build-time compiler `@stopcock/fp-compiler`),
demo apps under `apps/*`, and cross-package benchmarks under `benchmarks/`.
Workspaces are managed with `bun` and `vite-plus` (`vp`).

Common commands from the repo root:

- `bun run test` -- run the workspace test suite (`vp test run`).
- `bun run lint` / `bun run lint:fix` -- lint the workspace.
- `bun run test:types` -- run each package's type-level test config.
- `bun run test:packed` -- pack `@stopcock/fp` and `@stopcock/fp-compiler`,
  install them into a scratch project, and verify a compiled pipeline.
- `vp run build:packages` -- build every package workspace.

Releases go through changesets: `bun run changeset` to record an intent,
`bun run changeset:version` to apply it. There is no other release machinery.
