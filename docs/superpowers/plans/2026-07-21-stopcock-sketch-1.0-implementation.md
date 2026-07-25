# @stopcock/sketch 1.0 Implementation Plan

> For agentic workers: implement this plan in order. The 1.0 package is the full bounded-memory suite described here, not a KLL-only or cardinality-only preview. Keep @stopcock/synth out of all build, test, and release work.

## Goal

Ship a production-ready `@stopcock/sketch@1.0.0` package containing mutable, bounded-memory, mergeable statistical sketches:

- KLL quantiles;
- REQ quantiles in high-rank-accuracy and low-rank-accuracy modes;
- HyperLogLog++;
- Count-Min with conservative update;
- mergeable weighted Misra-Gries heavy hitters;
- Bloom filters;
- uniform mergeable reservoir samples.

Every sketch must have deterministic seeded behavior, explicit configuration and error metadata, exact merge-compatibility checks, clone/reset support, retained-memory reporting, a stable tagged hashing contract, and a versioned corruption-detecting binary format. The package must work in Bun, Node, and modern browsers without native or runtime third-party dependencies.

## Architecture

Use four one-way layers:

1. Common primitives: validation, deterministic PRNG, tagged key encoding, stable hashing, binary reader/writer, CRC32, error classes, limits, and compatibility checks.
2. Algorithm cores: one isolated internal module per sketch with no public serialization assumptions.
3. Public mutable wrappers: factories and interfaces that validate once, mutate in place, return the receiver, expose readonly metadata, and defend merge atomicity.
4. Wire format and registry: stable envelope, kind-specific payload codecs, migrations, custom key/value codecs, and decode limits.

The public wrappers may expose algorithm-specific queries, but they must share consistent lifecycle, merge, and serialization behavior. No algorithm may reach ambient randomness, locale, object identity, object property traversal, or runtime-dependent hashing.

## Toolchain and Repository Conventions

- TypeScript 7, strict mode, ESM-only.
- Bun for scripts and workspace orchestration.
- Vitest for runtime, property, statistical, and declaration tests.
- tsup plus tsc --emitDeclarationOnly.
- sideEffects: false and explicit package exports.
- Exact @stopcock/fp dependency version, matching repository conventions.
- No runtime dependency on a sketch, hash, PRNG, compression, or serialization library.
- Keep version 0.0.0 and private true until every release gate passes; then remove private and add a major Changeset.

## Package Exports

Create:

- @stopcock/sketch: all factories, public interfaces, common metadata, codecs, errors, and decodeSketch.
- @stopcock/sketch/kll: KLL-only import.
- @stopcock/sketch/req: REQ-only import.
- @stopcock/sketch/hll: HyperLogLog++-only import.
- @stopcock/sketch/count-min: Count-Min-only import.
- @stopcock/sketch/heavy-hitters: weighted Misra-Gries-only import.
- @stopcock/sketch/bloom: Bloom-only import.
- @stopcock/sketch/reservoir: reservoir-only import.
- @stopcock/sketch/hash: stable tagged encoders, codecs, and hash helpers.
- @stopcock/sketch/binary: envelope inspection and registry APIs.

Each algorithm subpath imports only its shared primitives. Importing one sketch must not initialize or bundle every other implementation.

## Shared Public Contract

~~~ts
export type SketchKind =
  | "kll"
  | "req"
  | "hllpp"
  | "count_min"
  | "weighted_misra_gries"
  | "bloom"
  | "reservoir";

export interface SketchVersion {
  readonly envelopeMajor: 1;
  readonly envelopeMinor: number;
  readonly algorithmMajor: number;
  readonly algorithmMinor: number;
}

export interface SketchErrorMetadata {
  readonly algorithm: SketchKind;
  readonly confidence?: number;
  readonly relativeStandardError?: number;
  readonly normalizedRankError?: number;
  readonly epsilon?: number;
  readonly delta?: number;
  readonly falsePositiveRate?: number;
  readonly maximumAbsoluteFrequencyError?: number;
  readonly notes: readonly string[];
}

export interface SketchMetadata<C> {
  readonly kind: SketchKind;
  readonly config: Readonly<C>;
  readonly count: bigint;
  readonly retainedItems: number;
  readonly retainedBytes: number;
  readonly error: SketchErrorMetadata;
  readonly version: SketchVersion;
}

export interface MutableSketch<TValue, TConfig, TSelf> extends SketchMetadata<TConfig> {
  add(value: TValue): TSelf;
  update(value: TValue): TSelf;
  addAll(values: Iterable<TValue>): TSelf;
  mergeInto(source: Readonly<TSelf>): TSelf;
  clone(): TSelf;
  reset(): TSelf;
  toBytes(options?: EncodeSketchOptions): Uint8Array;
}

export interface DecodeSketchOptions {
  readonly maxBytes?: number;
  readonly maxRetainedItems?: number;
  readonly codecs?: CodecRegistry;
  readonly allowEnvelopeMinor?: readonly number[];
}

export function decodeSketch(
  bytes: Uint8Array,
  options?: DecodeSketchOptions,
): AnySketch;

export function inspectSketch(
  bytes: Uint8Array,
  options?: Pick<DecodeSketchOptions, "maxBytes">,
): SerializedSketchMetadata;
~~~

For every implementation:

- add mutates one observation and returns the exact receiver.
- update is an exact alias of add, provided for terminology compatibility.
- addAll applies observations in iterator order and returns the receiver.
- mergeInto means merge the source state into the receiver; it validates all compatibility and overflow conditions before mutation and returns the exact receiver.
- clone returns a deep, independently mutable copy with the same PRNG and algorithm state.
- reset empties observations and restores the initial seeded state while retaining the immutable configuration.
- toBytes never mutates the sketch, even if canonical ordering requires sorting copied state.

If an iterator supplied to addAll throws, successfully consumed observations remain applied. If any individual observation is invalid, that observation does not mutate state, but prior observations remain. mergeInto is atomic: any compatibility, limit, codec, or count error leaves the receiver byte-for-byte unchanged.

Self-merge is rejected for every sketch with SketchCompatibilityError code SELF_MERGE. This uniform rule prevents accidental double counting even for mathematically idempotent structures such as Bloom and HLL registers.

## Stable Tagged Key Encoding and Hashing

The built-in key domain is deliberately closed:

~~~ts
export type SketchKey = string | number | bigint | Uint8Array;

