# Stopcock incremental pipelines research and implementation plan

> **Status:** gated research programme with a private implementation path.
>
> **Earliest release:** after the coordinated Stopcock 2.0 FP/compiler release.
> Do not add a new `packages/*` workspace during the 2.0 cohort unless the
> canonical 2.0 superplan is deliberately amended.
>
> **Working package name after graduation:** `@stopcock/incremental`.

## Outcome

Prove and, only if the proof succeeds, ship a framework-neutral incremental
view runtime for keyed collections. A qualifying plan initializes from a full
collection and then updates its derived result using work proportional to the
changed entities and affected groups rather than traversing the complete
source.

The first supported grammar is intentionally narrow:

- stable entity identity;
- a pure filter predicate;
- a pure group-key projection;
- `count`;
- exact integer or bigint contribution sums;
- explicitly supplied retractable aggregates.

The programme must establish semantic, memory, and crossover evidence before
ordinary `@stopcock/fp` operations are recognized by the compiler. It must not
claim that arbitrary `groupBy`, `mapValues`, reducers, sorting, windows, or
floating-point pipelines become incremental automatically.

## Strategic role

Incremental execution is the longest-term semantic-specialization bet. It can
eventually let one logical operation vocabulary run:

- directly;
- through fused array loops;
- through build-time compiler output;
- through worker or numeric kernels where applicable; or
- as a pure delta processor.

That convergence is valuable only if the semantic differences are explicit.
Incremental evaluation invokes predicates and projections fewer times and in a
different order than full recomputation. It therefore belongs to a declared
pure/delta contract and is not an exact-mode backend for arbitrary JavaScript
callbacks.

## Current repository seams

- `packages/state/src/computed.ts` recomputes its complete derive function when
  the selected source changes.
- `packages/fp/src/array.ts` `groupBy` is an ordinary whole-array function.
- `packages/fp/src/object.ts` `mapValues` is opaque to FP Plan IR.
- `packages/fp/src/collector.ts` supports initialization, addition, finishing,
  and early completion but no retraction or update law.
- `packages/diff` represents path patches, not the keyed change protocol in
  this plan.
- `packages/persistent` provides structural sharing but does not make arbitrary
  collection transformations incremental.
- `@stopcock/fp-compiler` currently recognizes a bounded array grammar and
  cannot infer identity, inverse aggregation, or purity from arbitrary
  callbacks.

These are useful integration seams, not an existing differential engine.

## Explicit exclusions

- No arbitrary callback side effects or exact callback-count guarantee.
- No index-addressed array source as the canonical identity model.
- No floating-point sum in exact 1.0 mode.
- No `sort`, `scan`, `take`, top-k, joins, windows, `uniq`, arbitrary reduce, or
  nested differential dataflow in the first publishable grammar.
- No CRDT, replication, offline synchronization, or distributed consistency
  claim.
- No automatic compiler rewrite until the explicit runtime has passed the
  differential and crossover gates.
- No hidden full recomputation described as incremental success.

## Semantic model

### Keyed source

Every source is a map from a stable key to one entity:

```ts
export type EntityKey = string | number | bigint

export type EntityChange<K, A> =
  | {
      readonly type: "insert"
      readonly revision: number
      readonly key: K
      readonly value: A
    }
  | {
      readonly type: "delete"
      readonly revision: number
      readonly key: K
      readonly previous: A
    }
  | {
      readonly type: "replace"
      readonly revision: number
      readonly key: K
      readonly previous: A
      readonly value: A
    }
```

Rules:

- initialization rejects duplicate keys;
- revisions are monotonically increasing safe integers;
- `insert` rejects an existing key;
- `delete` and `replace` validate `previous` using the plan's configured
  equality before mutation;
- a key change is a delete plus insert in one atomic batch;
- stale, duplicated, or skipped revisions fail explicitly unless the caller
  provides an accepted snapshot/reconciliation policy;
- a failed change leaves source indexes and derived output unchanged.

### Pure plan

Use an explicit builder rather than pretending existing opaque functions are
incremental:

```ts
const totals = Incremental.define<Order, string>()
  .keyBy((order) => order.id)
  .filter((order) => order.active)
  .groupBy((order) => order.customerId)
  .aggregate(Incremental.sumInt((order) => order.amountPence))

const view = totals.initialize(orders)
const result = view.apply(change)
```

The builder records a closed operator sequence plus trusted callback bindings.
Callbacks must be documented pure and deterministic. Stopcock cannot prove
purity from TypeScript source; the runtime and future compiler therefore expose
the assumption in every explanation and receipt.

