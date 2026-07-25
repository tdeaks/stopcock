# Stopcock domain-derived infrastructure spike plan

> **Status:** deliberately gated prototype, not an approved public package.
>
> **Working name if graduated:** `@stopcock/domain`.
>
> **Compatibility posture:** Standard Schema remains the validation
> interoperability boundary. This spike must not turn `@stopcock/fp/schema` or
> `@stopcock/fp-interop` into an accidental competing schema runtime.

## Outcome

Test whether one small structural `Domain<A>` definition can remove meaningful
duplication across:

- runtime validation and Standard Schema output;
- lawful Eq and Hash derivation;
- field optics;
- bounded display/diagnostic rendering;
- fail-closed nested redaction.

The spike supports only:

- primitive values;
- literals;
- arrays;
- tuples;
- plain structs;
- tagged unions;
- optional/nullable fields;
- a bounded closed set of serializable scalar constraints.

Ordering, wire migrations, Diff policy, Pattern constructors, arbitrary
generation/shrinking, and external code generation are not part of the first
prototype. They become separate adapters only if real consumers demonstrate
that the core model is valuable.

The valid outcome may be “do not publish.” The spike must prove that Stopcock
offers more than another schema-builder API.

## Current repository seams

- `@stopcock/fp` already has Eq, Hash, Ord, optics, and Standard Schema helpers.
- Eq number semantics use SameValueZero and Hash normalizes `NaN` and signed
  zero consistently.
- `@stopcock/diff` uses global options rather than field-specific domain
  policy.
- `@stopcock/pattern` consumes predicates but does not own a structural
  validator AST.
- `@stopcock/fp-testing` checks supplied law cases but is not an arbitrary
  generator/shrinker.
- `@stopcock/fp-interop` explicitly delegates Standard Schema and says it does
  not define a competing schema runtime.
- TypeScript types/interfaces do not exist as runtime structure and therefore
  cannot be the derivation source.

## Decision question

Proceed beyond the spike only if at least three real consumers can delete
substantial duplicated definitions while retaining:

- explicit policy;
- predictable bundle size;
- strong TypeScript inference;
- Standard Schema interoperability;
- lawful Eq/Hash behavior;
- redaction that fails closed;
- no dependency cycle across FP, Diff, Pattern, State, or testing packages.

Consumer candidates:

1. compiler-receipt JSON records;
2. patch/transaction envelope validation and redaction;
3. validated HTTP endpoint diagnostic models;
4. theme-optimizer request/result records.

Do not invent synthetic examples merely to satisfy the consumer count.

## Explicit exclusions

- No decorator/reflection requirement.
- No TypeScript AST/code-generation tool in the initial spike.
- No class-instance, symbol-keyed, cyclic, Map, Set, function, promise, date,
  bigint-wire, binary, or branded foreign object model.
- No arbitrary transforms or effectful refinements.
- No implicit field ordering.
- No automatic Ord for structs.
- No field-specific Diff or merge behavior in core.
- No automatic arbitrary generator/shrinker.
- No versioned wire migrations.
- No inferred public/sensitive field classification.
- No claim of Zod, Effect Schema, JSON Schema, or OpenAPI API compatibility.

## Structural model

Use an immutable closed descriptor:

```ts
export interface Domain<A> {
  readonly format: "stopcock.domain"
  readonly version: 1
  readonly id: string
  readonly descriptor: DomainNode
  readonly hash: string
  readonly _A?: (_: A) => A
}

export type DomainNode =
  | { readonly kind: "string"; readonly constraints?: StringConstraints }
  | { readonly kind: "number"; readonly constraints?: NumberConstraints }
  | { readonly kind: "boolean" }
  | { readonly kind: "null" }
  | { readonly kind: "literal"; readonly value: string | number | boolean | null }
  | { readonly kind: "array"; readonly item: DomainNode; readonly min?: number; readonly max?: number }
  | { readonly kind: "tuple"; readonly items: readonly DomainNode[] }
  | { readonly kind: "struct"; readonly fields: readonly DomainField[] }
  | {
      readonly kind: "tagged-union"
      readonly tag: string
      readonly variants: readonly TaggedVariant[]
    }
  | { readonly kind: "optional"; readonly value: DomainNode }
  | { readonly kind: "nullable"; readonly value: DomainNode }
```

The descriptor is deeply frozen, validated, canonically serialized, and
hashed. Field and variant order are explicit arrays. Builder object insertion
order never silently becomes semantic order.

### Scalar constraints

The initial closed constraints are:

- string minimum/maximum UTF-16 length;
- string literal pattern source/flags after RegExp validation;
- number finite-only, integer, inclusive/exclusive minimum/maximum;
- array minimum/maximum length.

