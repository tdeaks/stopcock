---
'@stopcock/fp': major
---

Root `pipe` and `flow` are sequential. Fusion is now something you ask for.

`pipe(xs, map(f), filter(g))` used to fuse into a single pass automatically.
It no longer does: it applies each step in turn, like every other pipe you have
used. Same steps, same input, same result — what changes is that intermediate
arrays are no longer elided and callbacks run stage by stage rather than
interleaved per element.

If you want fusion, import it by name:

```ts
import { pipe } from '@stopcock/fp/fusion'
```

That entry has meant exactly this since it shipped and keeps meaning it. If you
build with a bundler, `@stopcock/fp-compiler` fuses at build time and leaves no
runtime engine in your output at all.

Why: the root is what most people import, and it was carrying an optimizer for
everyone who only wanted to compose two functions. Importing `pipe` now costs
191 gzip bytes.

Four names also moved off the root to the subpaths that own them:

| was                      | now                         |
| ------------------------ | --------------------------- |
| `compile`, `compilePure` | `@stopcock/fp/compile`      |
| `dual`                   | `@stopcock/fp/dual`         |
| `explain`                | `@stopcock/fp/fusion/debug` |

`@stopcock/fp-codemod` rewrites all four.

Nothing else about the root changed: `some`, `none`, `ok`, `err`, the guards,
and the types are where they were.
