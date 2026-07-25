# @stopcock/autodiff

## 2.0.0-next.0

### Patch Changes

- b8d5ce2: Release the clean FP 2.0 architecture: a slim root, explicit subpaths, strict
  generated sources, portable-only pipeline compilation, Iter in place of
  Stream, comprehensive data/algebra/collection/optic modules, and explicit
  partiality and equality contracts. Move build-time specialization to the
  compiler package, asynchronous failures to Task/AsyncIter, and migrate all
  first-party consumers to the new subpath and optic APIs.

  Performance contracts now cover 311 required rows per engine across portable
  compilation, build-time specialization, Iter, transducers, collectors, typed
  arrays, dispatch, and every FP module hot-path family. On the final local
  Darwin arm64 characterization, portable compilation measured 1.677×/0.943×
  geomean/minimum on Bun and 1.379×/0.973× on Node; stratified build output
  measured 2.044×/0.906× and 1.572×/0.997× respectively. The separate
  operation-complete compiler lane measured 1.105×/0.866× and 1.181×/0.924×
  across 37 timed operations while retaining `length` and `isEmpty` as
  optimizer canaries. These are comparator-relative paired ratios, not
  cross-machine absolute-throughput claims.

  Linux x64 and macOS arm64 release jobs run Bun 1.3.14 and Node 22, fail closed
  on provenance, completeness, correctness, sampling, statistical, confidence,
  or floor failures, and retain raw plus evaluated artifacts. Package size is
  also gated. The public runtime has no `eval`, `new Function`, function-source
  parsing, or runtime-loaded JIT; optional specialization happens at build time.

- 5db6fca: Ship complete package descriptions, minimum Node.js engine metadata, README
  files, changelogs, and package-local MIT licences with every public package.
- Updated dependencies [b8d5ce2]
- Updated dependencies [5db6fca]
- Updated dependencies [5db6fca]
  - @stopcock/fp@2.0.0-next.0
  - @stopcock/la@2.0.0-next.0

## 0.1.0

### Minor Changes

- Initial release of `@stopcock/autodiff`. Reverse-mode automatic
  differentiation for scalar, vector, and matrix shapes. Pipe-native via ambient
  tape; integrates with `@stopcock/fp` and `@stopcock/la`.

### Patch Changes

- Updated dependencies []:
  - @stopcock/fp@0.0.3
  - @stopcock/la@0.0.3
