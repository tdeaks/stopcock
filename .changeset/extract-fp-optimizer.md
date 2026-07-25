---
'@stopcock/fp-optimizer': minor
'@stopcock/fp': minor
---

Extract the fused runner bank into `@stopcock/fp-optimizer`.

The maximum-throughput tier previously shipped inside `@stopcock/fp` as
`@stopcock/fp/fusion/optimized`, which put 214 KB of generated runners into
every install whether or not anyone used them. It is now a separate opt-in
package and `@stopcock/fp` carries none of it.

`@stopcock/fp` has no dependency or optional peer on the optimizer, so an
FP-only install stays complete: sequential `pipe`/`flow`, compact fusion, the
direct operations, and the compiler all work unchanged. The deprecated
`@stopcock/fp/compile` subpath now resolves to compact fusion rather than
breaking or forwarding to a package that may not be installed.

The two packages negotiate identity on hashes at runtime — ABI version,
protocol version, and semantic manifest — because matching version ranges are
necessary but not sufficient. A mismatched pair executes no fused runner.

If you imported `@stopcock/fp/fusion/optimized`, install
`@stopcock/fp-optimizer` and import from it instead.
