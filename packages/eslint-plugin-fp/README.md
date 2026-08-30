# @stopcock/eslint-plugin-fp

Flat-config ESLint rules for Stopcock FP 2 migrations, import hygiene, and
performance-sensitive code.

```bash
bun add -d eslint @stopcock/eslint-plugin-fp
```

```js
// eslint.config.js
import stopcockFp from '@stopcock/eslint-plugin-fp'

export default [stopcockFp.configs.recommended]
```

The stricter performance preset also flags eager callback chains:

```js
export default [stopcockFp.configs.performance]
```

Rules:

- `@stopcock/fp/no-legacy-api` — rejects removed Stream, Dict, Lens, dual,
  dual-lite, and runtime-JIT entry points; only semantics-preserving subpath
  replacements are autofixable, while Lens and dual migrations stay manual.
- `@stopcock/fp/no-root-module-imports` — enforces the slim FP 2 root and points
  module imports at focused subpaths.
- `@stopcock/fp/prefer-option-partials` — points array, number, and object
  `*OrUndefined` escape hatches at their Option-first counterparts.
- `@stopcock/fp/no-eager-array-chains` — opt-in warning for eager callback
  chains that may benefit from `pipe`, `Iter`, transducers, or AOT compilation.

The package does not import ESLint at runtime. ESLint is a peer dependency and
the exported rule objects use a small structural type surface.