### Retractable aggregate

Custom aggregation requires explicit delta algebra:

```ts
export interface RetractableAggregate<A, State, Output> {
  readonly id: string
  readonly version: number
  init(): State
  add(state: State, value: A): State
  remove(state: State, value: A): State
  update?(state: State, previous: A, value: A): State
  finish(state: State): Output
  readonly laws: {
    readonly removeUndoesAdd: true
    readonly orderIndependent: boolean
  }
}
```

The first release supplies:

- `count()`;
- `sumInt(project)` with safe-integer overflow detection;
- `sumBigInt(project)`;
- a development-only custom aggregate constructor requiring explicit law
  fixtures.

If `orderIndependent` is false, the plan must retain enough stable per-group
order to reproduce its documented result or reject the aggregate. Associative
but non-invertible aggregations may later recompute one affected group, but
their report must say `changed-group-recompute`; they cannot claim constant
delta work.

### Result order

The result is a keyed read-only view, not an object whose property order is
accidental. Group iteration order is first-live-insertion order:

- a new group is appended;
- replacing an entity without changing its group does not move the group;
- a group removed at zero members loses its position;
- recreating it later appends it as new.

Alternative sorted output is outside the first grammar.

## Runtime architecture

Each initialized view owns:

1. an entity table keyed by stable identity;
2. retained predicate membership per entity;
3. retained group key per accepted entity;
4. retained aggregate contribution per accepted entity;
5. aggregate state and member count per group;
6. stable group-order metadata;
7. the last accepted revision;
8. bounded work counters and explanation metadata.

Applying a replacement:

1. validate revision, key, and `previous`;
2. evaluate the old retained membership/group/contribution without rerunning
   old callbacks;
3. evaluate the new predicate/group/contribution once;
4. construct a transaction-local delta;
5. retract the old contribution where necessary;
6. add the new contribution where necessary;
7. commit all indexes and group state atomically;
8. return a work report.

No observer sees partially updated group state.

## Work and memory reporting

Every `apply` returns:

```ts
export interface IncrementalUpdateReport {
  readonly planHash: string
  readonly revision: number
  readonly entitiesChanged: number
  readonly groupsTouched: number
  readonly callbacksInvoked: number
  readonly aggregateAdds: number
  readonly aggregateRemoves: number
  readonly groupRecomputations: number
  readonly fallback?: "full-recompute" | "changed-group-recompute"
}
```

Claims must be precise:

- the core grammar targets work proportional to changed entities and touched
  groups;
- no public documentation promises universal `O(1)`;
- reports distinguish incremental work, affected-group recomputation, and full
  fallback;
- retained-index memory is measured independently from source and result
  memory;
- automatic mode uses a measured crossover and may choose full recomputation
  for small collections or bulk changes.

## Error model

Export discriminated errors for:

- invalid/duplicate key;
- stale, duplicate, or non-contiguous revision;
- previous-value mismatch;
- predicate, group, or contribution callback failure;
- safe-integer overflow;
- aggregate law/configuration failure;
- unsupported operation;
- corrupted checkpoint;
- disposed view.

Callback errors preserve the original cause and fail before commit. A view is
still usable after a rejected change unless an internal invariant failure marks
it poisoned; a poisoned view requires reinitialization and surfaces a distinct
implementation-defect error.

## Implementation phases

### Phase 0 — Research corpus and falsification harness

1. Define independent full-recompute reference functions for every proposed
   plan shape.
2. Generate deterministic insert/delete/replace/batch histories including key
   changes, group creation/removal, predicate flips, callback failures, and
   stale revisions.
3. Measure source sizes, group cardinality distributions, change batch sizes,
   memory overhead, and crossover against full recomputation.
4. Document semantic differences from ordinary FP execution.

**Gate:** a checked-in report demonstrates at least one realistic large-source
family where delta execution has a material win without unacceptable retained
memory. A negative result stops the package but retains the corpus.

### Phase 1 — Private explicit runtime

1. Implement the keyed source, plan builder, count, integer sum, and bigint sum
   under a private experimental workspace outside the public package cohort.
2. Implement atomic single-change and batch application.
3. Emit deterministic plan hashes and work reports.
4. Keep compiler, State, Diff, and Persistent integrations absent.

**Gate:** after every generated change, source state and result are identical
to independent full recomputation.

### Phase 2 — Differential laws and failure atomicity

1. Add property tests for aggregate add/remove/update laws.
2. Test prior-value mismatch, overflow, callback throw, and malformed change
   atomicity.
