# Screaming fast: compiler programme

USP: **fast, composable, compiles down to efficient code**. Three claims. Each
has to be true and each has to be measurable against something you did not
write yourself.

## Where we actually are

Measured 25 July 2026, Darwin arm64, Bun 1.3.14, n=10,000 unless stated.

| shape | today | hand-written | gap |
|---|---:|---:|---:|
| 5-map chain, compiled | 72,547 | 219,313 | **3.0x off** |
| 5-map chain, root `pipe` | 14,237 | | unfused default |
| 5-map chain, optimizer | 11,832 | | below root |

Tier behaviour by pipeline depth, `map` chains:

| steps | root | compact | optimizer | compiler |
|---:|---:|---:|---:|---:|
| 3 | 26,214 | 1,732 | 72,334 | 70,915 |
| 5 | 14,237 | 1,003 | 11,832 | 66,619 |
| 6 | 11,081 | — | 4,400 | 68,210 |

Three facts to hold onto:

1. The compiler is the only tier that does not degrade with depth.
2. The compiler is still 3x off hand-written on the commonest shape.
3. The optimizer drops **below** unfused root at 4 steps.

Coverage: `ops-table.ts` has 39 entries, all `@stopcock/fp/array/`. The runtime
registry has 67 opcodes. So the compiler reaches 58% of the opcode space and
one domain.

---

## Workstream A: make the emitted code hand-written grade

This is the USP. Everything else is distribution.

### A1. Preallocate where the length is known or tightly bounded

Every emitted loop does `var _d0 = []` then `_d0.push(v)`. Measured
alternatives:

| segment shape | push | prealloc + truncate | verdict |
|---|---:|---:|---|
| all steps cardinality-preserving (`map`) | 72,547 | 219,313 | **do it, 3.0x** |
| bounded by `take(k)`, k small | 35,560,548 | 42,131,770 | **do it, 1.18x** |
| `filter`/`filterMap`, bound = n | 122,332 | 121,624 | **skip, no win** |

So the rule is not "always preallocate". It is:

- Segment where every stream op preserves cardinality → `new Array(_len0)`,
  index-assign, no truncate.
- Segment bounded by `take(k)` → `new Array(min(n,k))`, index-assign,
  `.length = k` at exit.
- Anything else → keep `push`. Over-allocating to `n` and truncating buys
  nothing and costs memory.

Touches `codegen.ts` (`generateFusedBody`, `generateFusedLoop`). The
cardinality classification already exists in the registry, which the frozen
emitter's header comment documents in detail, so this is reading existing
classification rather than inventing one.

Acceptance: 5-map chain within 15% of the hand-written preallocated baseline.
No change to results, callback counts, or callback order on the existing
fixture corpus.

### A2. Inline through local bindings

Today:

```js
const a = x => x*2
pipe(data, A.map(a))       → var _cb0 = (a); ... _cb0(_v0)   // not inlined
pipe(data, A.map(x=>x*2))  → ... var _v1 = (_v0*2)           // inlined
```

`inline.ts` only inlines arrows written at the call site. Resolve a
same-module `const f = <arrow>` binding that is unshadowed and never
reassigned, and inline it identically. Worth ~1.2x on top of A1.

Guard: only when the binding is `const`, initialised to an arrow or function
expression, not captured by anything that could reassign it, and not exported
(an exported binding is observable). Babel's `Scope` already gives the
constant-violation info needed for this.

Acceptance: named-arrow and literal-arrow forms emit byte-identical loop
bodies.

### A3. Fix the reference emitter in the same change

`benchmarks/src/reference/emitter.ts` builds with `push` too. Improve the
compiler alone and the gate ratio climbs from 2.044x to something flattering
while grading against a strawman. Apply the same A1 rule to the reference so
the gate keeps measuring a real target.

Expect the reported ratio to **fall** when this lands. That is correct and
should be called out in the changelog rather than hidden.

### A4. Add a hand-written baseline lane to the gate

The structural fix. Today the compiler is only ever compared to your own
emitter. Add a third column: literal hand-written loops, written once per
fixture shape, frozen and hashed like the emitter already is.

Gate on `compiler / hand-written >= 0.85` per case, not on geo mean alone. The
existing lanes already report worst-case minima (0.906x, 0.866x), so the
machinery is there.

This is what makes "compiles down to efficient code" a claim you can defend
instead of assert.

---

## Workstream B: reach every toolchain

### B1. `stopcock compile` CLI

```
stopcock compile <glob...> [--out-dir <dir> | --in-place]
                 [--sourcemap] [--diagnostics summary|verbose|error]
                 [--receipts <dir>] [--import-source <pkg>]
```

Per file: `transformStopcockPipelines(code, path, opts)` → write `code` and
`map` → `buildCompilerReceipt` per diagnostic site → write
`stopcock-receipts.json`, so `stopcock check` works on CLI output exactly as
on bundler output.

It is file walking plus the bookkeeping already at `plugin.ts:75-123`. `bin`
already points at `dist/cli.js`, so this is a subcommand beside `check`.

Guard rail: `transform.ts` parses `sourceType: 'module'` and matches
`ImportDeclaration` only. CJS input is a silent no-op today. Detect and fail
loudly instead of writing an unchanged file and reporting success.

