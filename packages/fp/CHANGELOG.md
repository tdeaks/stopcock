# @stopcock/fp

## 2.0.0

### Major changes

- Rebuilt the package around a slim root and explicit, tree-shakeable
  subpaths.
- Replaced Stream with lazy Iter and added transducers and collectors.
- Removed all runtime JIT, source parsing, and adaptive execution tiers.
  Portable compilation is the only runtime path; build-time specialization
  lives in `@stopcock/fp-compiler`.
- Made partiality, equality, sparse-array behavior, mutation, and async error
  boundaries explicit.
- Expanded Option, Result, Validation, These, Nullable, algebra, collections,
  functions, guards, objects, strings, numbers, optics, matching, Reader,
  State, Writer, and stack-safe recursion.
- Added dependency-free Standard Schema V1 interop.
- Removed generated `@ts-nocheck`; the package and public declaration tests
  compile strictly with TypeScript 7.

### Measured performance

The final 23 July 2026 local characterization used Darwin arm64, Bun
1.3.14/JavaScriptCore, and Node 24.18.0/V8 13.6. Ratios are paired reference
time divided by Stopcock time:

| Contract                           | Cases and reference                             | Bun/JSC geo / min | Node/V8 geo / min |
| ---------------------------------- | ----------------------------------------------- | ----------------: | ----------------: |
| Portable `compile`                 | Frozen emitter, 44                              |   1.677× / 0.943× |   1.379× / 0.973× |
| Compiler, stratified               | Frozen emitter, 44                              |   2.044× / 0.906× |   1.572× / 0.997× |
| Compiler, operation-complete       | Frozen operation emitter, 37 timed + 2 canaries |   1.105× / 0.866× |   1.181× / 0.924× |
| Direct `Iter`                      | Hand-written early-exit loop, 3                 |   0.991× / 0.963× |   0.731× / 0.661× |
| Broad `Iter`                       | Frozen executor, 14                             |   1.941× / 1.047× |   2.159× / 0.999× |
| Transducers, collectors, `without` | Frozen implementations, 45                      |   1.762× / 0.993× |   1.597× / 0.993× |
| Typed arrays                       | Frozen implementations, 48                      |   8.879× / 0.973× |   2.272× / 0.814× |
| Typed arrays                       | Native equivalents, 48                          |   1.149× / 0.716× |   1.211× / 0.869× |
| Callback churn                     | Frozen compile contract, 4                      |   2.254× / 1.013× |   1.615× / 0.985× |
| `pipe` dispatch                    | Frozen dispatcher, 4                            |   1.097× / 1.025× |   1.072× / 1.033× |
| Core utilities                     | Frozen implementations, 18                      |   3.452× / 0.669× |   2.272× / 0.728× |
| Data and functional                | Frozen implementations, 11                      |   2.353× / 0.790× |   1.454× / 0.861× |
| Structural                         | Frozen implementations, 15                      |   1.813× / 0.967× |   2.113× / 0.847× |
| Scalar, text, and hash             | Frozen implementations, 11                      |   2.031× / 0.985× |   1.344× / 0.928× |
| Recursion, match, schema, writer   | Frozen implementations, 11                      |   3.229× / 0.988× |   4.345× / 0.946× |

Raw minima remain visible where semantics or native-call overhead impose a
documented trade-off. Gates fail closed on provenance, population, semantic,
sampling, statistical, confidence, and floor failures. The operation compiler
gate balances lexical call-site roles across fresh workers; fixed-input
`length` and `isEmpty` are retained as optimizer canaries rather than claimed
as literal latency. CI reruns all contracts with Bun 1.3.14 and Node 22 on
Linux x64 and macOS arm64.

The default runtime remains strict-CSP compatible: it does not use `eval`,
`new Function`, source parsing, or runtime JIT loading; optional specialization
happens at build time.

See [MIGRATION.md](./MIGRATION.md) for source-level changes.

## 0.0.3

### Patch changes

- Published the expanded functional core, subpath-based async imports,
  accelerated linear algebra, image colour filters, and the extended
  signal/DSP surface.
