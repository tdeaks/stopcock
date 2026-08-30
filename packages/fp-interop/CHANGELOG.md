# @stopcock/fp-interop

## 3.0.0

### Major Changes

- [`5645a2a`](https://github.com/tdeaks/stopcock/commit/5645a2acb1a100ca64ee476e665a68173b8f6e8f) Thanks [@tdeaks](https://github.com/tdeaks)! - Restore data-first calls alongside the existing curried data-last forms across
  the public FP surface.

  **Breaking:** remove the `@stopcock/fp/dual` subpath. Public operations now
  implement dual dispatch directly under their module exports.

  Add matching dual call forms to Autodiff, Color, Diff, and SVG. Move FP
  Compiler, FP Interop, and Parser to the V3 FP peer boundary, and update the
  migration tooling for V3.

### Patch Changes

- Updated dependencies [[`5645a2a`](https://github.com/tdeaks/stopcock/commit/5645a2acb1a100ca64ee476e665a68173b8f6e8f)]:
  - @stopcock/fp@3.0.0

## 2.0.0

### Minor Changes

- [`5db6fca`](https://github.com/tdeaks/stopcock/commit/5db6fcaac5d97e5c28edff63e4803eea6996015b) Thanks [@tdeaks](https://github.com/tdeaks)! - Add explicit, dependency-light adapters for foreign Option and Either shapes,
  nullable and throwable boundaries, promises and iterables, Standard Schema,
  JSON-safe wire values, and Node-style callbacks.

### Patch Changes

- [`c9d24c7`](https://github.com/tdeaks/stopcock/commit/c9d24c78655be6b998c792e1a24aa24c7edd08d6) Thanks [@tdeaks](https://github.com/tdeaks)! - Stable 2.0.0 release of the Stopcock v2 cohort.

- Updated dependencies [[`90c3265`](https://github.com/tdeaks/stopcock/commit/90c326592d9f88506d05c6cfdf97a9b082f80b17), [`27ae9d3`](https://github.com/tdeaks/stopcock/commit/27ae9d393252b9ca64304efdb54e8dcffde2bb6b), [`b8d5ce2`](https://github.com/tdeaks/stopcock/commit/b8d5ce255e9d6866ba7e725d8e5689a64f7d68eb), [`e2481f3`](https://github.com/tdeaks/stopcock/commit/e2481f3754b613f4ec9038c511b9765ae63c80d9), [`d6c5d7b`](https://github.com/tdeaks/stopcock/commit/d6c5d7b124512a921835cacb429eb3f2dd997f85), [`5db6fca`](https://github.com/tdeaks/stopcock/commit/5db6fcaac5d97e5c28edff63e4803eea6996015b), [`5db6fca`](https://github.com/tdeaks/stopcock/commit/5db6fcaac5d97e5c28edff63e4803eea6996015b), [`55ca6a1`](https://github.com/tdeaks/stopcock/commit/55ca6a1385ad7264af11bcbb6a7acfb61cafd05c), [`c9d24c7`](https://github.com/tdeaks/stopcock/commit/c9d24c78655be6b998c792e1a24aa24c7edd08d6), [`e0becf5`](https://github.com/tdeaks/stopcock/commit/e0becf549d2883f598f3a06e605449eca304215b)]:
  - @stopcock/fp@2.0.0

## 2.0.0-next.1

### Patch Changes

- Updated dependencies [[`90c3265`](https://github.com/tdeaks/stopcock/commit/90c326592d9f88506d05c6cfdf97a9b082f80b17), [`27ae9d3`](https://github.com/tdeaks/stopcock/commit/27ae9d393252b9ca64304efdb54e8dcffde2bb6b), [`e2481f3`](https://github.com/tdeaks/stopcock/commit/e2481f3754b613f4ec9038c511b9765ae63c80d9), [`d6c5d7b`](https://github.com/tdeaks/stopcock/commit/d6c5d7b124512a921835cacb429eb3f2dd997f85), [`55ca6a1`](https://github.com/tdeaks/stopcock/commit/55ca6a1385ad7264af11bcbb6a7acfb61cafd05c), [`e0becf5`](https://github.com/tdeaks/stopcock/commit/e0becf549d2883f598f3a06e605449eca304215b)]:
  - @stopcock/fp@2.0.0-next.1

## 2.0.0-next.0

### Minor Changes

- 5db6fca: Add explicit, dependency-light adapters for foreign Option and Either shapes,
  nullable and throwable boundaries, promises and iterables, Standard Schema,
  JSON-safe wire values, and Node-style callbacks.

### Patch Changes

- Updated dependencies [b8d5ce2]
- Updated dependencies [5db6fca]
- Updated dependencies [5db6fca]
  - @stopcock/fp@2.0.0-next.0
