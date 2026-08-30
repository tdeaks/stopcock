# @stopcock/svg

## 2.1.0

### Minor Changes

- [`5645a2a`](https://github.com/tdeaks/stopcock/commit/5645a2acb1a100ca64ee476e665a68173b8f6e8f) Thanks [@tdeaks](https://github.com/tdeaks)! - Restore data-first calls alongside the existing curried data-last forms across
  the public FP surface.

  **Breaking:** remove the `@stopcock/fp/dual` subpath. Public operations now
  implement dual dispatch directly under their module exports.

  Add matching dual call forms to Autodiff, Color, Diff, and SVG. Move FP
  Compiler, FP Interop, and Parser to the V3 FP peer boundary, and update the
  migration tooling for V3.

### Patch Changes

- [`a901c29`](https://github.com/tdeaks/stopcock/commit/a901c29db355ff99468a7b1fc54520a6bf9338e1) Thanks [@tdeaks](https://github.com/tdeaks)! - Replace leaked workspace dependency protocols with registry-resolvable ranges.

- Updated dependencies [[`a901c29`](https://github.com/tdeaks/stopcock/commit/a901c29db355ff99468a7b1fc54520a6bf9338e1), [`5645a2a`](https://github.com/tdeaks/stopcock/commit/5645a2acb1a100ca64ee476e665a68173b8f6e8f)]:
  - @stopcock/color@2.1.0

## 2.0.0

### Patch Changes

- [`5db6fca`](https://github.com/tdeaks/stopcock/commit/5db6fcaac5d97e5c28edff63e4803eea6996015b) Thanks [@tdeaks](https://github.com/tdeaks)! - Ship complete package descriptions, minimum Node.js engine metadata, README
  files, changelogs, and package-local MIT licences with every public package.

- [`c9d24c7`](https://github.com/tdeaks/stopcock/commit/c9d24c78655be6b998c792e1a24aa24c7edd08d6) Thanks [@tdeaks](https://github.com/tdeaks)! - Stable 2.0.0 release of the Stopcock v2 cohort.

- Updated dependencies [[`b8d5ce2`](https://github.com/tdeaks/stopcock/commit/b8d5ce255e9d6866ba7e725d8e5689a64f7d68eb), [`5db6fca`](https://github.com/tdeaks/stopcock/commit/5db6fcaac5d97e5c28edff63e4803eea6996015b), [`c9d24c7`](https://github.com/tdeaks/stopcock/commit/c9d24c78655be6b998c792e1a24aa24c7edd08d6), [`c9d24c7`](https://github.com/tdeaks/stopcock/commit/c9d24c78655be6b998c792e1a24aa24c7edd08d6)]:
  - @stopcock/color@2.0.0
  - @stopcock/la@2.0.0

## 2.0.0-next.1

### Patch Changes

- Updated dependencies []:
  - @stopcock/color@2.0.0-next.1

## 2.0.0-next.0

### Patch Changes

- 5db6fca: Ship complete package descriptions, minimum Node.js engine metadata, README
  files, changelogs, and package-local MIT licences with every public package.
- Updated dependencies [b8d5ce2]
- Updated dependencies [5db6fca]
  - @stopcock/color@2.0.0-next.0
  - @stopcock/la@2.0.0-next.0

## 0.0.2

### Patch Changes

- Updated dependencies []:
  - @stopcock/la@0.0.3
  - @stopcock/color@0.0.2