Covers tsc, Deno, Node-from-source, library builds, Turbopack.

### B2. Widen unplugin

`plugin.ts` uses `createUnplugin`, which supports rspack, farm and rolldown
beyond the four exported. Add export entries plus a fixture each. Cheapest
coverage remaining.

### B3. tsc

Ship the CLI pre-pass, documented. Do **not** build a `ts.TransformerFactory`:
tsc cannot load transformers without ts-patch, and our codegen emits text
while a transformer must return nodes, so splicing raw source through
`ts.factory.createIdentifier` loses source maps and formatting. Revisit only
with a real project asking.

### B4. SWC

Be straight in the docs. SWC dropped JS plugins; `jsc.experimental.plugins` is
Rust/WASM and WASM plugins are isolated, so no thin shim can call back into JS
codegen. A native plugin means porting `codegen.ts`, `ops-table.ts` and
`inline.ts` to Rust. Separate project, not a phase here.

Interim, all cheap:

- `@swc/core` users: document the transform as a pre-pass before
  `swc.transform`.
- Next.js: already covered by the existing webpack adapter. Build a fixture
  app and say so, because "Next uses SWC" reads as "your webpack adapter is
  out".
- Turbopack: CLI only.

If SWC-native demand is real, start from a shared generator emitting both the
TS and Rust ops tables. `ops-table.ts` is already generated, so do not hand
port it.

---

## Workstream C: raise the runtime floor

The compiler cannot lower everything. `transform.ts` refuses computed steps,
spread arguments, unrecognised operators, terminals that are not last, and
shadowed imports. Every refusal lands on the runtime, and the runtime floor is
currently bad.

### C1. Diagnose the optimizer's cliff at 4 steps

Wins to 3 steps (2.78x over root), then falls to 0.77x at 4 and 0.49x at 5.
That pattern reads as a specialised template bank covering shallow shapes and
degrading to a generic executor past them. Confirm against the 233-entry
`FusionRunnerDescriptorV1` bank, then either extend the bank or fix the
generic path so it never loses to doing nothing.

Acceptance: optimizer >= root at every depth 1..10. Beating root is the point
of it existing.

### C2. Optimizer instability

Identical shape measured between 1,022 and 11,371 ops/sec depending on what
ran before it. Suggests cache state carrying across pipelines. Find it.

### C3. `stopcock (optimizer)` produces no samples in
`long.bench.ts > map→map→map→map→map` at n=10,000 and n=100,000. Only that
arm; every other arm reports. Does not reproduce standalone or with the
preceding `flatMap` group. Currently blocks report generation.

### C4. Decide root `pipe`

Either C1 lands and the optimizer is a credible opt-in, or root `pipe` points
back at fusion and eats the size cost. Do not leave the default at 69,621
against remeda's 882,388 while the docs claim it fuses.

---

## Workstream D: coverage

39 of 67 opcodes, one domain. Uncovered: 8 string ops, 3 dict ops, 7 math ops,
7 guard ops, plus `SORT_INLINE` / `UNIQ_INLINE`.

Order by what appears in real pipelines: string ops first, then guards, then
dict. Each entry is an ops-table row plus a codegen template plus fixtures.
The table is generated, so extend the generator, not the output.

"Everything is fast" is not defensible at one domain. This is the workstream
that makes the claim literal, and it is the longest.

---

## Workstream E: stop shipping false numbers

### E1. The docs claim is false today

`apps/docs/src/content/docs/performance/benchmarks.mdx` says "All three
operations fuse into a single loop" about root `pipe`. Root `pipe` has been
sequential since bf49879. Fix before promoting anything else.

### E2. The benchmark suites measured the wrong tier

`pipeline/` and `weakspot/` imported root `pipe` and reported it as the fusion
number. Now carry root, compact and optimizer arms. Add a compiler arm so the
published comparison shows the tier you actually recommend.

### E3. Republish

`apps/docs/src/data/benchmarks-*.json` still holds July numbers. Do not
refresh until A1, A2 and C1 land, then republish all three lanes together.

---

## Sequencing

**Phase 1, truth.** E1, E2. Nothing else ships on top of a false claim.

**Phase 2, speed.** A1, A2, A3, A4 together. A4 is the gate that stops the
next regression, so it lands with the wins, not after.

**Phase 3, floor.** C1, C2, C3, then C4 as a decision with data behind it.

**Phase 4, reach.** B1 CLI, B2 unplugin. Both ship the improved codegen rather
than today's.

**Phase 5, breadth.** D, domain at a time, string ops first.

**Phase 6, optional.** B4 Rust port, only against real demand.

Phases 2 and 4 are the ones that make the USP true. Phase 1 is the one that
stops it being a liability in the meantime.

## The claim that survives this

> Fast: hand-written-grade loops, gated against literal hand-written baselines,
> not against our own emitter.
>
> Composable: you write `pipe`, the compiler decides the loop.
>
> Compiles down to efficient code: and the build tells you, per site, when it
> could not.

That last clause is the one nobody else offers. `diagnostics: 'error'` plus
receipts plus `stopcock check` mean "fast" is enforceable in CI rather than a
benchmark screenshot. Lead with it.
