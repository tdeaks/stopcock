# @stopcock/diff

Structural diffing and patching. Compute patches between objects, apply them, compose them, invert them, rebase concurrent edits.

```bash
bun add @stopcock/diff
```

```ts
import { diff, apply, invert, compose, rebase } from '@stopcock/diff'

const before = { name: 'Tom', scores: [10, 20] }
const after = { name: 'Tom', scores: [10, 20, 30] }

const p = diff(before, after)
apply(before, p) // { name: 'Tom', scores: [10, 20, 30] }

const undo = invert(p)
apply(after, undo) // back to before
```

## What's in the box

- **diff / diffWith** — compute a `Patch` between two values, with optional move/rename detection and custom equality
- **apply / applyUnsafe** — apply a patch to a value (safe returns `Result`, unsafe throws)
- **invert** — reverse a patch for undo
- **compose** — merge sequential patches into one, with simplification
- **rebase** — transform a patch over concurrent edits, with conflict detection
- **toJsonPatch / fromJsonPatch** — RFC 6902 JSON Patch interop
- **toLens / fromLens / fromTraversal** — bridge between patches and `@stopcock/fp` optics

All functions are dual (data-first and data-last).
