# Stopcock semantic operator protocol implementation plan

> **Status:** proposed internal-foundation workstream.
>
> **Canonical parent:** the FP 2.0 release order, tier topology, and rollback
> policy remain owned by
> [`2026-07-24-stopcock-v2-performance-density-superplan.md`](./2026-07-24-stopcock-v2-performance-density-superplan.md).
> This document expands its S2, S5A, S7, S9, S10, and S10X requirements. If
> the documents conflict, update the superplan before implementation rather
> than allowing two architectural truths.
>
> **Initial scope:** internal `@stopcock/fp` and `@stopcock/fp-compiler`
> infrastructure. A public third-party operator SDK is explicitly post-2.0 and
> must pass the graduation gates in this plan.

## Outcome

Create one acyclic, versioned semantic definition for every compiler-visible
Stopcock FP operator. From that definition, generate the data needed by:

- public data-first/data-last wrapper generation;
- stable operation IDs and compatibility tags;
- trusted runtime provenance;
- Plan IR construction and segmentation;
- the exact interpreter and portable lowering tables;
- compact and optimized kernel-candidate manifests;
- `@stopcock/fp-compiler` recognition and binding snapshots;
- `explain` and compiler-receipt operation names;
- law, differential, and benchmark case manifests.

The protocol does not generate correct algorithms from metadata. Every
operation still has a deliberately authored reference implementation and every
backend lowering still has deliberately authored code. The protocol makes the
semantic contract, eligibility decision, evidence identity, and generation
ownership singular and auditable.

The immediate product result is elimination of registry/compiler drift. The
long-term result is a stable vocabulary that can support multiple execution
strategies without turning Stopcock into a process-global plugin runtime.

## Why this is a workstream, not a new package

The live repository already has most of the raw ingredients:

- `packages/fp/codegen/defs/**` owns public dual-operation definitions;
- `packages/fp/src/opcodes.ts` owns numeric tags;
- `packages/fp/src/registry.ts` owns runtime `OpMeta`;
- `packages/fp/src/plan.ts` owns Plan segmentation and bindings;
- `packages/fp/src/interpret.ts` is the exact semantic implementation;
- `packages/fp-compiler/scripts/gen-ops-table.ts` snapshots a small subset of
  runtime facts;
- `packages/fp-compiler/src/ops.ts` separately classifies element, terminal,
  and boundary operations.

Creating `@stopcock/operator-protocol` now would add a package boundary before
the model is stable and would complicate the coordinated 2.0 cohort. Keep the
human-authored definitions in the existing acyclic FP code-generation layer.
Emit data-only views for runtime and compiler consumers. Revisit packaging only
after the same model has survived at least FP runtime, build-time compilation,
Compute-backed kernels, and incremental execution.

## Existing contradictions to close first

Before adding fields, freeze a contradiction ledger with a named disposition
for every current operation:

- distinguish a **stream terminator** from a **full materialization barrier**;
  the current `isMaterializationBoundary` derivation treats both sinks and
  materializers alike while Plan IR intentionally fuses sinks into a preceding
  stream;
- reconcile operations such as `sum` that are classified differently by the
  runtime registry and compiler;
- distinguish an operation changing logical domain from one merely ending a
  segment;
- distinguish public tag compatibility data from private specialization
  authority;
- identify compiler-supported operations whose actual binding layout or
  callback contract is still restated manually;
- record exact-mode eligibility separately from pure-mode rewrite permission;
- mark SIMD, worker, incremental, and backend eligibility as declarations
  until a concrete lowering and evidence record exists.

No generator migration begins until the ledger has an independently reviewed
row for every current opcode.

## Protocol model

Use three connected but separate records.

### Semantic definition

The human-authored semantic definition describes observable meaning:

```ts
interface OperatorDefinition {
  readonly protocol: "stopcock.operator";
  readonly protocolVersion: 1;
  readonly namespace: "stopcock.fp.array";
  readonly id: string;
  readonly opcode: number;
  readonly publicName: string;
  readonly inputDomain: DomainDefinition;
  readonly outputDomain: DomainDefinition;
  readonly cardinality: CardinalityDefinition;
  readonly bindings: readonly BindingDefinition[];
  readonly callbacks: readonly CallbackDefinition[];
  readonly evaluation: EvaluationDefinition;
  readonly termination: TerminationDefinition;
  readonly segmentation: SegmentationDefinition;
  readonly shape: ShapeDefinition;
  readonly ownership: OwnershipDefinition;
  readonly errors: ErrorDefinition;
  readonly eligibility: EligibilityDeclarations;
  readonly referenceImplementation: string;
  readonly evidenceRequirements: readonly string[];
}
```

Normative requirements:

- `namespace + id + protocolVersion` is the stable semantic identity. Numeric
  opcodes are generated implementation details and cannot be a cross-package
  identity by themselves.
