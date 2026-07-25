# `@stopcock/graph` and `@stopcock/merge`

## Summary

Build two independent, ESM-only packages:

- `@stopcock/graph`: a persistent immutable graph with structurally shared snapshots, pipe-friendly edits, explicit change patches, and core graph algorithms.
- `@stopcock/merge`: a local-first document CRDT with an explicit `Document<T>` handle, a normative TypeScript engine, and a byte-compatible first-party Rust/WASM backend.

Both start at `0.0.0` with `private: true`, use the current Vite+ package pipeline, and publish independently as `1.0.0` only after their production-core gates pass. They are capability equivalents, not drop-in replacements: Graphology APIs and Automerge files, changes, cursors, and sync messages are intentionally incompatible.

Use [Graphology 0.26.0](https://github.com/graphology/graphology/releases/tag/0.26.0) and [Automerge 3.3.2](https://github.com/automerge/automerge/releases/tag/js/automerge-3.3.2) as fixed semantic and differential-test oracles.

## Public interfaces

### `@stopcock/graph`

- Export opaque `Graph<K, NodeAttributes, EdgeAttributes, GraphAttributes>`, `GraphOptions`, `Edge`, `GraphPatch`, `GraphCommit`, `TraversalStep`, `PathResult`, and typed error classes.
- Node keys are strings or finite numbers. Simple-edge IDs are derived deterministically when omitted; multigraph edges require an explicit branded string `EdgeId`.
- Factories: `directed`, `undirected`, `mixed`, their multi variants, `fromNodes`, `fromEdges`, and `fromJSON`.
- Query surface: counts, node/edge lookup, degrees, directional neighbors, extremities, attributes, insertion-stable iterables, and allocation-light `forEachNode`/`forEachEdge`.
- Every edit returns a new graph and supports data-first/data-last forms: node/edge add, upsert and removal; graph/node/edge attribute set, merge and update; bulk edits; `clear` and `clearEdges`.
- `edit(graph, draft => …)` uses a temporary mutable draft and returns `{ graph, patch }`. `GraphPatch` is serializable, replayable, and invertible, replacing Graphology-style mutation events for state/UI integration.
- Public subpaths:

  - `/traversal`: lazy `bfs` and `dfs` returning `@stopcock/fp/iter` values.
  - `/components`: connected and strongly connected components.
  - `/dag`: cycle detection, cycle witness, topological order and generations.
  - `/path`: unweighted shortest path, Dijkstra, A*, single-source distances and node-to-edge path conversion.
  - `/operators`: reverse, subgraph, union, intersection, difference, disjoint union, directed/undirected casts and multigraph-to-simple reduction.

Traversal order is deterministic from insertion order. Weighted algorithms reject negative or non-finite weights. Topological operations return typed cycle errors rather than partial output.

### `@stopcock/merge`

```ts
create<T>(initial: T, options?: CreateOptions): Document<T>
value<T>(doc: Document<T>): DeepReadonly<T>
change<T>(doc, options?, recipe): Document<T>
changeWithPatches<T>(doc, options?, recipe): Commit<T>
fork<T>(doc, options?): Document<T>
merge<T>(left, right): Document<T>
heads(doc): Heads
view(doc, heads): Document<T>
getChanges(doc, since?): readonly Change[]
applyChanges(doc, changes): Document<T>
missingDependencies(doc): readonly ChangeHash[]
conflicts(doc, path): ReadonlyMap<OpId, unknown>
diff(doc, fromHeads, toHeads): readonly MergePatch[]
save(doc): Uint8Array
load<T>(bytes, options?): Document<T>
free(doc): void
```

- `Document<T>` is an explicit opaque handle; projected application data is read through `value`.
- `change` provides a synchronous, revoked-after-commit draft proxy and data-first/data-last overloads. Thrown, async, nested, stale-actor or invalid changes commit nothing.
- Supported values: nested string-keyed maps, lists, collaborative strings, `null`, booleans, IEEE-754 numbers, signed 64-bit bigint, `Date`, copied byte arrays and checked 64-bit `Counter`s. Reject `undefined`, sparse arrays, cycles, functions, symbols, `Map` and `Set`.
- List proxy operations retain stable element identities. `Text.splice` and `Text.update` use UTF-16 code-unit positions. Cursor helpers create stable before/after-biased positions across concurrent insertion and deletion.
- Actor and document IDs default to cryptographically random 128-bit IDs; callers may supply fixed IDs. Never fall back to `Math.random`. Metadata timestamps are opt-in and never participate in conflict ordering.
- Root imports use the TypeScript backend. `/wasm` exports `createWasmBackend()` using the packaged artifact and `instantiateWasm(bytesOrModule)` for custom loading. `create` and `load` accept either backend; save/change bytes must cross-load identically.
- `@stopcock/merge` does not depend on `@stopcock/graph`. Its causal graph remains an internal packed structure.

## Implementation and milestones

1. **Repository scaffolding**

   - Follow the live Vite+ conventions in [vite.config.ts](../../../vite.config.ts), [tooling/pack.config.ts](../../../tooling/pack.config.ts), and the existing package manifest pattern.
   - Give Graph entries for root plus its five algorithm subpaths; give Merge root and `/wasm` entries.
   - Add both to TypeScript references, benchmarks, docs catalogue/sidebar, README and generated LLM-doc introduction. Repair the stale dist-benchmark alias before adding packed-package comparisons.
   - Keep both packages side-effect-free. The Merge root must not import or initialize WebAssembly.

2. **Graph 1.0**

   - Implement persistent HAMTs for node/edge/index maps and persistent vectors for deterministic iteration order. Each node owns persistent inbound, outbound and undirected adjacency sets.
   - Use owner-token transient nodes inside `edit` and bulk imports, then seal the result as a persistent snapshot. Single edits copy only affected trie/vector paths.
   - Validate topology and all operands before producing a snapshot. Inputs and previous snapshots remain unchanged after every failure.
   - Implement versioned JSON serialization containing options, graph attributes, nodes and edges. Reject non-JSON-safe attributes with an exact path.
   - Complete the five production-core algorithm subpaths and release Graph independently.

3. **Merge 1.0**

   - Freeze the CRDT rules from Automerge’s documented [data model](https://automerge.org/docs/reference/documents/) and [merge rules](https://automerge.org/docs/reference/under-the-hood/merge-rules/), while using a distinct Stopcock format.
   - Store content-addressed changes with actor ID, actor sequence, operation counter range, dependency hashes, optional message/time and operations. SHA-256 of canonical change bytes is the change identity; heads are causal-DAG leaves.
   - Maps use multi-value registers with deterministic `(counter, actorId)` winners while retaining conflicts. Lists/text use stable RGA-style element IDs and tombstones; concurrent insertion runs remain contiguous. Counter increments commute.
   - Maintain an append-only shared change store; each immutable document handle fixes its heads and actor state. Editing two branches with one actor raises `ActorForkError`; callers must `fork` to obtain another actor.
   - Buffer structurally valid changes with missing dependencies and apply them when dependencies arrive. Duplicate changes are idempotent; malformed hashes, actor sequences, counter ranges or document IDs fail atomically.
   - Define the custom `stopcock-merge/1` change and save envelopes with canonical ordering, checksums and complete reachable history. The 1.x reader must remain backward-compatible with all prior 1.x envelopes.
   - Default decoder limits: 64 MiB input, 1 million changes, 10 million operations, 100,000 pending changes, depth 256 and 16 MiB per string; all are caller-configurable.
   - Share the draft recorder and projection/patch layer between backends. Implement the CRDT engine twice behind one internal backend contract:

     - TypeScript is the normative reference.
     - Rust duplicates validation, causal storage, materialization and encoding.
     - The WASM FFI accepts batched binary transactions and returns heads, canonical changes and materialized patches, avoiding per-property crossings.
     - Package the WASM only behind `/wasm`; cross-backend changes and saves must be byte-identical.

4. **Post-1.0 additive milestones**

   - Graph 1.1: generators, MST, k-cores, bipartite tools, simple paths, PageRank/HITS/centralities, metrics, Louvain, similarity and sparsification.
   - Graph 1.2: GEXF/GraphML, layouts, ForceAtlas2/no-overlap workers, and optional SVG/Canvas adapters.
   - Merge 1.1: rich-text marks, spans and block markers; incremental persistence; compensating-change undo/redo.
   - Merge 1.2: stateful sync, `Repo`/`DocHandle`, IndexedDB and Node storage, WebSocket/BroadcastChannel adapters, safe compaction and ephemeral presence.
   - Automerge wire/storage interoperability remains outside this roadmap; its [binary format](https://automerge.org/automerge-binary-format-spec/) is substantially more than semantic CRDT parity.

## Test and release gates

- Graph:

  - Constructor/topology matrix, loops, mixed direction and multigraph identity.
  - Snapshot immutability, structural-sharing behavior, batch/sequential equivalence and patch apply/invert laws.
  - Directed traversal order, component/DAG/path fixtures, unreachable paths, cycles and invalid weights.
  - Property and differential tests against Graphology for shared semantics, normalized around the intentionally different immutable API.
  - Sparse, dense, hub-heavy, mixed and million-edge benchmarks; competitor results are informational, while checked-in internal regression budgets gate release.

- Merge:

  - Random multi-replica histories proving convergence, merge commutativity/associativity/idempotence and delivery-order independence.
  - Same-key conflicts, delete-versus-update, concurrent list/text insertion, tombstones, counters and cursor anchoring.
  - Stale actor, missing dependency, corruption, truncation, overflow and resource-limit failures.
  - Canonical save/load and cross-backend TS↔WASM byte parity after every randomized transaction.
  - Semantic differential tests against Automerge 3.3.2 with fixed actors and metadata; never compare or promise upstream bytes.
  - Native Rust tests, Node/Bun WASM tests, a real-browser WASM smoke test, decoder fuzzing and edit-trace merge/replay/save/load/memory benchmarks.

- Both packages must pass lint, type-aware lint, runtime/type tests, build, every subpath import, tree-shaking checks, packed-tarball clean installs and docs builds. CI must install/cache the Rust WASM target for Merge without bringing `@stopcock/synth` into package automation.
- After all package-specific gates pass, remove `private`, add one major Changeset, inspect the publish set, and release that package as `1.0.0`.

## Assumptions and boundaries

- Package names mean `@stopcock/graph` and `@stopcock/merge`.
- Graph is persistent and immutable; it deliberately exposes commits/patches rather than event-emitter mutation semantics.
- Merge uses a familiar mutation callback but remains an explicit document handle, not a doc-as-data proxy.
- Neither package promises Graphology API compatibility or Automerge API/wire compatibility. Adapted upstream MIT fixtures retain their notices.
- Existing `@stopcock/diff` may receive a later materialized-patch adapter, but it is not part of the CRDT engine.
- The current large, user-owned Vite+ migration worktree is baseline state and must be preserved; no implementation should resurrect stale Turbo/tsup instructions or absorb unrelated changes.
- `@stopcock/synth` remains untouched, private and excluded from public build/test/release automation.
