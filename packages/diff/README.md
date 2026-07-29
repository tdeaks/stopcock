# @stopcock/diff

Structural diffing and patching. Compute patches between objects, apply them, compose them, invert them, rebase concurrent edits.

```bash
bun add @stopcock/diff
```

```ts
import { diff, apply, invert } from '@stopcock/diff'

const before = { name: 'Tom', scores: [10, 20] }
const after = { name: 'Tom', scores: [10, 20, 30] }

const p = diff(after)(before)
apply(p)(before) // { name: 'Tom', scores: [10, 20, 30] }

const undo = invert(p)
apply(undo)(after) // back to before
```

## What's in the box

- **diff / diffWith**: compute a `Patch` between two values, with optional move/rename detection and custom equality
- **apply / applyUnsafe**: apply a patch to a value (safe returns `Result`, unsafe throws)
- **invert**: reverse a patch for undo
- **compose**: merge sequential patches into one, with simplification
- **rebase**: transform a patch over concurrent edits, with conflict detection
- **toJsonPatch / fromJsonPatch**: RFC 6902 JSON Patch interop
- **toLens / fromLens / fromTraversal**: bridge between patches and `@stopcock/fp` optics

Every function is curried, data-last: `apply(patch)(target)`, not `apply(target, patch)`.

## Optics bridge

The bridge uses the functional optics API from `@stopcock/fp/optic`:

```ts
import { toLens } from '@stopcock/diff'
import { set, view } from '@stopcock/fp/optic'

const source = { user: { name: 'Tom' } }
const name = toLens({
  op: 'replace',
  path: ['user', 'name'],
  oldValue: 'Tom',
  newValue: 'Ada',
})

if (name) {
  view(name)(source) // 'Tom'
  set(name, 'Ada')(source) // { user: { name: 'Ada' } }
}
```