- Domains describe logical values independently from physical array layout.
- Cardinality separates zero/one/many output behavior from statefulness and
  terminal result shape.
- Bindings describe slots, value roles, optionality, and whether a value is
  user code, a constant, or compiler-owned metadata.
- Callback definitions pin invocation arity, index/source arguments, order,
  maximum count, exception timing, and whether exact mode may elide calls.
- Termination states whether the operation may stop upstream consumption and
  which iterator-closing behavior applies.
- Segmentation has independent fields for `endsStream`,
  `requiresFullMaterialization`, `changesDomain`, and `requiresStableOrder`.
  Do not collapse these into one boundary boolean.
- Shape covers scalar/array/iterable result shape and constructor-preservation
  rules. Physical typed-array shapes belong to a backend lowering unless they
  are observable public semantics.
- Ownership describes result ownership and permitted input/output aliasing.
- Errors identify observable user-error timing. Backend implementation errors
  remain backend-specific and must not masquerade as semantic errors.
- Exact and pure semantics are explicit modes. A pure rewrite is never inferred
  merely from an operation name.
- `workerEligible`, `simdEligible`, `wasmEligible`, and
  `incrementalEligible` are declarations only. They cannot select a lowering
  without the second record and its evidence.

### Backend lowering descriptor

Each executor owns a lowering descriptor:

```ts
interface OperatorLoweringDescriptor {
  readonly semanticId: string;
  readonly semanticHash: string;
  readonly loweringAbi: string;
  readonly target: "portable" | "compact" | "optimized" | "aot" | "compute" | "incremental";
  readonly semanticMode: "exact" | "pure" | "approximate";
  readonly capability: CapabilityPredicateId;
  readonly implementation: ImplementationId;
  readonly fallback: FallbackDefinition;
  readonly evidenceId: string;
}
```

Rules:

- A descriptor references an authored implementation; it never contains an
  arbitrary executable callback or source string.
- Capability predicates are closed, versioned functions owned by the target
  backend.
- A semantic hash mismatch disables the lowering and uses the declared
  fallback.
- Exact, pure, and approximate lowerings are not interchangeable.
- Unsupported data layout, callback capture, engine, CSP policy, or package
  version must produce an explainable capability miss.
- Runtime selection consumes only trusted provenance and vetted call-local
  bindings. Public `_op`, `_fn`, `_a1`, and `_a2` fields remain diagnostic
  compatibility data.

### Conformance and evidence manifest

Evidence is generated as a separate immutable manifest containing:

- semantic definition hash;
- reference implementation hash;
- lowering implementation and generated-output hashes;
- independent fixture corpus ID;
- callback-trace and error-timing corpus ID;
- law and differential suite IDs;
- supported runtimes and tool versions;
- benchmark case IDs, not benchmark conclusions;
- release in which the evidence was produced;
- one status: `declared`, `conformant`, or `release-qualified`.

`declared` means metadata exists. `conformant` means the named semantic and
differential corpus passed locally. `release-qualified` means the packed
artifact passed the release evidence lanes on qualified runners. Do not use
`verified`, `certified`, or `proved` as synonyms.

## Generation and dependency architecture

The dependency graph must remain one-way:

```text
human-authored semantic definitions
  -> validation and canonical hashing
  -> public wrapper/opcode generation
  -> runtime data-only semantic table
  -> compiler data-only snapshot
  -> tier candidate manifests
  -> documentation/evidence case manifests
```

Constraints:

- code generation never imports root `@stopcock/fp` exports or generated
  runtime modules;
- the packed compiler never imports FP private paths;
- generated runtime tables contain no eager registration side effects;
- direct-operation bundles do not retain planner, descriptor, receipt, or
  evidence strings;
- debug names and evidence detail stay behind diagnostic subpaths;
- generation is deterministic and byte-identical on a second run;
- every generated artifact embeds the semantic protocol version and source
  hash;
- no process-global registry is introduced.

## Trusted provenance

The protocol does not weaken the 2.0 trust model:

- internal generated factories register functions in private same-package
  provenance;
- caller-created functions and public `dual(..., { op })` values remain
  generic;
- copying, mutating, deleting, or forging public tag-shaped fields never grants
  specialization;
- duplicate installed FP versions cannot share trusted bindings accidentally;
- a future cross-package bridge authenticates through an exact versioned ABI
  and returns read-only, call-local metadata;
- third-party declarations of purity, ownership, worker safety, or incremental
  laws are untrusted until the required conformance evidence is produced.

## Implementation slices

### Slice 0 — Freeze vocabulary and contradiction ledger

1. Enumerate every current opcode and compiler-recognized public symbol.
2. Record runtime category, compiler category, Plan segment behavior, callback
   contract, and current exact/pure behavior.
3. Resolve sink versus materializer terminology and all current mismatches.
4. Freeze independent fixtures for the affected semantics before changing the
   registry.