export interface KeyEncoder<T> {
  readonly id: string;
  readonly version: number;
  encode(value: T): Uint8Array;
}

export interface KeyCodec<T> extends KeyEncoder<T> {
  decode(bytes: Uint8Array): T;
}

export interface CodecRegistry {
  registerKey<T>(codec: KeyCodec<T>): void;
  registerValue<T>(codec: ValueCodec<T>): void;
  key(id: string, version: number): KeyCodec<unknown> | undefined;
  value(id: string, version: number): ValueCodec<unknown> | undefined;
}

export interface Hash64 {
  readonly low: number;
  readonly high: number;
}

export interface Hash128 {
  readonly low: Hash64;
  readonly high: Hash64;
}

export function encodeSketchKey(value: SketchKey): Uint8Array;
export function hashSketchKey(value: SketchKey, seed?: bigint): Hash128;
export function hashEncodedKey(bytes: Uint8Array, seed?: bigint): Hash128;
~~~

Use one normative tagged byte encoding:

- 0x01 string: unsigned LEB128 byte length followed by UTF-8 of the USVString conversion; lone UTF-16 surrogates therefore become U+FFFD consistently.
- 0x02 number: eight little-endian IEEE 754 binary64 bytes; all NaNs canonicalize to quiet NaN 0x7ff8000000000000 and negative zero canonicalizes to positive zero.
- 0x03 bigint: sign byte, unsigned LEB128 magnitude-byte length, then minimal little-endian magnitude; zero has positive sign and zero magnitude bytes.
- 0x04 binary: unsigned LEB128 byte length followed by exact bytes.

Tags are part of the hash domain, so the string "1", number 1, bigint 1, and byte 0x31 never alias by construction. Built-in encoding rejects values outside SketchKey. Arbitrary objects require an explicit KeyEncoder with a non-empty reverse-DNS-style id and positive integer version. Algorithms that must serialize and return original values, weighted Misra-Gries and generic reservoir, require a reversible KeyCodec or ValueCodec.

Implement MurmurHash3 x64 128 as the normative hash, using two uint32 lanes per 64-bit word so output does not depend on BigInt performance or engine arithmetic. Specify every rotate, multiply, endian load, tail case, seed expansion, and avalanche in packages/sketch/docs/hash-format.md. Export only unsigned lane values. Golden vectors must cover empty input, every tail length, long input, every built-in tag, NaNs, infinities, signed zero, bigint signs, non-ASCII strings, lone surrogates, and binary views with non-zero byte offsets.

The 64-bit seed is normalized modulo 2^64 and stored in every hash-based sketch. HLL++ uses the low 64 bits. Bloom and Count-Min derive independent probes from both 64-bit halves by double hashing plus a fixed non-zero odd lane mix. Heavy hitters use the hash only for indexing and deterministic tie order; full encoded-key equality resolves collisions.

## Deterministic PRNG

Implement xoshiro128** with four uint32 state words. Expand the 64-bit public seed through a specified SplitMix64 lane implementation. A zero internal state is forbidden and deterministically repaired.

Expose no ambient-random default. Every factory defaults to the documented seed 0n, which makes examples, tests, merges, and serialized fixtures reproducible. Users who want nondeterminism must supply a seed.

Provide internal helpers:

- nextUint32;
- nextUint53 with exactly 53 uniformly distributed bits;
- unbiased integerBelow for number and bigint bounds using rejection sampling;
- nextBoolean;
- hypergeometricSample for reservoir merges.

No modulo reduction is permitted when it introduces bias. Clone and serialization preserve the full PRNG state. Reset restores the state derived from the configured seed.

## KLL Public Contract

~~~ts
export interface KllConfig {
  readonly k: number;
  readonly seed?: bigint;
}

export interface KllSketch
  extends MutableSketch<number, Required<KllConfig>, KllSketch> {
  readonly min: number | undefined;
  readonly max: number | undefined;
  rank(value: number, inclusive?: boolean): number;
  quantile(rank: number): number | undefined;
  quantiles(ranks: readonly number[]): readonly (number | undefined)[];
  cdf(splitPoints: readonly number[]): readonly number[];
  pmf(splitPoints: readonly number[]): readonly number[];
  rankBounds(rank: number, confidence?: 0.95 | 0.99): readonly [number, number];
}

export function createKll(options?: Partial<KllConfig>): KllSketch;
~~~

Validate even integer k in the supported range 8 through 65,536; default 200. Reject NaN and both infinities before mutation. Preserve exact finite min and max separately from retained levels.

KLL internal state:

- total count as unsigned 64-bit bigint with overflow rejection;
- min and max;
- xoshiro state;
- unsorted level zero buffer;
- sorted Float64Array-compatible buffers for levels 1 and above;
- per-level retained lengths and capacities;
- total compaction count.

Use lazy KLL compaction:

1. Append to level zero.
2. Compact only when total retained items exceed the capacity schedule.
3. Compute level capacity as max(8, ceil(k times (2/3) raised to depth-from-top)), with the top level receiving k capacity.
4. Select the lowest over-capacity level.
5. Sort only that level if needed.
6. Preserve one unpaired boundary item when the count is odd.
7. Choose even or odd survivors from the paired range using one PRNG bit.
8. Promote survivors to the next level and merge sorted buffers.
9. Repeat until every level fits.

Each level-h item has weight 2^h. Rank, quantile, CDF, and PMF queries construct or reuse an immutable sorted weighted view and never compact or advance PRNG state. Cache that view by a mutation generation counter.

Merging validates k and seed, concatenates corresponding levels, adds counts, min/max, and compaction metadata, combines PRNG state using the specified commutative seed/count mixer, and runs the same lazy capacity repair. KLL merge output need not be byte-identical across partition trees, but every tree must satisfy the same rank-error characterization and deterministic result for the same tree and input order.

Document and implement normalized rank error from the KLL bound used by the exact capacity schedule. rankBounds clamps to [0, 1] and identifies whether it is a theoretical or empirically characterized bound; do not label a heuristic interval as guaranteed.

## REQ Public Contract

~~~ts
export type ReqMode = "hra" | "lra";

export interface ReqConfig {
  readonly k: number;
  readonly mode: ReqMode;
  readonly seed?: bigint;
}

