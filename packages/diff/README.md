# @stopcock/diff

Structural diffing and patching. Compute patches between objects, apply them, compose them, invert them, rebase concurrent edits.

```bash
bun add @stopcock/diff
```

```ts
import { pipe } from '@stopcock/fp'
import { diff, applyUnsafe, invert } from '@stopcock/diff'

const before = { name: 'Tom', scores: [10, 20] }
const after = { name: 'Tom', scores: [10, 20, 30] }

const p = diff(before, after)
applyUnsafe(before, p) // { name: 'Tom', scores: [10, 20, 30] }

const undo = invert(p)
pipe(after, applyUnsafe(undo)) // back to before
```

## What's in the box

- **diff / diffWith**: compute a `Patch` between two values, with optional move/rename detection and custom equality
- **apply / applyUnsafe**: apply a patch to a value (safe returns `Result`, unsafe throws)
- **invert**: reverse a patch for undo
- **compose**: merge sequential patches into one, with simplification
- **rebase**: transform a patch over concurrent edits, with conflict detection
- **toJsonPatch / fromJsonPatch**: RFC 6902 JSON Patch interop
- **toLens / fromLens / fromTraversal**: bridge between patches and `@stopcock/fp` optics

Every data-taking operation with two or more arguments is dual-form. Call it
data-first (`apply(target, patch)`) or use the same name data-last
(`pipe(target, apply(patch))`).

## Dual operation reference

```ts
diff(before, after) / diff(after)(before)
diffWith(before, after, options) / diffWith(after, options)(before)
apply(target, patch) / apply(patch)(target)
applyUnsafe(target, patch) / applyUnsafe(patch)(target)
compose(first, second) / compose(second)(first)
rebase(localPatch, remotePatch) / rebase(remotePatch)(localPatch)
fromLens(source, lens, target) / fromLens(lens, target)(source)
fromTraversal(source, traversal, fn) / fromTraversal(traversal, fn)(source)
```

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