**Gate:** every current operation has exactly one reviewed semantic row and all
existing runtime/compiler discrepancies have an explicit target disposition.

### Slice 1 — Implement and validate semantic definitions

1. Add definition-only types and validation under `packages/fp/codegen/**`.
2. Move existing human-authored facts without changing runtime behavior.
3. Canonically serialize and hash every definition.
4. Reject duplicate identities/opcodes, invalid binding layouts, impossible
   domain transitions, and contradictory eligibility.

**Gate:** definitions validate without importing generated output, and their
generated compatibility snapshot matches the frozen current behavior.

### Slice 2 — Generate runtime and compiler facts

1. Generate opcodes, runtime semantic tables, binding tables, and debug names.
2. Generate the complete compiler snapshot from the same definitions.
3. Replace manual compiler category sets with generated semantic predicates.
4. Keep hand-written compiler emitters and reference implementations separate.
5. Add one command that regenerates every owned artifact twice and fails on
   drift.

**Gate:** runtime and compiler semantic hashes agree, no manual category list
remains authoritative, and packed compiler consumers need no private FP import.

### Slice 3 — Bind trusted provenance to semantic identity

1. Register generated internal functions against semantic IDs and hashes.
2. Make Plan construction resolve authority only through private provenance.
3. Preserve public tags for compatibility and diagnostics.
4. Run the complete forgery, duplicate-version, stale-hash, and binding-leak
   corpus.

**Gate:** all forgeries and incompatible versions fall back generically while
every trusted generated operator retains exact behavior.

### Slice 4 — Generate conformance case manifests

1. Map each definition to independent semantic fixtures, callback traces,
   differential tests, and required law suites.
2. Generate benchmark case declarations separately from benchmark
   implementations.
3. Produce evidence manifests with source, generator, runtime, corpus, and
   packed-artifact identities.
4. Fail closed when an eligible lowering has no evidence ID.

**Gate:** every shipped lowering points to a present, hash-matching evidence
record; missing evidence can only produce a generic fallback or stopped
candidate.

### Slice 5 — Consume the protocol in explain, receipts, and tier selection

1. Feed stable semantic IDs, names, boundaries, and capability-miss reasons to
   the compiler-receipts workstream.
2. Feed compact/optimized candidate inputs to S9/S10 without moving loop bodies
   into the protocol.
3. Test that diagnostics identify the runner actually selected.
4. Preserve the production/debug bundle split.

**Gate:** emitted receipts and runtime explanations agree on semantic and
lowering IDs while production direct/root bundles retain their byte ceilings.

### Slice 6 — Decide whether an external SDK is justified

Do not begin this slice for 2.0. After at least three internal executor families
consume the model:

1. prove a stable namespace/version negotiation model;
2. test packed single-version, duplicate-version, and independently released
   package layouts;
3. define how third parties ship reference implementations and conformance
   corpora without executing untrusted build scripts;
4. distinguish self-declared, locally conformant, and Stopcock
   release-qualified evidence in public APIs;
5. measure bundle and install cost of a public protocol package;
6. publish a separate SDK proposal and major-version compatibility policy.

**Gate:** rejecting the SDK is a valid outcome. Internal protocol success does
not require public extensibility.

## Test matrix

- every operation definition round-trips through canonical serialization;
- semantic hashes are stable across Node and Bun;
- duplicate IDs, opcodes, bindings, and invalid segment combinations fail;
- public wrapper behavior and TypeScript overloads remain unchanged;
- exact callback count/order/index/arity and thrown-error identity remain
  unchanged;
- dense holes, typed arrays, iterators, early exit, and materializers match
  independent fixtures;
- pure-mode candidates never leak into exact execution;
- unsupported or stale lowerings select the declared fallback;
- public tag forgery and mutation never authorize a lowering;
- generated output is byte-identical across two runs;
- source, built declaration, packed compiler, and clean consumer tests pass;
- direct-only and root-only bundle closures contain no protocol debug strings
  or compiler tables.

## Acceptance criteria

- One reviewed definition is authoritative for every compiler-visible FP
  operation.
- Runtime, compiler, debug, and tier manifests share the same semantic hashes.
- Sink, materializer, domain-transition, and early-termination concepts are no
  longer conflated.
- No manual compiler category list can silently drift from runtime semantics.
- Every optimization is linked to an authored lowering and named evidence.
- Generic exact fallback remains complete.
- Public tag compatibility remains, but specialization authority is private.
- Generation is acyclic, deterministic, and covered by the 2.0 reproducibility
  gate.
- No new public package or SDK is introduced during the 2.0 workstream.

## Rollback

Each slice must be independently revertible. If generated runtime/compiler
facts fail, restore the previous generated views as a unit while retaining the
contradiction ledger. If provenance fails, disable specialization for uncertain
operators and run them generically. Never restore public tag-shaped fields as
trust authority, and never keep a partially generated split-brain registry.