export interface ReqSketch
  extends MutableSketch<number, Required<ReqConfig>, ReqSketch> {
  readonly min: number | undefined;
  readonly max: number | undefined;
  rank(value: number, inclusive?: boolean): number;
  quantile(rank: number): number | undefined;
  quantiles(ranks: readonly number[]): readonly (number | undefined)[];
  cdf(splitPoints: readonly number[]): readonly number[];
  pmf(splitPoints: readonly number[]): readonly number[];
  relativeRankError(rank: number, confidence?: 0.95 | 0.99): number;
  rankBounds(rank: number, confidence?: 0.95 | 0.99): readonly [number, number];
}

export function createReq(options?: Partial<ReqConfig>): ReqSketch;
~~~

Default k is 12 and mode is hra. Validate even integer k from 4 through 1,024. Reject non-finite observations.

Implement the Relative Error Quantiles compactor from the published REQ algorithm, not a renamed KLL:

- one sorted compactor per level with implicit weight 2^level;
- a protected accurate tail: high values for hra and low values for lra;
- geometrically arranged sections on the opposite side of the protected tail;
- per-level compaction counters that determine which section is compacted;
- section growth when the counter crosses the algorithm's power-of-two schedule;
- random even/odd promotion within the selected section;
- anti-correlated compaction parity across consecutive compatible compactions;
- exact min/max retention;
- lazy repair after updates and merges.

Place the capacity, section-selection, section-growth, and error-bound formulae in named pure functions with citations to the REQ paper and explanatory comments. Do not approximate section selection through KLL capacities. Pin paper examples and an independent Apache DataSketches-generated characterization corpus as test fixtures, but do not require byte compatibility with another library.

In hra mode, relative error metadata and tests focus on ranks approaching 1; in lra mode they focus on ranks approaching 0. Central ranks still receive a documented normalized-rank estimate. Merges require exact k, mode, seed, and algorithm major compatibility. As with KLL, different merge trees may retain different values, but seeded behavior is deterministic for a fixed tree and every tree must meet the same relative-tail error envelope.

## HyperLogLog++ Public Contract

~~~ts
export interface HllConfig<T> {
  readonly precision: number;
  readonly seed?: bigint;
  readonly encoder?: KeyEncoder<T>;
}

export interface HllSketch<T = SketchKey>
  extends MutableSketch<T, Required<Omit<HllConfig<T>, "encoder">> & {
    readonly encoderId: string;
    readonly encoderVersion: number;
  }, HllSketch<T>> {
  readonly representation: "sparse" | "dense";
  estimate(): number;
  bounds(confidence?: 0.95 | 0.99): readonly [number, number];
}

export function createHll(
  options?: Partial<HllConfig<SketchKey>>,
): HllSketch<SketchKey>;

export function createHll<T>(
  options: HllConfig<T> & { readonly encoder: KeyEncoder<T> },
): HllSketch<T>;
~~~

Validate precision p from 4 through 18; default 14. Use m = 2^p dense registers and 25-bit sparse precision. State starts as a sorted/deduplicated sparse coupon buffer and converts one way to dense when canonical sparse bytes meet or exceed dense register bytes.

HLL++ update:

1. Hash the tagged/encoded key to 64 bits.
2. In sparse mode, encode the 25-bit prefix and remaining leading-zero rank exactly as specified by the HLL++ sparse representation; buffer coupons, sort/deduplicate in bounded batches, and merge into the canonical sparse array.
3. In dense mode, use the first p bits as register index and set the register to max(current, rho of remaining bits), capped to the representable rank.
4. Increment observation count even when the register does not change.

Use Uint8Array dense registers for clear, bounded, cross-runtime state; compact 6-bit packing is a post-1.0 optimization unless benchmarks justify it without complicating correctness.

Estimate using the HLL++ pipeline:

- exact sparse linear counting while sparse;
- raw harmonic estimate in dense mode;
- pinned empirical bias correction tables for p 4 through 18 using nearest-neighbor interpolation;
- per-precision small-range threshold table and linear counting when zero registers remain and the threshold selects it;
- large-range correction only within the hash-width domain and with finite-result guards.

Check the bias and threshold tables into source with a generator script, provenance, SHA-256, and golden values. The runtime never fetches tables.

Merge validates p, seed, encoder id/version, hash version, and algorithm major. Sparse plus sparse performs sorted union; otherwise convert receiver to dense and register-wise max the source. HLL register state is merge-associative and merge-commutative; estimate and serialized canonical body must match across partition orders once both sides are canonicalized.

## Count-Min Public Contract

~~~ts
export interface CountMinConfig<T> {
  readonly epsilon: number;
  readonly delta: number;
  readonly seed?: bigint;
  readonly encoder?: KeyEncoder<T>;
}

export interface CountMinUpdate<T> {
  readonly value: T;
  readonly count?: bigint;
}

export interface CountMinSketch<T = SketchKey>
  extends MutableSketch<CountMinUpdate<T>, CountMinResolvedConfig, CountMinSketch<T>> {
  add(value: CountMinUpdate<T> | T): this;
  update(value: T, count?: bigint): this;
  estimate(value: T): bigint;
  bounds(value: T): {
    readonly lower: bigint;
    readonly estimate: bigint;
    readonly upper: bigint;
  };
}

export function createCountMin(
  options: Partial<CountMinConfig<SketchKey>>,
): CountMinSketch<SketchKey>;

export function createCountMin<T>(
  options: CountMinConfig<T> & { readonly encoder: KeyEncoder<T> },
): CountMinSketch<T>;
~~~

Validate 0 < epsilon < 1 and 0 < delta < 1. Derive width = ceil(e / epsilon) and depth = ceil(ln(1 / delta)); validate the resulting allocation before constructing. Store unsigned 64-bit counters in BigUint64Array when supported and an equivalent checked pair-of-uint32 representation otherwise.

Each row uses a seed derived from the shared 128-bit hash by an odd lane mix; derive indexes by unbiased high-multiply rather than simple modulo. Conservative update reads all selected cells, finds their minimum, and raises only cells equal to that minimum by count. Addition is checked against 2^64 - 1 before any cell mutates. The default count is 1n; zero and negative counts are rejected.

estimate is the minimum selected cell. A Count-Min sketch never underestimates in the no-overflow model. bounds returns lower 0n, the estimate, and estimate; error metadata reports epsilon times total inserted weight as the maximum additive overestimate with probability at least 1 - delta.