Constraints are data and run synchronously. Custom predicates/refinements are
excluded because their semantics cannot enter a data-only hash.

### Builder API

```ts
const User = Domain.struct("example.User", [
  Domain.field("id", Domain.string()),
  Domain.field("email", Domain.string(), { exposure: "sensitive" }),
  Domain.field("displayName", Domain.string(), { exposure: "public" }),
  Domain.field("role", Domain.literalUnion("admin", "member")),
])
```

Use ordered field arrays as the canonical form. An ergonomic object builder may
exist only if it sorts keys deterministically and clearly documents that order.

## Validation and Standard Schema

Derive one synchronous decoder:

```ts
export interface DomainIssue {
  readonly code: string
  readonly path: readonly (string | number)[]
  readonly message: string
}

export function decode<A>(
  domain: Domain<A>,
  input: unknown,
  options?: DecodeLimits,
): Result<A, readonly DomainIssue[]>

export function toStandardSchema<A>(domain: Domain<A>): StandardSchemaV1<unknown, A>
```

Rules:

- structs accept plain objects only;
- unknown field policy is explicit: `reject`, `strip`, or `preserve`; default
  `reject`;
- output property order follows descriptor field order;
- sparse arrays use a fixed documented dense/invalid policy;
- issue count, depth, string length, array length, and total visited nodes are
  bounded before growth;
- tagged unions read only the configured own string tag;
- no getter is invoked from an untrusted input;
- dangerous keys such as `__proto__` are treated as data or rejected according
  to explicit safe rules;
- Standard Schema output delegates to this decoder and does not change
  semantics.

## Eq and Hash derivation

Generate Eq and Hash together from the same descriptor:

```ts
export function eq<A>(domain: Domain<A>): Eq<A>
export function hash<A>(domain: Domain<A>): Hash<A>
```

Semantics:

- primitives follow existing Stopcock Eq/Hash behavior;
- numbers use SameValueZero: `NaN` equals `NaN`, and `0` equals `-0`;
- arrays compare densely and in order;
- structs compare fields in descriptor order;
- tagged unions compare tag before variant fields;
- optional and nullable variants are explicit;
- if `eq.equals(a, b)` is true, `hash.hash(a) === hash.hash(b)` must always hold;
- derivation caches are weak by Domain identity and never retain arbitrary
  values.

Do not derive Ord for a struct. Ordering requires explicit key priority,
direction, null placement, locale/collation, and variant policy. A later
`Domain.orderBy(...)` adapter may construct an Ord from caller-selected fields.

## Optics derivation

Derive only optics whose laws follow directly from structure:

- Lens for every required struct field;
- Optional for an optional field;
- Prism for every tagged-union variant;
- Traversal for array elements.

```ts
const UserOptics = Domain.optics(User)
UserOptics.displayName
UserOptics.variant.admin
```

The generated object keys follow descriptor order and are frozen. Lens/prism
laws are checked through `@stopcock/fp-testing` over explicitly supplied
domain fixtures in the spike.

## Display and diagnostics

Display is bounded and policy-driven:

```ts
export interface DisplayOptions {
  readonly maxDepth?: number
  readonly maxItems?: number
  readonly maxStringLength?: number
  readonly mode?: "compact" | "diagnostic"
}
```

- display uses descriptor field order;
- it never calls arbitrary object `toString`, getters, or custom inspection;
- sensitive/secret fields are redacted before formatting;
- truncation is explicit in output;
- display is for diagnostics, not a reversible wire codec.

## Fail-closed redaction

Every field has:

```ts
type Exposure = "public" | "sensitive" | "secret"
```

Rules:

- omitted exposure defaults to `secret`;
- `public` values may appear subject to display limits;
- `sensitive` values use a caller/domain-defined mask that never exposes the
  original by default;
- `secret` values are omitted or replaced with a constant token;
- containers recurse using child policy;
- tagged union tags are public only when explicitly marked;
- unknown fields are omitted even when decoder policy preserves them;
- redaction returns a separate JSON-safe diagnostic value, not a value cast
  back to `A`;
- errors fail closed and return a redaction error/token, never the original
  input.

## What remains explicit

The spike must demonstrate restraint:

- **Ord:** caller selects ordered projections and policies.
- **Wire codec:** validation output is not automatically a versioned wire
  format. A later adapter needs explicit version and migration policy.
- **Diff:** callers choose ignored/atomic/keyed fields. Core Domain does not
  change Diff semantics.
- **Pattern:** a later adapter may create diagnostic predicates/prisms.
- **Arbitrary testing:** generators need distributions, size, recursion, and
  shrinking policies; they are separate.
- **Display:** not serialization.
- **Redaction:** not encryption.

## Package topology for the spike