3. Test group order and deletion/recreation rules.
4. Fuzz long histories and checkpoint/reinitialize equivalence.

**Gate:** no failing seed is waived; every historical regression seed becomes a
permanent fixture.

### Phase 3 — Crossover and automatic strategy

1. Benchmark initialization, single changes, batch changes, and full rebuild.
2. Measure retained memory and garbage collection separately.
3. Define checked-in crossover profiles by source size, change ratio, and plan
   family.
4. Add `strategy: "incremental" | "recompute" | "auto"` and make the selected
   strategy observable.

**Gate:** `auto` never selects incremental below an unproven crossover and
never hides a full rebuild in an incremental report.

### Phase 4 — State and Diff adapters

1. Define an adapter from committed State patches to keyed entity changes.
2. Accept only unambiguous keyed object/map add, remove, and replace operations.
3. Reject array-index moves, ambiguous nested patches, and missing previous
   values.
4. Deliver view notifications only after the source transaction commits.

**Gate:** applying a State transaction and its accepted incremental changes
produces the same snapshot as rebuilding from the committed Store state.

### Phase 5 — Persistence and recovery

1. Add a versioned JSON-safe checkpoint containing plan identity, source
   revision, retained entity facts, and group state.
2. Never serialize callback functions; rehydration requires the same plan hash.
3. Validate all lengths, keys, aggregate IDs, and revisions before allocation.
4. Fall back to source reinitialization on a safe, explicit mismatch.

**Gate:** checkpoint/resume and uninterrupted histories produce identical
results and subsequent work reports.

### Phase 6 — Semantic-protocol and compiler feasibility

1. Add incremental eligibility and delta contracts to the internal semantic
   operator protocol only for the proven grammar.
2. Teach the compiler to recognize an explicit incremental builder first.
3. Consider recognizing ordinary FP pipelines only when identity, purity,
   aggregate retraction, and result-order semantics are statically explicit.
4. Emit compiler receipts for transformed, rejected, and fallback sites.

**Gate:** compiler absence never affects runtime correctness, and unsupported
ordinary pipelines remain ordinary full computations with a reason.

### Phase 7 — Package graduation

Create `@stopcock/incremental` only if all prior gates pass. The package starts
at `0.0.0`, remains private through packed-consumer testing, and receives its
own post-2.0 release plan and Changeset.

## Test matrix

- empty, one-entity, and large keyed sources;
- duplicate, numeric, string, and bigint keys;
- predicate false/true transitions in both directions;
- unchanged and changed groups;
- group deletion and recreation;
- zero, negative, maximum-safe, and overflowing integer contributions;
- bigint contributions;
- insert/delete/replace/key-change batches;
- stale, duplicate, skipped, and out-of-order revisions;
- callback throws at every stage;
- custom aggregate law violations;
- long randomized histories checked after every update;
- checkpoint corruption and plan-hash mismatch;
- State/Diff adapter rejection of ambiguous paths and array moves;
- Node, Bun, browser, packed ESM, declaration, and tree-shaking tests.

## Performance acceptance

- A qualifying 100,000-entity single-change workload must be at least `10x`
  faster at p50 than full recomputation on both pinned Node and Bun profiles.
- A core replacement touches at most the old and new group unless the report
  explicitly identifies a changed-group recomputation.
- Initial construction may be slower than one full computation but must report
  its crossover in number of subsequent changes.
- Retained memory per entity and group is measured and documented; no aggregate
  benchmark may hide a memory regression.
- `auto` must stay with full recomputation when initialization plus retained
  memory does not amortize for the configured workload.
- Peer-library numbers are informational; release gates compare Stopcock
  incremental execution with Stopcock full recomputation.

## Graduation criteria

- The explicit pure/delta semantics are documented and distinct from exact FP
  callback semantics.
- Random change histories remain equal to full recomputation after every
  update.
- Unsupported operators and ambiguous patches fail or fall back visibly.
- Work and memory reports are deterministic and honest.
- The product claim is limited to proven keyed plan families.
- A package is not published merely because the prototype works; it must pass
  packed consumer, crossover, memory, and recovery gates.

## Rollback and stop conditions

Any phase may stop without affecting FP, State, Diff, Persistent, or the 2.0
release. If an aggregate or operator cannot satisfy its laws, remove it from
the supported grammar. If retained memory or initialization cost defeats the
measured workload, retain the explicit runtime as experimental or stop the
package. Never recover schedule by silently broadening fallback or describing
full recomputation as incremental execution.