Merge requires identical width, depth, epsilon, delta, seed, encoder, hash version, and counter representation semantics. Preflight every cell addition, then add element-wise atomically. Conservative-update histories are mergeable by counter addition, though a merged state need not equal a single conservative-update insertion order cell-for-cell; its error guarantee remains valid.

## Weighted Misra-Gries Public Contract

~~~ts
export interface HeavyHittersConfig<T> {
  readonly capacity: number;
  readonly seed?: bigint;
  readonly codec?: KeyCodec<T>;
}

export interface WeightedItem<T> {
  readonly value: T;
  readonly weight: number;
}

export interface HeavyHitter<T> {
  readonly value: T;
  readonly lowerBound: number;
  readonly upperBound: number;
  readonly estimatedWeight: number;
}

export interface HeavyHittersSketch<T = SketchKey>
  extends MutableSketch<WeightedItem<T>, HeavyHittersResolvedConfig, HeavyHittersSketch<T>> {
  add(value: WeightedItem<T> | T): this;
  update(value: T, weight?: number): this;
  estimate(value: T): HeavyHitter<T> | undefined;
  heavyHitters(threshold?: number): readonly HeavyHitter<T>[];
}

export function createHeavyHitters(
  options: Partial<HeavyHittersConfig<SketchKey>>,
): HeavyHittersSketch<SketchKey>;

export function createHeavyHitters<T>(
  options: HeavyHittersConfig<T> & { readonly codec: KeyCodec<T> },
): HeavyHittersSketch<T>;
~~~

Validate integer capacity from 2 through the configured retained-item limit. Weights must be finite and greater than zero; the total must remain finite. Built-in SketchKey values use the built-in reversible codec. Custom values require a codec because retained candidates must survive serialization.

Implement weighted Misra-Gries with a map, min-heap, and lazy global decrement:

- each candidate stores canonical encoded key bytes, original value, raw counter, heap generation, and stable 128-bit hash;
- logical counter is raw counter minus the global decrement offset;
- an existing key increases its raw counter by weight;
- a new key enters immediately when fewer than capacity candidates exist;
- when full, increase the global offset by min(remaining weight, minimum logical counter), remove every zero candidate, add that amount to totalDecrement, and continue with residual weight;
- full encoded-key equality resolves hash collisions;
- heap ties use hash lanes and then lexicographic encoded bytes, making mutation deterministic.

The retained logical counter is a lower bound. A conservative upper bound is lowerBound + totalDecrement. estimatedWeight is the midpoint only for display; callers choosing correctness use the bounds. heavyHitters returns candidates whose upper bound meets threshold, sorted by descending lower bound, descending upper bound, then canonical key order.

Merge validates capacity, seed, codec id/version, hash version, and algorithm major. Preflight total weight. Combine both candidate streams in canonical key order using their logical lower counters, start the receiver error budget at source.totalDecrement + receiver.totalDecrement, and run the same weighted reduction for any additional pruning. The merged upper bound must cover exact counts for arbitrary partition trees. Characterization tests must prove every item above totalWeight / (capacity + 1) is retained as a candidate.

## Bloom Public Contract

~~~ts
export interface BloomConfig<T> {
  readonly expectedItems: number;
  readonly falsePositiveRate: number;
  readonly seed?: bigint;
  readonly encoder?: KeyEncoder<T>;
}

export interface BloomFilter<T = SketchKey>
  extends MutableSketch<T, BloomResolvedConfig, BloomFilter<T>> {
  has(value: T): boolean;
  expectedFalsePositiveRate(): number;
  unionInto(source: Readonly<BloomFilter<T>>): this;
  intersectionInto(source: Readonly<BloomFilter<T>>): this;
}

export function createBloom(
  options: BloomConfig<SketchKey>,
): BloomFilter<SketchKey>;

export function createBloom<T>(
  options: BloomConfig<T> & { readonly encoder: KeyEncoder<T> },
): BloomFilter<T>;
~~~

Derive bit count m = ceil(-n ln(p) / (ln 2)^2), round up to a 64-bit word boundary, and hash count k = max(1, round((m / n) ln 2)). Reject configurations exceeding allocation or hash-count limits.

Use BigUint64Array when available and a Uint32Array-compatible fallback with identical little-endian serialization. Derive k bit positions using enhanced double hashing from the 128-bit hash; every result is reduced with high-multiply. add sets bits and increments observation count. has checks every bit.

mergeInto and unionInto are identical bitwise OR operations after exact compatibility validation. intersectionInto performs bitwise AND, sets count to an explicitly unknown state in metadata, and remains queryable/serializable; expectedFalsePositiveRate then derives from bit occupancy rather than inserted count. Counting Bloom filters, deletion, scalable Bloom filters, and automatic resize are not in 1.0.

No false negatives are permitted under compatible use. Statistical tests measure observed false-positive rate against the configured envelope over multiple seeds and occupancies.

## Reservoir Public Contract

~~~ts
export interface ValueCodec<T> {
  readonly id: string;
  readonly version: number;
  encode(value: T): Uint8Array;
  decode(bytes: Uint8Array): T;
}

export interface ReservoirConfig<T> {
  readonly size: number;
  readonly seed?: bigint;
  readonly codec?: ValueCodec<T>;
}

export interface ReservoirSketch<T = number>
  extends MutableSketch<T, ReservoirResolvedConfig, ReservoirSketch<T>> {
  readonly sample: readonly T[];
  sampleCopy(): T[];
}

export function createReservoir(
  options: Partial<ReservoirConfig<number>>,
): ReservoirSketch<number>;

export function createReservoir<T>(
  options: ReservoirConfig<T> & { readonly codec: ValueCodec<T> },
): ReservoirSketch<T>;
~~~

Default to the built-in canonical number codec. Validate integer size from 1 through the configured retained-item limit. Generic values require an explicit stable ValueCodec. The public sample view is readonly and must not expose the mutable backing array.

Sequential updates use Algorithm R:

1. Fill the first size slots.
2. For observation count n greater than size, draw an unbiased integer j in [0, n).
3. Replace slot j when j is less than size.

Use bigint count and bigint rejection sampling so the selection remains unbiased beyond 2^32 observations. Reject count overflow above unsigned 64-bit maximum.

Merge two reservoirs exactly:

1. Validate size, seed, codec id/version, algorithm major, and count sum.
2. If total observations fit, concatenate exact retained items in stream order.
3. Otherwise draw x from Hypergeometric(total, leftCount, size), bounded by available sample sizes.
4. Select x items uniformly without replacement from the receiver sample and size - x from the source sample using partial Fisher-Yates driven by the receiver merge PRNG.
5. Canonically shuffle the combined slots with that PRNG and commit atomically.

This produces a uniform sample of the logical union when each input reservoir is uniform. Fixed merge trees are deterministic; different partition trees need not select identical values but must pass the same inclusion-probability and chi-square characterizations. Repeated source items are observations, not a set, and preserve multiplicity.

## Binary Format

All sketches use one little-endian envelope:

| Offset | Width | Field |
|---:|---:|---|
| 0 | 4 | ASCII SKCH |
| 4 | 1 | envelope major, initially 1 |
| 5 | 1 | envelope minor |
| 6 | 1 | sketch kind id |
| 7 | 1 | flags |
| 8 | 2 | header byte length |
| 10 | 8 | body byte length as uint64 |
| 18 | 4 | CRC32 of header plus body |
| 22 | header length | canonical tagged header |
| following | body length | kind-specific body |

Trailing bytes are rejected. Header and body length must exactly consume the input and must pass maxBytes, safe-integer, retained-item, and algorithm-specific allocation checks before allocation or iteration.

The canonical header contains:

- algorithm major/minor;
- hash-format version where applicable;
- seed and current PRNG state where applicable;
- exact resolved configuration;
- observation count and total weight where applicable;
- encoder or codec id/version;
- representation flags;
- kind-specific retained count and body-layout version.

Use a small canonical TLV scheme with ascending numeric tags, unsigned LEB128 lengths, fixed little-endian numeric payloads, UTF-8 identifiers, duplicate-tag rejection, and explicit required/optional tags. Unknown optional tags are skipped and preserved only by inspection; unknown required tags fail.

Kind bodies:

- KLL: min/max bits, compaction metadata, level count, each level length and exact float64 bits.
- REQ: min/max bits, compactor counters/sections/parities, per-level lengths and exact float64 bits.
- HLL++: canonical sorted sparse coupons or dense register bytes.
- Count-Min: row-major uint64 cells.
- weighted Misra-Gries: global decrement, total weight, canonical-key-sorted candidates with key bytes, codec bytes, and logical counters.
- Bloom: bit words in little-endian order plus known/unknown count state.
- Reservoir: sample slots in order, length-prefixed codec bytes, count, and PRNG state.

CRC32 uses the IEEE polynomial and covers the exact serialized header and body. Decode validates checksum before algorithm allocation. Encoding is deterministic for the same complete state. Maps and candidate sets serialize in canonical order. Floating values preserve exact bits except the tagged hash input normalization does not alter stored sketch values.

Envelope major changes only for incompatible framing. Algorithm major changes for state/semantic incompatibility. Within package major 1, decoders must read every previously released envelope minor and algorithm minor, using checked migrations and checked-in golden fixtures. Writers emit only the latest format. A future package major may intentionally drop old formats with a migration utility.

## Decode and Compatibility Failures

Define public stable-code errors:

- SketchConfigError: invalid k, precision, epsilon, delta, capacity, expected count, false-positive rate, reservoir size, seed, codec metadata, or allocation.
- SketchValueError: invalid observation, weight, rank, split point, or query.
- SketchCompatibilityError: kind, algorithm, configuration, seed, hash version, mode, encoder, codec, or self-merge mismatch.
- SketchOverflowError: count, weight, counter, size, or serialized-length overflow.
- SketchDecodeError: magic, version, kind, length, TLV, checksum, body, invariant, trailing-data, or allocation failure.
- UnknownSketchCodecError: required custom encoder/codec is unavailable.

Every error has a stable code and structured context. Never include arbitrary decoded object contents or entire byte payloads in messages.

Decode is fail-closed:

- validate magic, versions, kind, lengths, checksum, and header first;
- resolve required codecs before state construction;
- check multiplication/addition overflow for all capacities and lengths;
- enforce exact per-algorithm invariants;
- build into a private temporary state;
- publish a sketch only after full validation;
- never return a partially usable or semantically suspended custom-value sketch.

## Memory and Error Metadata

retainedBytes is a deterministic lower-level metric: sum of owned ArrayBuffer byte lengths plus retained encoded-key/value byte lengths. It excludes JavaScript object/header overhead and shared immutable tables. Document this limitation. retainedItems has an algorithm-specific definition and is included in serialization inspection.

config returns a frozen resolved copy. error returns frozen metadata and distinguishes:

- theoretical deterministic guarantees;
- probabilistic confidence bounds;
- empirical bias correction;
- observed occupancy estimates;
- modes where only a conservative bound is available.

Never describe RSE as a hard bound or an empirical interval as a theorem. Each README algorithm section must give the mathematical meaning and assumptions behind every field.

## Implementation Tasks

### Task 1: Scaffold the Private Package

**Files**

- Create packages/sketch/package.json
- Create packages/sketch/tsconfig.json
- Create packages/sketch/tsup.config.ts
- Create packages/sketch/src/index.ts
- Create packages/sketch/src/kll.ts
- Create packages/sketch/src/req.ts
- Create packages/sketch/src/hll.ts
- Create packages/sketch/src/count-min.ts
- Create packages/sketch/src/heavy-hitters.ts
- Create packages/sketch/src/bloom.ts
- Create packages/sketch/src/reservoir.ts
- Create packages/sketch/src/hash.ts
- Create packages/sketch/src/binary.ts

**Steps**

1. Mirror current ESM, scripts, declaration, sideEffects, and export-map conventions.
2. Set version 0.0.0 and private true.
3. Add exact @stopcock/fp dependency only if actual implementation imports it.
4. Add clean Bun and Node subpath-import tests.
5. Confirm each algorithm subpath tree-shakes independently.

### Task 2: Implement Shared Validation, Errors, Limits, and Metadata

**Files**

- Create packages/sketch/src/internal/errors.ts
- Create packages/sketch/src/internal/limits.ts
- Create packages/sketch/src/internal/config.ts
- Create packages/sketch/src/internal/metadata.ts
- Create packages/sketch/src/__tests__/config.test.ts
- Create packages/sketch/src/__tests__/public-api.test-d.ts

**Steps**

