# @stopcock/eslint-plugin-fp

## 2.0.1

### Patch Changes

- [`5645a2a`](https://github.com/tdeaks/stopcock/commit/5645a2acb1a100ca64ee476e665a68173b8f6e8f) Thanks [@tdeaks](https://github.com/tdeaks)! - Restore data-first calls alongside the existing curried data-last forms across
  the public FP surface.

  **Breaking:** remove the `@stopcock/fp/dual` subpath. Public operations now
  implement dual dispatch directly under their module exports.

  Add matching dual call forms to Autodiff, Color, Diff, and SVG. Move FP
  Compiler, FP Interop, and Parser to the V3 FP peer boundary, and update the
  migration tooling for V3.

## 2.0.0

### Minor Changes

- [`5db6fca`](https://github.com/tdeaks/stopcock/commit/5db6fcaac5d97e5c28edff63e4803eea6996015b) Thanks [@tdeaks](https://github.com/tdeaks)! - Add the FP 2 companion libraries for exhaustive pattern matching, typed parser
  combinators, deterministic law testing, migration lint rules, and conservative
  TypeScript-aware codemods.

### Patch Changes

- [`c9d24c7`](https://github.com/tdeaks/stopcock/commit/c9d24c78655be6b998c792e1a24aa24c7edd08d6) Thanks [@tdeaks](https://github.com/tdeaks)! - Stable 2.0.0 release of the Stopcock v2 cohort.

## 2.0.0-next.0

### Minor Changes

- 5db6fca: Add the FP 2 companion libraries for exhaustive pattern matching, typed parser
  combinators, deterministic law testing, migration lint rules, and conservative
  TypeScript-aware codemods.