Do not immediately add a publishable `packages/domain`.

Start in a private isolated prototype location that can import public package
surfaces only. If graduation is approved:

```text
packages/domain/
  src/
    index.ts
    descriptor.ts
    builder.ts
    decode.ts
    standard-schema.ts
    eq-hash.ts
    optics.ts
    display.ts
    redact.ts
    limits.ts
    errors.ts
```

Potential dependencies:

- direct: `@stopcock/fp`;
- development only: `@stopcock/fp-testing`;
- no dependency on Diff, State, HTTP, Pattern, or Interop.

Those packages may later depend on or adapt Domain only if the repository graph
remains acyclic. `@stopcock/fp` must never depend on Domain.

## Spike phases

### Phase 0 — Consumer duplication inventory

1. Select at least three real candidate models.
2. Count current validation, Eq/Hash, optics, display, and redaction
   definitions.
3. Record requirements the closed model cannot represent.
4. Set bundle, inference, and deleted-code success measures.

**Gate:** stop if fewer than three real consumers need at least three of the
five derivations.

### Phase 1 — Descriptor and decoder

1. Implement the closed immutable AST, builders, validation, canonical hash,
   limits, and issues.
2. Implement Standard Schema output.
3. Add type inference and malicious-input tests.

**Gate:** all consumer fixture inputs decode identically to their independent
reference validators, including failures and paths.

### Phase 2 — Eq/Hash and optics

1. Derive Eq and Hash as a linked pair.
2. Derive structural optics.
3. Run Eq/Hash consistency and optic law suites over supplied fixtures.
4. Measure bundle cost per derivation.

**Gate:** Eq/Hash and optic laws pass with no handwritten consumer-specific
instance code.

### Phase 3 — Display and redaction

1. Implement bounded structural display.
2. Implement fail-closed recursive redaction.
3. Fuzz getters, prototypes, deep/numerous inputs, unknown fields, and
   redaction errors.
4. Add secret-marker leak tests.

**Gate:** no original sensitive/secret sentinel appears in any redacted or
diagnostic output.

### Phase 4 — Consumer pilots

For each real consumer:

1. implement an adapter branch without removing the independent reference;
2. compare runtime results, error paths, bundle closure, declarations, and
   code deleted;
3. record missing policy and any pressure to add opaque callbacks;
4. reject additions that turn the closed AST into an arbitrary runtime.

**Gate:** at least three pilots show a net reduction in maintained definitions
and no material regression.

### Phase 5 — Graduation decision

Publish a decision report:

- consumer-by-consumer code deleted/added;
- capability gaps;
- API inference quality;
- root and per-derivation bundle cost;
- runtime validation performance;
- law/security results;
- ecosystem overlap and maintenance cost;
- publish, continue private, or stop recommendation.

Only a publish decision creates `@stopcock/domain`, a package plan, Changeset,
documentation, and release gates.

## Test matrix

- every primitive, constraint boundary, literal, optional, nullable, array,
  tuple, struct, and tagged union;
- empty/deep/wide structures and configured limits;
- unknown fields under reject/strip/preserve;
- null prototypes, hostile prototypes, getters, proxy throws, and dangerous
  keys;
- NaN, infinities, signed zero, sparse arrays, and duplicate tags/fields;
- canonical hash stability and descriptor corruption;
- Standard Schema sync validation and issue paths;
- Eq reflexive/symmetric/transitive and Eq/Hash consistency;
- Lens, Optional, Prism, and Traversal laws;
- redaction nested in arrays/unions/optionals;
- sensitive sentinel non-leak;
- compact/diagnostic display truncation;
- TypeScript inference, declaration output, ESM, Node, Bun, browser, and
  tree-shaking tests.

## Acceptance and graduation criteria

- The descriptor stays closed, immutable, data-first, and canonically hashed.
- Validation is bounded and safe against hostile inputs.
- Standard Schema interoperability remains intact.
- Eq/Hash are law-linked and use current Stopcock primitive semantics.
- Optics satisfy their laws.
- Redaction defaults secret and fails closed.
- Ord, wire migration, Diff policy, arbitrary generation, and Pattern remain
  explicit adapters/out of scope.
- At least three real consumers delete meaningful duplicate infrastructure.
- Package/bundle and API complexity are justified by measured use.
- The graduation report can honestly recommend stopping.

## Rollback and stop conditions

The prototype is isolated and can be deleted without changing any public
package. Stop immediately if consumer pressure requires arbitrary executable
schema nodes, redaction cannot fail closed, Eq/Hash policies diverge, TypeScript
inference becomes materially worse than explicit definitions, or the bundle
cost outweighs deleted code. Do not move the experiment into
`@stopcock/fp/schema` to make it appear cheaper.