1. Implement checked number, bigint, allocation, and multiplication helpers.
2. Implement frozen resolved configs and metadata.
3. Implement stable error classes/codes.
4. Add boundary and invalid-configuration tests for every factory.

### Task 3: Implement Tagged Encoding, Codecs, and Stable Hashing

**Files**

- Create packages/sketch/src/internal/key/tagged.ts
- Create packages/sketch/src/internal/key/codecs.ts
- Create packages/sketch/src/internal/hash/murmur3-x64-128.ts
- Create packages/sketch/src/internal/hash/lanes.ts
- Create packages/sketch/src/internal/hash/probes.ts
- Create packages/sketch/src/__tests__/hash.test.ts
- Create packages/sketch/fixtures/hash-v1.json
- Create packages/sketch/docs/hash-format.md

**Steps**

1. Implement the normative tagged encoding and custom encoder validation.
2. Implement reversible built-in key and number value codecs.
3. Implement lane arithmetic and MurmurHash3 without runtime-dependent integer behavior.
4. Pin cross-runtime golden vectors.
5. Test collision resolution paths with an injected constant hash in internal tests.

### Task 4: Implement PRNG and Unbiased Sampling Helpers

**Files**

- Create packages/sketch/src/internal/random/xoshiro128ss.ts
- Create packages/sketch/src/internal/random/splitmix64.ts
- Create packages/sketch/src/internal/random/uniform.ts
- Create packages/sketch/src/internal/random/hypergeometric.ts
- Create packages/sketch/src/__tests__/random.test.ts

**Steps**

1. Implement clone/reset/serialize-safe state.
2. Pin published xoshiro and SplitMix vectors.
3. Exhaustively test small integer bounds for uniformity and rejection edge cases.
4. Validate hypergeometric support, symmetry, expectation, and seeded distributions.

### Task 5: Implement the Binary Envelope and Registry

**Files**

- Create packages/sketch/src/internal/binary/reader.ts
- Create packages/sketch/src/internal/binary/writer.ts
- Create packages/sketch/src/internal/binary/leb128.ts
- Create packages/sketch/src/internal/binary/tlv.ts
- Create packages/sketch/src/internal/binary/crc32.ts
- Create packages/sketch/src/internal/binary/envelope.ts
- Create packages/sketch/src/internal/binary/registry.ts
- Create packages/sketch/src/__tests__/binary.test.ts

**Steps**

1. Implement bounded readers and checked writers.
2. Implement canonical TLV ordering, required tags, exact length consumption, and CRC.
3. Implement inspectSketch without constructing algorithm state.
4. Fuzz truncation, corrupt lengths, duplicate tags, unknown versions/kinds, checksum errors, and allocation bombs.

### Task 6: Implement KLL

**Files**

- Create packages/sketch/src/internal/kll/state.ts
- Create packages/sketch/src/internal/kll/capacity.ts
- Create packages/sketch/src/internal/kll/compact.ts
- Create packages/sketch/src/internal/kll/query.ts
- Create packages/sketch/src/internal/kll/merge.ts
- Create packages/sketch/src/internal/kll/codec.ts
- Create packages/sketch/src/__tests__/kll.test.ts
- Create packages/sketch/src/__tests__/kll.statistics.test.ts

**Steps**

1. Implement lazy levels, compaction, weighted queries, cache invalidation, min/max, clone, and reset.
2. Implement atomic compatibility-checked merging.
3. Implement versioned body encode/decode and invariant validation.
4. Compare small streams exhaustively to exact sorted ranks.
5. Characterize rank error across uniform, Gaussian, sorted, reverse, duplicate-heavy, and adversarial distributions.

### Task 7: Implement REQ HRA and LRA

**Files**

- Create packages/sketch/src/internal/req/state.ts
- Create packages/sketch/src/internal/req/sections.ts
- Create packages/sketch/src/internal/req/compact.ts
- Create packages/sketch/src/internal/req/query.ts
- Create packages/sketch/src/internal/req/error.ts
- Create packages/sketch/src/internal/req/merge.ts
- Create packages/sketch/src/internal/req/codec.ts
- Create packages/sketch/src/__tests__/req.test.ts
- Create packages/sketch/src/__tests__/req.statistics.test.ts
- Create packages/sketch/fixtures/req-characterization/*

**Steps**

1. Translate the published section and compaction schedules into named pure functions.
2. Implement protected-tail behavior for both modes and anti-correlated parity.
3. Implement queries, error metadata, clone/reset, atomic merge, and binary state.
4. Pin independent reference quantiles and rank-characterization fixtures.
5. Prove HRA improvement near rank 1 and LRA improvement near rank 0 across several orders of magnitude.

### Task 8: Implement HyperLogLog++

**Files**

- Create packages/sketch/src/internal/hll/sparse.ts
- Create packages/sketch/src/internal/hll/dense.ts
- Create packages/sketch/src/internal/hll/estimate.ts
- Create packages/sketch/src/internal/hll/bias-tables.ts
- Create packages/sketch/src/internal/hll/merge.ts
- Create packages/sketch/src/internal/hll/codec.ts
- Create packages/sketch/scripts/generate-hll-tables.ts
- Create packages/sketch/fixtures/hll-tables.json
- Create packages/sketch/src/__tests__/hll.test.ts
- Create packages/sketch/src/__tests__/hll.statistics.test.ts

**Steps**

1. Implement sparse coupons, canonicalization, and threshold-based dense conversion.
2. Implement dense register updates and complete HLL++ estimate correction.
3. Check in table provenance and generator hashes.
4. Implement canonical associative merges and binary states.
5. Characterize bias/RSE for every precision and sparse/dense transition region.

### Task 9: Implement Conservative Count-Min

**Files**

- Create packages/sketch/src/internal/count-min/state.ts
- Create packages/sketch/src/internal/count-min/update.ts
- Create packages/sketch/src/internal/count-min/counters.ts
- Create packages/sketch/src/internal/count-min/merge.ts
- Create packages/sketch/src/internal/count-min/codec.ts
- Create packages/sketch/src/__tests__/count-min.test.ts

**Steps**

1. Derive/validate dimensions and allocate exact uint64 counter storage.
2. Implement independent probes and conservative updates.
3. Preflight atomic counter merges and overflow.
4. Assert no underestimation against exact maps and measure the configured additive-error probability.

### Task 10: Implement Mergeable Weighted Misra-Gries

**Files**

- Create packages/sketch/src/internal/heavy-hitters/state.ts
- Create packages/sketch/src/internal/heavy-hitters/heap.ts
- Create packages/sketch/src/internal/heavy-hitters/update.ts
- Create packages/sketch/src/internal/heavy-hitters/merge.ts
- Create packages/sketch/src/internal/heavy-hitters/codec.ts
- Create packages/sketch/src/__tests__/heavy-hitters.test.ts
- Create packages/sketch/src/__tests__/heavy-hitters.statistics.test.ts

**Steps**

1. Implement lazy global decrement, heap generations, canonical tie order, and collision-safe keys.
2. Expose valid lower/upper bounds and deterministic result ordering.
3. Implement codec-backed canonical serialization.
4. Merge arbitrary partition trees and compare bounds to an exact weighted map.
5. Prove all above-threshold heavy items remain candidates, including fractional weights and adversarial stream order.

### Task 11: Implement Bloom

**Files**

- Create packages/sketch/src/internal/bloom/state.ts
- Create packages/sketch/src/internal/bloom/probes.ts
- Create packages/sketch/src/internal/bloom/merge.ts
- Create packages/sketch/src/internal/bloom/codec.ts
- Create packages/sketch/src/__tests__/bloom.test.ts
- Create packages/sketch/src/__tests__/bloom.statistics.test.ts

**Steps**

1. Derive bounded bit/hash counts and implement portable word storage.
2. Implement add/has, union/merge, and intersection occupancy metadata.
3. Roundtrip canonical word bytes.
4. Prove no false negatives and characterize false positives below, at, and above intended occupancy.

### Task 12: Implement Mergeable Reservoir Sampling

**Files**

- Create packages/sketch/src/internal/reservoir/state.ts
- Create packages/sketch/src/internal/reservoir/update.ts
- Create packages/sketch/src/internal/reservoir/merge.ts
- Create packages/sketch/src/internal/reservoir/codec.ts
- Create packages/sketch/src/__tests__/reservoir.test.ts
- Create packages/sketch/src/__tests__/reservoir.statistics.test.ts

**Steps**

1. Implement Algorithm R with unbiased bigint indexing.
2. Implement exact hypergeometric merge and partial Fisher-Yates selection.
3. Preserve codec, count, PRNG, sample slots, clone, and reset through serialization.
4. Measure per-observation inclusion probabilities for direct and multi-tree merged streams.

### Task 13: Cross-Algorithm Mutation, Merge, and Wire Compatibility

**Files**

- Create packages/sketch/src/__tests__/lifecycle.test.ts
- Create packages/sketch/src/__tests__/merge-matrix.test.ts
- Create packages/sketch/src/__tests__/wire-compat.test.ts
- Create packages/sketch/fixtures/wire/v1/*
- Create packages/sketch/fixtures/wire/manifest.json

**Steps**

1. Assert add, update, addAll, mergeInto, and reset receiver identity.
2. Assert clone independence and exact PRNG preservation.
3. Test every configuration/seed/encoder/codec/mode incompatibility and atomic failure.
4. Check deterministic bytes and prior-minor decode fixtures.
5. Create fixtures in Bun, consume them in Node, and vice versa.
6. Check inspect metadata against fully decoded metadata.

### Task 14: Property and Statistical Verification

**Files**

- Create packages/sketch/src/__tests__/property/*
- Create packages/sketch/src/__tests__/statistics/*
- Create packages/sketch/scripts/run-statistical-suite.ts
- Create packages/sketch/docs/statistical-testing.md

**Steps**

1. Use deterministic generated corpora and record every seed on failure.
2. Separate fast CI characterization from a larger release characterization command.
3. Apply multiple-comparison-aware thresholds and confidence intervals to avoid flaky one-off assertions.
4. Test uniform, Gaussian, Zipf, log-normal, sorted, reverse, periodic, duplicate-heavy, cardinality, and adversarial hash/collision streams.
5. Compare direct ingestion with many partition counts and balanced, left-deep, right-deep, and shuffled merge trees.
6. Require exact state equivalence only where the algorithm promises it; use mathematical bounds/distribution tests for randomized quantile/reservoir structures.

### Task 15: Malformed Input, Fuzzing, and Allocation Defense

**Files**

- Create packages/sketch/src/__tests__/decode-fuzz.test.ts
- Create packages/sketch/src/__tests__/state-invariants.test.ts
- Create packages/sketch/fixtures/malformed/*

**Steps**

1. Mutate every envelope/header/body field in valid fixtures.
2. Exercise huge lengths, count overflows, level/register/counter mismatches, invalid floats, unsorted sparse coupons, invalid heap/candidate data, and missing codecs.
3. Prove decode allocates only after limits and checksum validation.
4. Prove every failure has a stable public error code and never returns partial state.

### Task 16: Benchmarks and Memory Characterization

**Files**

- Create packages/sketch/bench/update.bench.ts
- Create packages/sketch/bench/query.bench.ts
- Create packages/sketch/bench/merge.bench.ts
- Create packages/sketch/bench/serialize.bench.ts
- Create packages/sketch/bench/baselines.json
- Create packages/sketch/bench/README.md

**Steps**

1. Benchmark update throughput by algorithm/configuration and built-in/custom encoder.
2. Benchmark quantile/rank, cardinality, frequency, heavy-hitter, membership, and sample queries.
3. Benchmark direct ingestion versus partitioned merges.
4. Benchmark clone, reset, encode, decode, and inspect.
5. Record retainedBytes and process-memory observations separately.
6. Store runtime, CPU, OS, input distribution, seed, and variance with baselines.

### Task 17: Documentation and Telemetry Sketchbook

**Files**

- Create packages/sketch/README.md
- Create packages/sketch/docs/choosing-a-sketch.md
- Create packages/sketch/docs/error-and-merge-semantics.md
- Create packages/sketch/docs/binary-format.md
- Create packages/sketch/examples/telemetry-sketchbook/*

**Steps**

1. Document every signature, configuration range, mutation rule, bound, merge constraint, memory measure, and binary promise.
2. Add a decision guide contrasting KLL/REQ, HLL++, Count-Min/heavy hitters, Bloom, and reservoir.
3. Build Telemetry Sketchbook with a seeded event generator, exact baseline, live error/memory charts, partition/tree merge controls, HRA/LRA tail comparison, cardinality, top keys, membership, sample, and binary roundtrip/corruption views.
4. Show estimated values beside exact values and stated error metadata; never imply approximation is exact.
5. Add examples for custom object codecs and incompatible merge handling.

### Task 18: Release the Package

**Files**

- Update packages/sketch/package.json only after all gates pass
- Create a major Changeset only after all gates pass

**Steps**

1. Run the full runtime, type, property, statistical, malformed, wire, benchmark, and package smoke suites.
2. Inspect every export and packed artifact.
3. Remove private and let Changesets assign the public version.
4. Install the tarball into clean Bun and Node smoke projects and run one example per sketch plus prior-minor fixture decoding.
5. Verify no source, fixture generator dependency, or test-only package leaks into runtime dependencies.

## Exhaustive Test Matrix

### Common lifecycle and types

- Every mutator returns receiver identity.
- clone has equal bytes and independent future mutation.
- reset matches a fresh same-config sketch.
- invalid single observation is non-mutating.
- iterator throw preserves prior successful observations.
- incompatible/overflow/self merge is atomic and non-mutating.
- default and custom encoders/codecs preserve exact identity metadata.
- count, retainedItems, retainedBytes, config, error, and version update correctly.
- declaration tests cover built-in keys, generic custom types, overloads, readonly metadata, and wrong-codec failures.

### KLL and REQ

- Empty/single/two-item/duplicate/sorted/reverse/extreme finite inputs.
- Every supported k boundary and several intermediate values.
- exact min/max and monotonic quantiles/CDF.
- PMF nonnegative and summing to one within floating tolerance.
- query calls do not mutate bytes or PRNG.
- HRA/LRA tail-specific error across ranks 1e-6 through 1 - 1e-6 where sample size permits.
- direct, partitioned, and varied merge trees.

### HLL++

- Every precision p 4 through 18.
- sparse insert/deduplicate/canonicalization, transition boundary, and dense registers.
- low, medium, and high cardinality plus duplicates and adversarial insertion orders.
- bias table interpolation and linear-count threshold boundaries.
- exact canonical merges across representation pairs and partition order.

### Count-Min and heavy hitters

- exact counts below collision onset and valid overestimation after collisions.
- weighted Count-Min updates at uint64 boundaries and atomic overflow.
- uniform, Zipf, and adversarial keys.
- hash collision resolution for heavy hitters.
- fractional and high-dynamic-range weights.
- lower/upper bounds against exact maps for all retained and omitted keys.
- merge partition/tree guarantees.

### Bloom

- derived dimension formulas and allocation caps.
- no false negatives for all inserted keys.
- configured false-positive characterization.
- union, merge, intersection, count-known/count-unknown metadata.
- every bit-word boundary and portable word fallback.

### Reservoir

- streams shorter than, equal to, and longer than capacity.
- repeated values treated as distinct observations.
- size 1 and maximum configured capacity.
- very large bigint count indexing.
- direct Algorithm R inclusion frequency.
- hypergeometric support and merged inclusion frequency across skewed partition sizes and tree shapes.
- codec roundtrip and sample immutability.

### Wire format and abuse

- deterministic bytes in Bun and Node.
- every published prior minor fixture.
- checksum, truncation, trailing bytes, invalid kind/version/TLV, missing required field, duplicate field, bad UTF-8, unknown codec, count mismatch, body mismatch, and allocation bomb.
- exact float bits, bigint counts, PRNG state, encoder/codec metadata, and canonical ordering.

## Benchmark Matrix

- Update throughput at small/default/large configuration for every algorithm.
- Query latency for one and batched ranks/cardinalities/frequencies.
- Merge throughput for 2, 16, and 256 partitions.
- Serialization/deserialization throughput and bytes by state occupancy.
- Built-in string/number/bigint/binary hashing and custom encoder overhead.
- Sparse and dense HLL++ separately.
- KLL versus REQ HRA/LRA at equivalent retained memory.
- Heavy-hitter capacity and Count-Min width/depth sweeps.
- Bloom occupancy sweep.
- Reservoir capacity and skewed-partition merge.

Benchmarks are evidence, not permission to weaken correctness. A performance optimization lands only with unchanged property/statistical/wire results.

## Release Gate

Do not publish 1.0 until all are true:

1. bun run build:packages succeeds.
2. bun run test:packages succeeds with no skipped Sketch conformance suites.
3. Root lint, package type tests, and declarations pass.
4. Hash and PRNG golden vectors pass in Bun and Node.
5. The full seeded statistical release suite passes for every algorithm/configuration matrix.
6. Direct ingestion and partition/tree merges meet exact or statistical equivalence appropriate to each algorithm.
7. Every malformed/oversized fixture fails with bounded allocation and the expected stable code.
8. Every prior 1.x wire fixture decodes and current encoding is deterministic across runtimes.
9. Packed-tarball smoke projects exercise all seven sketches without repository-only imports.
10. Telemetry Sketchbook demonstrates exact-versus-estimated values, merges, memory, and binary roundtrip.
11. README, hash format, binary format, error semantics, and choosing-a-sketch documentation are complete.
12. Benchmark baselines and environment metadata are checked in and unexplained regressions are resolved.
13. @stopcock/synth remains absent from package dependencies, build/test scripts, CI matrices, Changesets, and release automation.

## Explicit 1.0 Non-Goals

- Sliding windows, deletions, expiring observations, or time decay.
- Exact distinct-value materialization.
- Counting, scalable, or automatically resizing Bloom filters.
- Arbitrary implicit object serialization or property-order hashing.
- Ambient randomness or nondeterministic default seeds.
- Cross-configuration merge coercion.
- Byte compatibility with third-party sketch libraries.
- Weighted reservoir sampling.
- Negative Count-Min updates.
- Automatic recovery from a corrupt or unknown binary format.

## Completion Evidence

The implementing worker must leave:

- a public API inventory mapped to implementation and tests;
- algorithm notes for every capacity, compaction, correction, and merge rule;
- hash and PRNG golden-vector manifests;
- statistical-suite seeds, thresholds, and results;
- exact-versus-approximate merge-equivalence classifications;
- a versioned wire-fixture manifest;
- malformed-input allocation evidence;
- benchmark baselines with runtime/machine metadata;
- packed-tarball smoke output;
- the final Changeset and exact release commands.
