# @stopcock/table 1.0 Implementation Plan

> For agentic workers: implement this plan in order. Do not reduce the Arrow, query, null-semantics, or interoperability scope to make the first release easier. Keep @stopcock/synth out of all build, test, and release work.

## Goal

Ship a public, production-ready `@stopcock/table@1.0.0` package that provides a typed, lazy, columnar query engine; deterministic SQL-style semantics; complete relational and window operators; row, column, CSV, JSON, NDJSON, and Arrow interchange; broad Arrow Columnar Format 1.5 and IPC file/stream compatibility; and optional lowering of compatible segments to @stopcock/compute.

The package must be useful without optional peers, must run in Bun, Node, and modern browsers, and must preserve exact CPU semantics when Compute acceleration is supplied. Version 1.0 is intentionally in-memory: external sorting, spill-to-disk, distributed execution, streaming joins, and arbitrary callback compilation are not part of this release.

## Architecture

Use five layers with one-way dependencies:

1. Schema and storage: Arrow-shaped data types, fields, schemas, validity bitmaps, buffers, vectors, chunks, record batches, and immutable tables.
2. Expressions and logical plans: a closed typed expression AST and immutable query-plan nodes.
3. Planning and execution: semantic validation, projection pruning, safe fusion, physical planning, a CPU reference backend, materialization barriers, and optional Compute lowering.
4. Relational operators: scans, projections, filters, aggregates, groups, sorts, joins, set operations, reshaping, and windows.
5. Interchange: rows, columns, CSV, JSON/NDJSON, Arrow memory layouts, Arrow IPC, compression, extensions, tensors, and sparse tensors.

All public query behavior is defined by the CPU reference backend. Optimizers may change physical work but never row order where the API promises stability, null behavior, NaN behavior, error timing at an explicit materialization boundary, or output schema.

## Toolchain and Repository Conventions

- TypeScript 7, ESM-only, strict mode.
- Bun for package scripts and workspace orchestration.
- Vitest for runtime and declaration tests.
- tsup for JavaScript bundles and tsc --emitDeclarationOnly for declarations.
- sideEffects: false and explicit package exports.
- Exact internal @stopcock dependency versions, matching the repository convention.
- No runtime dependency on Apache Arrow, compression libraries, FlatBuffers libraries, or a database engine.
- Optional @stopcock/compute peer dependency with a dedicated subpath adapter.
- Keep the package private at version 0.0.0 until every release gate in this plan passes; then remove private and add one major Changeset.

## Package and Export Layout

Create the following public exports:

- @stopcock/table: schema, vectors, batches, tables, expressions, queries, plans, and CPU execution.
- @stopcock/table/rows: row and column construction and materialization.
- @stopcock/table/csv: CSV parsing and writing.
- @stopcock/table/json: row-array JSON and NDJSON parsing and writing.
- @stopcock/table/arrow: Arrow buffers, IPC file/stream APIs, extensions, tensors, and sparse tensors.
- @stopcock/table/compute: optional ComputeRuntime interfaces and lowering helpers.

The root export must not eagerly initialize compression WASM or import @stopcock/compute. Arrow compression loads only when a compressed IPC message is encountered or requested by a writer.

## Public Type and Storage Contract

Use a discriminated DataType union. Do not represent logical types as free-form strings.

~~~ts
export type TimeUnit = "second" | "millisecond" | "microsecond" | "nanosecond";
export type IntervalUnit = "year_month" | "day_time" | "month_day_nano";
export type UnionMode = "sparse" | "dense";

export type DataType =
  | { readonly type: "null" }
  | { readonly type: "bool" }
  | { readonly type: "int"; readonly bitWidth: 8 | 16 | 32 | 64; readonly signed: boolean }
  | { readonly type: "float"; readonly precision: 16 | 32 | 64 }
  | { readonly type: "decimal"; readonly bitWidth: 128 | 256; readonly precision: number; readonly scale: number }
  | { readonly type: "binary"; readonly offsetWidth: 32 | 64 }
  | { readonly type: "utf8"; readonly offsetWidth: 32 | 64 }
  | { readonly type: "binary_view" }
  | { readonly type: "utf8_view" }
  | { readonly type: "fixed_binary"; readonly byteWidth: number }
  | { readonly type: "date"; readonly unit: "day" | "millisecond" }
  | { readonly type: "time"; readonly unit: TimeUnit; readonly bitWidth: 32 | 64 }
  | { readonly type: "timestamp"; readonly unit: TimeUnit; readonly timezone?: string }
  | { readonly type: "duration"; readonly unit: TimeUnit }
  | { readonly type: "interval"; readonly unit: IntervalUnit }
  | { readonly type: "list"; readonly offsetWidth: 32 | 64; readonly child: Field }
  | { readonly type: "list_view"; readonly offsetWidth: 32 | 64; readonly child: Field }
  | { readonly type: "fixed_list"; readonly length: number; readonly child: Field }
  | { readonly type: "struct"; readonly fields: readonly Field[] }
  | { readonly type: "map"; readonly entries: Field; readonly keysSorted: boolean }
  | {
      readonly type: "union";
      readonly mode: UnionMode;
      readonly typeIds: readonly number[];
      readonly fields: readonly Field[];
    }
  | { readonly type: "dictionary"; readonly index: IntDataType; readonly value: DataType; readonly ordered: boolean }
  | { readonly type: "run_end"; readonly runEnds: IntDataType; readonly value: DataType }
  | {
      readonly type: "extension";
      readonly name: string;
      readonly storage: DataType;
      readonly metadata?: string;
    };

export type IntDataType = Extract<DataType, { readonly type: "int" }>;

export interface Field {
  readonly name: string;
  readonly dataType: DataType;
  readonly nullable: boolean;
  readonly metadata?: ReadonlyMap<string, string>;
}

export interface Schema<R = unknown> {
  readonly fields: readonly Field[];
  readonly metadata?: ReadonlyMap<string, string>;
  readonly rowType?: R;
}

export interface DecimalValue {
  readonly coefficient: bigint;
  readonly scale: number;
}

export interface TimestampValue {
  readonly value: bigint;
  readonly unit: TimeUnit;
  readonly timezone?: string;
}

export interface IntervalValue {
  readonly unit: IntervalUnit;
  readonly months?: number;
  readonly days?: number;
  readonly milliseconds?: number;
  readonly nanoseconds?: bigint;
}

export interface UnionValue<T = unknown> {
  readonly typeId: number;
  readonly value: T;
}

export interface BufferSlice {
  readonly buffer: ArrayBufferLike;
  readonly byteOffset: number;
  readonly byteLength: number;
}

export interface ValidityBitmap {
  readonly length: number;
  readonly nullCount: number;
  readonly bytes?: BufferSlice;
  isValid(index: number): boolean;
}

export interface Vector<T = unknown> extends Iterable<T | null> {
  readonly dataType: DataType;
  readonly length: number;
  readonly nullCount: number;
  readonly validity: ValidityBitmap;
  get(index: number): T | null;
  slice(offset: number, length?: number): Vector<T>;
  materialize(): Vector<T>;
}

export interface RecordBatch<R = unknown> {
  readonly schema: Schema<R>;
  readonly length: number;
  readonly columns: readonly Vector[];
  column(name: keyof R & string): Vector<R[keyof R]>;
  column(index: number): Vector;
  slice(offset: number, length?: number): RecordBatch<R>;
}

export interface Table<R = unknown> {
  readonly schema: Schema<R>;
  readonly length: number;
  readonly batches: readonly RecordBatch<R>[];
  query(): Query<R>;
  column<K extends keyof R & string>(name: K): ChunkedVector<R[K]>;
  slice(offset: number, length?: number): Table<R>;
  toRows(options?: ToRowsOptions): readonly R[];
}

export interface ChunkedVector<T = unknown> extends Iterable<T | null> {
  readonly dataType: DataType;
  readonly length: number;
  readonly chunks: readonly Vector<T>[];
  get(index: number): T | null;
}
~~~

All vector accessors throw RangeError for a negative or out-of-range index. Slices clamp their ending position but reject negative offsets and lengths. Buffers remain alive for the lifetime of every vector that references them.

The query engine may expose zero-copy views only when alignment, endianness, compression, offset normalization, and ownership permit. Any unavoidable copy must be explicit in explain output and instrumentation.

## Row, Column, Batch, and Stream Construction

~~~ts
export type ColumnInput<T> =
  | Vector<T>
  | readonly (T | null)[]
  | ArrayLike<T | null>
  | Iterable<T | null>;

export interface FromRowsOptions<R> {
  readonly schema?: Schema<R>;
  readonly batchSize?: number;
  readonly infer?: "full" | { readonly rows: number };
}

export interface FromColumnsOptions<R> {
  readonly schema?: Schema<R>;
  readonly length?: number;
}

export interface StreamConstructionOptions<R> {
  readonly schema: Schema<R>;
  readonly validate?: "eager" | "batch";
}

export function fromRows<R extends object>(
  rows: Iterable<R>,
  options?: FromRowsOptions<R>,
): Table<R>;

export function fromColumns<R extends object>(
  columns: { readonly [K in keyof R]: ColumnInput<R[K]> },
  options?: FromColumnsOptions<R>,
): Table<R>;

export function fromBatches<R>(
  batches: Iterable<RecordBatch<R>>,
  schema?: Schema<R>,
): Table<R>;

export function fromBatchStream<R>(
  batches: AsyncIterable<RecordBatch<R>>,
  options: StreamConstructionOptions<R>,
): AsyncTable<R>;

export interface AsyncTable<R> {
  readonly schema: Schema<R>;
  query(): AsyncQuery<R>;
  collect(options?: ExecutionOptions): Promise<Table<R>>;
  batches(options?: ExecutionOptions): AsyncIterable<RecordBatch<R>>;
}
~~~

Synchronous row inference examines the entire input by default. Bounded inference is opt-in and later incompatible values fail with a row-and-field diagnostic; values are never silently coerced to strings. A streaming source always requires a schema unless its parser has an explicitly configured bounded inference window that buffers all sampled records before emitting the first batch.

Use a deterministic widening lattice:

- null may widen to any nullable type;
- homogeneous booleans remain bool;
- safe integer numbers widen int8 through int32 and then float64;
- bigint values infer int64 or uint64 when representable and otherwise fail;
- mixed safe integer and fractional number values infer float64;
- strings, binary, arrays, structs, and map-like values only merge with their own compatible shapes;
- missing object properties are null, but an explicit undefined value is rejected;
- nested field order is first-observed order with deterministic append order for later fields;
- date/time, decimal, dictionary, extension, union, and run-end types require a schema or wrapper value and are never guessed from plain JavaScript objects.

## Typed Expression AST

The expression builder constructs a closed AST. It must not accept raw SQL or JavaScript source.

~~~ts
declare const exprType: unique symbol;

export interface Expr<T> {
  readonly [exprType]: T;
  readonly node: ExprNode;
  as(name: string): NamedExpr<T>;
}

export interface NamedExpr<T> extends Expr<T> {
  readonly name: string;
}

export interface Scope<R> {
  col<K extends keyof R & string>(name: K): Expr<R[K]>;
}

export type ExprNode =
  | { readonly kind: "literal"; readonly value: unknown; readonly dataType?: DataType }
  | { readonly kind: "column"; readonly path: readonly string[] }
  | { readonly kind: "unary"; readonly op: UnaryOperator; readonly value: ExprNode }
  | { readonly kind: "binary"; readonly op: BinaryOperator; readonly left: ExprNode; readonly right: ExprNode }
  | { readonly kind: "call"; readonly fn: BuiltinFunction; readonly args: readonly ExprNode[] }
  | { readonly kind: "case"; readonly branches: readonly CaseBranch[]; readonly fallback: ExprNode }
  | { readonly kind: "cast"; readonly value: ExprNode; readonly to: DataType; readonly safe: boolean }
  | { readonly kind: "aggregate"; readonly aggregate: AggregateNode }
  | { readonly kind: "window"; readonly window: WindowNode };

export interface ExpressionFactory {
  literal<T>(value: T, dataType?: DataType): Expr<T>;
  eq<T>(left: Expr<T>, right: Expr<T> | T): Expr<boolean | null>;
  ne<T>(left: Expr<T>, right: Expr<T> | T): Expr<boolean | null>;
  lt<T>(left: Expr<T>, right: Expr<T> | T): Expr<boolean | null>;
  lte<T>(left: Expr<T>, right: Expr<T> | T): Expr<boolean | null>;
  gt<T>(left: Expr<T>, right: Expr<T> | T): Expr<boolean | null>;
  gte<T>(left: Expr<T>, right: Expr<T> | T): Expr<boolean | null>;
  add(left: NumericExpr, right: NumericExpr | number | bigint): NumericExpr;
  sub(left: NumericExpr, right: NumericExpr | number | bigint): NumericExpr;
  mul(left: NumericExpr, right: NumericExpr | number | bigint): NumericExpr;
  div(left: NumericExpr, right: NumericExpr | number | bigint): NumericExpr;
  mod(left: NumericExpr, right: NumericExpr | number | bigint): NumericExpr;
  neg(value: NumericExpr): NumericExpr;
  and(...values: readonly Expr<boolean | null>[]): Expr<boolean | null>;
  or(...values: readonly Expr<boolean | null>[]): Expr<boolean | null>;
  not(value: Expr<boolean | null>): Expr<boolean | null>;
  isNull(value: Expr<unknown>): Expr<boolean>;
  isNotNull(value: Expr<unknown>): Expr<boolean>;
  coalesce<T>(...values: readonly Expr<T | null>[]): Expr<T | null>;
  when<T>(
    branches: readonly { readonly when: Expr<boolean | null>; readonly then: Expr<T> }[],
    otherwise: Expr<T>,
  ): Expr<T>;
  cast<T>(value: Expr<unknown>, dataType: DataType, options?: { readonly safe?: boolean }): Expr<T | null>;
  lower(value: Expr<string | null>): Expr<string | null>;
  upper(value: Expr<string | null>): Expr<string | null>;
  trim(value: Expr<string | null>): Expr<string | null>;
  length(value: Expr<string | Uint8Array | null>): Expr<number | null>;
  contains(value: Expr<string | null>, search: Expr<string> | string): Expr<boolean | null>;
  startsWith(value: Expr<string | null>, search: Expr<string> | string): Expr<boolean | null>;
  endsWith(value: Expr<string | null>, search: Expr<string> | string): Expr<boolean | null>;
  substring(value: Expr<string | null>, start: Expr<number> | number, length?: Expr<number> | number): Expr<string | null>;
  extract(part: DatePart, value: Expr<TimestampValue | null>): Expr<number | null>;
  dateTrunc(unit: DateTruncUnit, value: Expr<TimestampValue | null>): Expr<TimestampValue | null>;
}

export const expr: ExpressionFactory;
export type NumericExpr = Expr<number | bigint | DecimalValue | null>;
~~~

The first 1.0 standard function set is closed and documented: arithmetic, comparisons, Kleene boolean logic, null tests, coalesce, conditionals, casts, string case/trim/length/search/slicing, and timestamp extraction/truncation. Adding a built-in is a minor release; changing its semantics is a major release.

Expression validation resolves fields, nullability, result types, legal casts, aggregate/window placement, and backend support before execution starts. The error includes the plan node, expression path, field, expected type, and actual type.

## Query and Operator Contract

~~~ts
export interface Query<R> {
  filter(predicate: (scope: Scope<R>) => Expr<boolean | null>): Query<R>;
  derive<A extends Record<string, unknown>>(
    expressions: (scope: Scope<R>) => { readonly [K in keyof A]: Expr<A[K]> },
  ): Query<R & A>;
  select<K extends keyof R & string>(...columns: readonly K[]): Query<Pick<R, K>>;
  select<A extends Record<string, unknown>>(
    expressions: (scope: Scope<R>) => { readonly [K in keyof A]: Expr<A[K]> },
  ): Query<A>;
  drop<K extends keyof R & string>(...columns: readonly K[]): Query<Omit<R, K>>;
  rename<M extends Partial<Record<keyof R, string>>>(mapping: M): Query<RenameRow<R, M>>;
  take(count: number): Query<R>;
  slice(offset: number, length?: number): Query<R>;
  distinct(options?: DistinctOptions<R>): Query<R>;
  orderBy(...keys: readonly OrderKeyFactory<R>[]): Query<R>;
  aggregate<A extends Record<string, unknown>>(
    expressions: (scope: AggregateScope<R>) => { readonly [K in keyof A]: AggregateExpr<A[K]> },
  ): Query<A>;
  groupBy<K extends Record<string, unknown>>(
    keys: (scope: Scope<R>) => { readonly [P in keyof K]: Expr<K[P]> },
  ): GroupedQuery<R, K>;
  concat(...others: readonly TableLike<R>[]): Query<R>;
  union(...others: readonly TableLike<R>[]): Query<R>;
  pivot(options: PivotOptions<R>): Query<Record<string, unknown>>;
  unpivot(options: UnpivotOptions<R>): Query<Record<string, unknown>>;
  window<A extends Record<string, unknown>>(
    expressions: (scope: WindowScope<R>) => { readonly [K in keyof A]: WindowExpr<A[K]> },
  ): Query<R & A>;
  join<S, A extends Record<string, unknown> = R & S>(
    other: TableLike<S>,
    options: JoinOptions<R, S, A>,
  ): Query<A>;
  mapRows<A>(callback: (row: Readonly<R>, index: number) => A, schema: Schema<A>): Query<A>;
  deriveCallback<K extends string, T>(
    name: K,
    callback: (row: Readonly<R>, index: number) => T,
    field: Field,
  ): Query<R & Record<K, T>>;
  explainPlan(options?: ExplainOptions): ExplainPlan;
  batches(options?: ExecutionOptions): Iterable<RecordBatch<R>>;
  collect(options?: ExecutionOptions): Table<R>;
  collectAsync(options?: ExecutionOptions): Promise<Table<R>>;
  rows(options?: ExecutionOptions & ToRowsOptions): readonly R[];
}

export interface GroupedQuery<R, K> {
  aggregate<A extends Record<string, unknown>>(
    expressions: (scope: AggregateScope<R>) => { readonly [P in keyof A]: AggregateExpr<A[P]> },
  ): Query<K & A>;
}

export type JoinKind =
  | "inner"
  | "left"
  | "right"
  | "full"
  | "semi"
  | "anti"
  | "cross"
  | "asof";

export interface JoinOptions<L, R, O> {
  readonly kind: JoinKind;
  readonly on?: (left: Scope<L>, right: Scope<R>) => Expr<boolean | null>;
  readonly keys?: readonly JoinKey<L, R>[];
  readonly nullEqual?: boolean;
  readonly suffixes?: readonly [string, string];
  readonly select?: (left: Scope<L>, right: Scope<R>) => RecordExpr<O>;
  readonly asof?: AsofJoinOptions<L, R>;
}

export interface WindowSpec<R> {
  readonly partitionBy?: readonly ((scope: Scope<R>) => Expr<unknown>)[];
  readonly orderBy: readonly OrderKeyFactory<R>[];
  readonly frame?: RowsFrame | RangeFrame;
}

export interface WindowScope<R> extends Scope<R> {
  rowNumber(spec: WindowSpec<R>): WindowExpr<number>;
  rank(spec: WindowSpec<R>): WindowExpr<number>;
  denseRank(spec: WindowSpec<R>): WindowExpr<number>;
  lead<T>(value: Expr<T>, offset: number, fallback: Expr<T> | T, spec: WindowSpec<R>): WindowExpr<T>;
  lag<T>(value: Expr<T>, offset: number, fallback: Expr<T> | T, spec: WindowSpec<R>): WindowExpr<T>;
  sum(value: NumericExpr, spec: WindowSpec<R>): WindowExpr<number | bigint | DecimalValue | null>;
  min<T>(value: Expr<T>, spec: WindowSpec<R>): WindowExpr<T | null>;
  max<T>(value: Expr<T>, spec: WindowSpec<R>): WindowExpr<T | null>;
  avg(value: NumericExpr, spec: WindowSpec<R>): WindowExpr<number | DecimalValue | null>;
  count(value: Expr<unknown>, spec: WindowSpec<R>): WindowExpr<number>;
  countAll(spec: WindowSpec<R>): WindowExpr<number>;
}
~~~

AggregateScope must include sum, min, max, avg, count, countAll, first, last, any, all, and collectList. Every aggregate documents empty-input behavior and output nullability. Pivot requires explicit index, column, value, aggregate, duplicate policy, and optional output values; unpivot requires explicit id columns, value columns, name field, value field, and null retention.

Set and relational behavior:

- concat preserves all rows and input order and requires compatible schemas.
- union is stable distinct over concat: the first occurrence wins.
- distinct is stable: the first occurrence wins unless an explicit order was applied first.
- sort is stable for equal keys.
- semi and anti joins emit left rows at most once and preserve left order.
- hash joins preserve left-major order and right input order within each matching key.
- right joins use the symmetric right-major rule; full joins append unmatched right rows in right input order.
- cross joins are left-major.
- as-of joins require one ordered key, optional equality partitions, direction backward/forward/nearest, tolerance, and an explicit tie rule.
- nullEqual defaults false. When true, null join keys form a matching key bucket without changing expression comparison semantics.

## SQL Null, NaN, Cast, and Numeric Semantics

Implement SQL-style three-valued logic with validity stored separately from values. A null slot may contain arbitrary physical bytes and no operator may read those bytes before checking validity.

Kleene logic is mandatory:

| a | b | a AND b | a OR b |
|---|---|---|---|
| true | null | null | true |
| false | null | false | null |
| null | null | null | null |

- NOT null is null.
- Any ordinary comparison involving null returns null.
- A filter keeps only true; false and null are discarded.
- Aggregates ignore null inputs except countAll. count(value) counts valid values.
- sum, min, max, avg, first, last, any, and all return null when no valid input exists.
- count and countAll return zero for empty input.
- Group keys treat all nulls as one deterministic bucket.
- Null join keys do not match by default.
- Nulls sort last in both ascending and descending order unless the key explicitly selects first.
- NaN sorts after every non-null numeric value and before null.
- NaN compares unequal to every value including itself.
- Group and distinct use one deterministic canonical NaN bucket.
- NaN join keys do not match by default; an explicit nanEqual option may be added after 1.0, not hidden in nullEqual.
- Negative zero and positive zero compare equal, group together, and serialize with their original bits in raw vectors.

Integer operations use exact bigint arithmetic for 64-bit values and checked number arithmetic for 8/16/32-bit values. Overflow throws ExecutionError unless an explicit wrapping cast or future wrapping operator is used. Integer division truncates toward zero. Division by zero throws for integer and decimal expressions; IEEE float division follows IEEE 754.

Decimal arithmetic aligns scales, checks declared precision, and uses bigint coefficients. Timestamp arithmetic operates in declared units; timezone is metadata for an instant and date extraction uses the named zone only when a registered timezone resolver is supplied. The default resolver supports UTC; other zones fail clearly rather than consulting ambient process locale.

Safe casts return null on a per-row conversion failure. Strict casts throw with batch, row, field, source type, destination type, and a sanitized value preview. Query validation rejects structurally impossible casts before reading data.

## Logical and Physical Planning

Represent every query call as an immutable logical node:

~~~ts
export type LogicalPlanNode =
  | ScanNode
  | FilterNode
  | DeriveNode
  | ProjectNode
  | TakeNode
  | SliceNode
  | SortNode
  | DistinctNode
  | AggregateNode
  | GroupNode
  | JoinNode
  | ConcatNode
  | UnionNode
  | PivotNode
  | UnpivotNode
  | WindowPlanNode
  | CallbackNode;

export interface ExplainPlan {
  readonly logical: ExplainNode;
  readonly physical: ExplainNode;
  readonly projectedColumns: readonly string[];
  readonly fusedSegments: readonly FusedSegment[];
  readonly materializations: readonly MaterializationReason[];
  readonly backendSegments: readonly BackendSegment[];
  readonly estimatedTemporaryBytes: number;
  readonly warnings: readonly PlanWarning[];
}
~~~

Planner passes run in a deterministic order:

1. Validate schema, expression type, aggregate/window placement, and operator arguments.
2. Normalize boolean and comparison nodes without changing null semantics.
3. Compute required-column sets from sinks to sources and prune scans.
4. Push filters below derives and projections only when referenced expressions are pure and moving them cannot change strict-cast error timing.
5. Fuse adjacent filter, derive, project, and take nodes.
6. Eliminate redundant projections and no-op slices.
7. Select operator algorithms and materialization points.
8. Partition compatible fused segments into CPU and Compute backends.
9. Estimate temporary allocations and emit warnings for high-cardinality pivot/cross join/full materialization.

Never reorder across sort, group, aggregate, distinct, join, union, pivot, unpivot, window, or callback boundaries. mapRows and deriveCallback are hard CPU/materialization barriers. Callback source is never parsed, stringified, optimized, or sent to Compute.

The CPU fused-kernel compiler emits kernels only from the closed AST. Provide a CSP-safe interpreter and a generated-function implementation; both must pass the same oracle suite. The runtime selects the interpreter when dynamic function construction is unavailable. Generated code never embeds user text except validated field indexes and constant pool references.

## Physical Operator Algorithms

- Filter/project/derive/take: one batch-at-a-time fused selection and projection kernels; selection vectors avoid immediate copies and compact only at the next ownership/materialization boundary.
- Slice: skip whole batches, then use vector slices without copying where possible.
- Stable order: indirect stable merge sort over row references, with insertion sort for small runs. Multi-key comparators check validity and NaN before values. Optional bounded top-k selection is permitted only when it produces byte-for-byte identical order.
- Distinct and grouping: typed hash tables with canonical null, NaN, negative-zero, binary, nested, dictionary, and extension hashing. Resolve collisions by full typed equality.
- Aggregation: per-group typed state objects with checked count growth. Use compensated summation for float sum/avg; bigint for integer/decimal state; deterministic input-order merges.
- Equi-joins: partitioned hash join with explicit build/probe choice that still preserves the public ordering contract using row ordinals. Multi-column keys use typed hash/equality.
- General predicate joins: blocked nested-loop execution after extracting any equi-key prefix. Emit an explain warning when no hashable predicate exists.
- Cross join: blocked Cartesian batches with preflight output-size and safe-integer checks.
- As-of join: stable partition grouping plus binary search over sorted right keys; validate or internally stable-sort based on the option and report the sort in explain output.
- Concat: preserve batches when schemas and dictionaries are directly compatible; otherwise cast/recode through builders.
- Union: concat followed by stable distinct.
- Pivot: two-phase unique pivot-value discovery and grouped aggregate; require an explicit maximumColumns guard for data-discovered columns.
- Unpivot: chunked row expansion with no full output preallocation.
- Windows: stable partition sort by partition/order keys; peer-range indexes for rank and range frames; deque algorithms for min/max, prefix or compensated rolling states for sums/counts, and indexed lookup for lead/lag. Recompute non-invertible aggregate state at documented thresholds to avoid numerical drift.

Every allocation derived from row count, offset, buffer length, pivot width, cross-product size, dictionary size, or IPC metadata must pass safe-integer, configured-limit, and available-platform checks before allocation.

## Optional Compute Lowering

~~~ts
// Declared by the root package; it imports no Compute types.
export interface TableComputeBackend {
  readonly kind: "stopcock-compute";
  dispose(): Promise<void>;
}

// Declared only by @stopcock/table/compute.
import type { ComputeRuntime } from "@stopcock/compute";

export function computeBackend(
  runtime: ComputeRuntime,
  options?: {
    readonly backend?: "auto" | "cpu" | "wasm" | "webgpu";
    readonly fallback?: "allow" | "error";
    readonly minRows?: number;
  },
): TableComputeBackend;

export interface ExecutionOptions {
  readonly signal?: AbortSignal;
  readonly compute?: TableComputeBackend;
  readonly batchSize?: number;
  readonly limits?: Partial<ExecutionLimits>;
  readonly instrumentation?: ExecutionInstrumentation;
}
~~~

`TableComputeBackend` is the root package's opaque optional-backend handle; it is not a second or structurally incompatible definition of `ComputeRuntime` and does not publicly expose the wrapped runtime. The `/compute` subpath imports the actual `@stopcock/compute` peer, retains that runtime and adapter operations behind a package-private symbol shared with the executor, and adapts its public `compile`, `run`, `explain`, `KernelProgram`, `TensorView`, and `ExecutionReport` contracts. Reject forged handles before planning. Root Table declarations refer only to `TableComputeBackend`, so consumers that do not install Compute can still import and type-check the root package.

Lower one concrete `RecordBatch` at a time:

1. Translate each supported Table expression into the closed Compute AST; never stringify a callback or construct an undocumented runtime command.
2. Pass compatible primitive numeric column buffers as rank-one `TensorView` inputs. Expand Table's bit-packed SQL-validity bitmap into a `u32` zero/one tensor when an expression needs null propagation; bit-offset slices use the same expansion. Value buffers may alias zero-copy only when dtype, alignment, contiguity, endianness, and ownership are compatible.
3. Compile one output kernel for the filter truth mask and one for each derived/projected value or validity result. Cache compiled kernels by normalized expression, schema fingerprint, dtype, nullability, and concrete batch shape. The Compute 1.0 single-output program contract is preserved rather than silently inventing a multi-output API.
4. Invoke `runtime.compile()`/`CompiledKernel.run()` using the backend and fallback policy stored in `computeBackend`; repack returned zero/one validity tensors into bitmaps and combine value/validity arrays into immutable Table vectors only after every kernel for the batch succeeds.
5. Attach each `ComputeExecutionReport` to Table instrumentation and `explainPlan`, including transfers, selected backend, fallback reason, temporary bytes, and the fact that multiple output kernels were required.

Only validated numeric/bool filter, derive, project, and take segments with exactly representable null, overflow, cast, and ordering semantics are eligible. Unsupported expressions remain CPU segments before execution. Transfers to and from Compute are explicit materialization nodes. A Compute failure is not retried by Table after externally visible work; it surfaces as `BackendExecutionError` with the Compute error as its cause. Compute's own configured backend fallback may occur before output commit and must be reported. CPU-only and mixed-backend results must be row-, null-, and schema-identical.

## CSV and JSON Contract

~~~ts
export interface CsvReadOptions<R> {
  readonly schema?: Schema<R>;
  readonly delimiter?: string;
  readonly header?: boolean | readonly string[];
  readonly quote?: string;
  readonly escape?: string;
  readonly newline?: "auto" | "\n" | "\r\n";
  readonly trim?: false | "unquoted" | "all";
  readonly nullValues?: readonly string[];
  readonly inferRows?: number;
  readonly batchSize?: number;
  readonly decoder?: TextDecoder;
  readonly limits?: Partial<TextReadLimits>;
}

export function readCsv<R>(
  input: string | Uint8Array | ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>,
  options?: CsvReadOptions<R>,
): AsyncTable<R>;

export function writeCsv<R>(
  input: TableLike<R>,
  options?: CsvWriteOptions,
): AsyncIterable<Uint8Array>;

export function readJson<R>(
  input: string | Uint8Array | ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>,
  options?: JsonReadOptions<R>,
): AsyncTable<R>;

export function readNdjson<R>(
  input: string | Uint8Array | ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>,
  options?: NdjsonReadOptions<R>,
): AsyncTable<R>;

export function writeJson<R>(input: TableLike<R>, options?: JsonWriteOptions): AsyncIterable<Uint8Array>;
export function writeNdjson<R>(input: TableLike<R>, options?: JsonWriteOptions): AsyncIterable<Uint8Array>;
~~~

The CSV reader is an incremental RFC 4180 state machine that supports quoted newlines, doubled quotes, configurable one-code-point delimiter/quote, UTF-8 BOM, CRLF split across chunks, fragmented multi-byte UTF-8, optional headers, and bounded field/row/input limits. Diagnostics include byte offset, record number, field number, and state.

Use TextDecoder in streaming mode and reject malformed UTF-8 by default. Do not concatenate an entire byte stream before parsing.

JSON row-array input accepts one top-level array of objects. NDJSON accepts one object per non-empty line. JSON null maps to column null; undefined is impossible and unsupported. The streaming JSON array parser recognizes JSON strings, escapes, nesting, numbers, booleans, and null incrementally rather than calling JSON.parse on an unbounded document. Individual records may use JSON.parse after bounded framing. Writers use deterministic schema field order and encode bigint, decimal, timestamp, interval, binary, and extension values only through explicit logical-value options; they never silently lose precision.

## Arrow Columnar Format 1.5 Contract

Implement and test every following layout:

- null and validity-only arrays;
- bit-packed bool;
- signed and unsigned integers at 8, 16, 32, and 64 bits;
- float16, float32, and float64;
- decimal128 and decimal256;
- binary and UTF-8 with 32-bit and 64-bit offsets;
- BinaryView and Utf8View with variadic data buffers;
- fixed-size binary;
- date32/date64, time32/time64, timestamp, interval, and duration;
- list, large-list, list-view, large-list-view, and fixed-size-list;
- struct and map;
- sparse and dense union;
- dictionary encoding and dictionary deltas;
- run-end encoded arrays;
- canonical and unknown extension metadata.

Follow Arrow buffer order, least-significant-bit bitmap order, child length rules, offset validation, alignment, and 64-bit metadata lengths. JavaScript-facing lengths remain safe integers. Inputs exceeding engine limits are read as multiple chunks when the format permits; a single buffer or array that cannot be addressed safely fails before allocation.

Unions do not gain a synthetic parent validity bitmap. Run-end arrays enforce signed int16/int32/int64 run-end types, positive strictly increasing ends, child consistency, and logical length. View types validate inline/external view records, buffer indexes, offsets, and variadic buffer counts.

Unknown extension types are represented as extension DataType values and retain the exact ARROW:extension:name and ARROW:extension:metadata entries through read/write/storage. Generic storage operations and roundtrip work without a codec. Semantic expression, comparison, hash, cast, and row conversion operations require a registered codec:

~~~ts
export interface ExtensionCodec<T> {
  readonly name: string;
  readonly storageType: DataType;
  decode(storage: unknown, metadata?: string): T;
  encode(value: T, metadata?: string): unknown;
  compare?(left: T, right: T): number;
  hash?(value: T): bigint;
}

export interface ExtensionRegistry {
  register<T>(codec: ExtensionCodec<T>): void;
  get(name: string): ExtensionCodec<unknown> | undefined;
}
~~~

Dictionary vectors retain dictionary identity and ordered metadata. Readers apply replacement and delta messages in stream order. Writers emit a dictionary before any record batch that references it. File writers never emit unsupported dictionary replacement; deltas are ordered in the footer.

## Arrow IPC, FlatBuffers, Compression, and Tensors

~~~ts
export interface ArrowReadOptions {
  readonly extensions?: ExtensionRegistry;
  readonly compression?: CompressionRegistry;
  readonly limits?: Partial<ArrowReadLimits>;
  readonly copy?: "auto" | "always" | "never";
}

export function readArrowStream<R>(
  input: Uint8Array | ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>,
  options?: ArrowReadOptions,
): AsyncTable<R>;

export function readArrowFile<R>(
  input: Uint8Array | RandomAccessSource,
  options?: ArrowReadOptions,
): Promise<Table<R>>;

export function writeArrowStream<R>(
  input: TableLike<R>,
  options?: ArrowWriteOptions,
): AsyncIterable<Uint8Array>;

export function writeArrowFile<R>(
  input: TableLike<R>,
  options?: ArrowWriteOptions,
): Promise<Uint8Array>;

export function readArrowMessage(input: Uint8Array, options?: ArrowReadOptions): ArrowMessage;
export function writeArrowMessage(message: ArrowMessage, options?: ArrowWriteOptions): Uint8Array;

export interface Tensor<T = unknown> {
  readonly dataType: DataType;
  readonly shape: readonly bigint[];
  readonly strides?: readonly bigint[];
  readonly dimNames?: readonly string[];
  readonly data: Vector<T>;
}

export interface SparseTensor<T = unknown> {
  readonly dataType: DataType;
  readonly shape: readonly bigint[];
  readonly format: "coo" | "csr" | "csc" | "csf";
  readonly nonZeroLength: bigint;
  readonly index: SparseTensorIndex;
  readonly data: Vector<T>;
}

export function readTensor(input: Uint8Array, options?: ArrowReadOptions): Tensor;
export function writeTensor(tensor: Tensor, options?: ArrowWriteOptions): Uint8Array;
export function readSparseTensor(input: Uint8Array, options?: ArrowReadOptions): SparseTensor;
export function writeSparseTensor(tensor: SparseTensor, options?: ArrowWriteOptions): Uint8Array;
~~~

Build a small in-repo FlatBuffers reader/writer specialized to Arrow metadata. It must validate vtable offsets, scalar/vector widths, recursion depth, union tags, required fields, and every computed range. Do not expose generated mutable table objects; translate metadata into immutable internal records.

IPC stream parsing is incremental:

1. Read continuation marker or legacy metadata length.
2. Decode little-endian metadata length and bounded FlatBuffer bytes.
3. Skip metadata padding to an 8-byte boundary.
4. Read the declared body length without assuming one input chunk.
5. Decode/decompress buffers in schema preorder.
6. Apply dictionary messages before dependent batches.
7. Accept the standard zero-length EOS marker and a stream ending after a complete message.

IPC files validate leading/trailing ARROW1 magic, footer length, footer FlatBuffer, block ranges, and non-overlap. Random-access reads fetch only required metadata/body ranges. A byte-array source can create zero-copy views when allowed.

Compressed record-batch bodies support per-buffer compression and the Arrow -1 uncompressed-buffer sentinel. Implement Arrow-compatible LZ4 Frame and Zstandard codecs in-repo:

- a fully compatible, portable TypeScript decoder for each codec;
- a deterministic TypeScript encoder that emits standards-compliant frames;
- first-party WASM implementations for higher throughput, built from source in the repository and packaged as assets;
- identical validation and error classes across TypeScript and WASM paths;
- no third-party runtime package or network fetch;
- lazy WASM initialization with a TypeScript fallback for CSP, unsupported runtimes, or initialization failure.

LZ4 means the LZ4 Frame format, never raw LZ4 blocks. Zstandard decoding must cover frames produced by the official cross-language Arrow fixtures, including raw, RLE, and entropy-compressed blocks. Both codecs validate checksums where present, declared sizes, window bounds, block bounds, and output limits before growth.

Standalone Tensor and SparseTensor IPC messages roundtrip through @stopcock/table/arrow, use required 64-byte body alignment, and preserve shapes, strides, dimension names, sparse index form, and exact value bits. They are not accepted as query RecordBatch inputs. Canonical tensor extension arrays remain ordinary extension-backed record-batch columns and are distinct from standalone tensor messages.

## Failure and Cancellation Semantics

Define public error classes with stable codes:

- SchemaError for invalid or incompatible schemas.
- ExpressionError for unresolved or ill-typed expressions.
- PlanError for invalid operator combinations or unsafe sizes.
- ExecutionError for row-level CPU failures.
- BackendExecutionError for Compute failures.
- ParseError for CSV/JSON framing and conversion.
- ArrowFormatError for invalid layouts, metadata, or IPC ordering.
- CompressionError for malformed or unsupported compressed data.
- ExtensionCodecError for missing or failing semantic codecs.
- AbortError for cancellation.

Errors include structured context but do not retain entire user rows or buffers. Stream readers stop pulling and release readers on error or abort. Async generators check AbortSignal between input reads, batches, partitions, sort runs, and compression blocks. Synchronous execution checks at equivalent batch boundaries.

No parser, decompressor, FlatBuffers reader, nested-vector validator, or operator may allocate from an untrusted length before enforcing limits. Default limits must be conservative and individually configurable for rows, columns, nesting, metadata bytes, body bytes, buffer bytes, decompressed bytes, string/field bytes, dictionary entries, output rows, pivot columns, and cross-product rows.

## Implementation Tasks

### Task 1: Scaffold the Private Package

**Files**

- Create packages/table/package.json
- Create packages/table/tsconfig.json
- Create packages/table/tsup.config.ts
- Create packages/table/src/index.ts
- Create packages/table/src/rows.ts
- Create packages/table/src/csv.ts
- Create packages/table/src/json.ts
- Create packages/table/src/arrow.ts
- Create packages/table/src/compute.ts

**Steps**

1. Mirror current package scripts, ESM exports, declaration build, test, lint, and sideEffects conventions.
2. Set version 0.0.0 and private true.
3. Add exact @stopcock/fp dependency and optional @stopcock/compute peer metadata.
4. Add export-condition tests proving every public subpath imports in Bun and Node without optional peers.
5. Add an architecture README under packages/table that states the one-way layer boundaries.

**Acceptance**

- bun run build:packages includes the private package.
- Root import does not load Arrow compression or Compute modules.

### Task 2: Implement Data Types, Schemas, Limits, and Errors

**Files**

- Create packages/table/src/schema/data-type.ts
- Create packages/table/src/schema/schema.ts
- Create packages/table/src/schema/equality.ts
- Create packages/table/src/schema/inference.ts
- Create packages/table/src/errors.ts
- Create packages/table/src/limits.ts
- Create packages/table/src/__tests__/schema.test.ts
- Create packages/table/src/__tests__/schema.test-d.ts

**Steps**

1. Implement immutable constructors and exhaustive validators for every DataType.
2. Implement metadata-preserving field/schema cloning, compatibility, and stable fingerprints.
3. Implement deterministic full-input and bounded inference.
4. Implement structured errors and safe diagnostic previews.
5. Add exhaustive switches guarded by never type tests.

### Task 3: Implement Buffers, Validity, Builders, and Vectors

**Files**

- Create packages/table/src/storage/buffer.ts
- Create packages/table/src/storage/bitmap.ts
- Create packages/table/src/storage/vector.ts
- Create packages/table/src/storage/builders/*
- Create packages/table/src/storage/layouts/*
- Create packages/table/src/storage/chunked-vector.ts
- Create packages/table/src/storage/record-batch.ts
- Create packages/table/src/storage/table.ts
- Create packages/table/src/__tests__/vectors.test.ts

**Steps**

1. Implement checked buffer slicing, bitmap reads/writes, all-valid sentinel, null counting, and bit-offset slices.
2. Implement primitive, variable-width, view, nested, union, dictionary, and run-end vector classes.
3. Implement builders with geometric bounded growth, offset overflow checks, and final immutable buffers.
4. Implement zero-copy slices and explicit materialization.
5. Add property tests comparing every vector to a row oracle across arbitrary slice/chunk/null patterns.

### Task 4: Implement Rows, Columns, Batches, and Async Sources

**Files**

- Create packages/table/src/input/rows.ts
- Create packages/table/src/input/columns.ts
- Create packages/table/src/input/batches.ts
- Create packages/table/src/input/async-table.ts
- Create packages/table/src/output/rows.ts
- Create packages/table/src/__tests__/construction.test.ts

**Steps**

1. Implement the public constructors and schema validation.
2. Preserve chunk boundaries where safe and rechunk only when requested.
3. Make row conversion explicit for precision-sensitive logical types.
4. Add iterator-throw, early-abort, mismatched-length, missing-field, and bounded-inference tests.

### Task 5: Implement and Type-Check the Closed Expression AST

**Files**

- Create packages/table/src/expression/ast.ts
- Create packages/table/src/expression/factory.ts
- Create packages/table/src/expression/builtins.ts
- Create packages/table/src/expression/typecheck.ts
- Create packages/table/src/expression/evaluate.ts
- Create packages/table/src/expression/compile.ts
- Create packages/table/src/__tests__/expression.test.ts
- Create packages/table/src/__tests__/expression.test-d.ts

**Steps**

1. Implement every public expression constructor without raw-source escape hatches.
2. Implement SQL null and NaN behavior in scalar oracle functions.
3. Implement vector interpreter kernels.
4. Implement safe AST-to-function compilation and CSP fallback.
5. Differentially test scalar, interpreted-vector, and compiled-vector results.

### Task 6: Implement Logical Plans, Validation, Fusion, and Explain Output

**Files**

- Create packages/table/src/plan/logical.ts
- Create packages/table/src/plan/validate.ts
- Create packages/table/src/plan/required-columns.ts
- Create packages/table/src/plan/optimize.ts
- Create packages/table/src/plan/physical.ts
- Create packages/table/src/plan/explain.ts
- Create packages/table/src/__tests__/plan.test.ts
- Create packages/table/src/__tests__/__snapshots__/plan.test.ts.snap

**Steps**

1. Implement immutable plan construction for the complete operator suite.
2. Implement ordered optimization passes and hard materialization boundaries.
3. Surface projected columns, fused segments, backend selection, materialization reasons, temporary allocation estimates, and warnings.
4. Snapshot representative plans and assert callbacks never appear as parsed expressions.

### Task 7: Implement Fused Scan, Filter, Derive, Project, Take, and Slice

**Files**

- Create packages/table/src/execution/context.ts
- Create packages/table/src/execution/cpu/scan.ts
- Create packages/table/src/execution/cpu/fused.ts
- Create packages/table/src/execution/cpu/selection.ts
- Create packages/table/src/execution/cpu/materialize.ts
- Create packages/table/src/__tests__/fused-query.test.ts

**Steps**

1. Execute by batches with selection vectors.
2. Preserve stable row order and exact strict-cast failure coordinates.
3. Add abort and allocation instrumentation.
4. Compare every randomized pipeline to the row oracle with fusion on and disabled.

### Task 8: Implement Sort, Distinct, Grouping, and Aggregation

**Files**

- Create packages/table/src/execution/cpu/sort.ts
- Create packages/table/src/execution/cpu/hash-table.ts
- Create packages/table/src/execution/cpu/distinct.ts
- Create packages/table/src/execution/cpu/group.ts
- Create packages/table/src/execution/cpu/aggregate.ts
- Create packages/table/src/__tests__/aggregate-sort.test.ts

**Steps**

1. Implement typed hashing/equality and stable sort.
2. Implement all aggregate states and deterministic merging.
3. Exercise null, NaN, negative zero, binary, dictionary, nested, and extension keys.
4. Add cardinality, collision, empty-input, and overflow tests.

### Task 9: Implement Every Join

**Files**

- Create packages/table/src/execution/cpu/join/hash-join.ts
- Create packages/table/src/execution/cpu/join/predicate-join.ts
- Create packages/table/src/execution/cpu/join/cross-join.ts
- Create packages/table/src/execution/cpu/join/asof-join.ts
- Create packages/table/src/execution/cpu/join/output.ts
- Create packages/table/src/__tests__/joins.test.ts

**Steps**

1. Implement inner, left, right, full, semi, anti, and cross joins.
2. Implement as-of equality partitions, direction, tolerance, and ties.
3. Preserve the documented ordering contract independently of build-side choice.
4. Test nullEqual, duplicate keys, all-null keys, NaN, empty sides, output name collisions, and size guards.

### Task 10: Implement Concat, Union, Pivot, Unpivot, and Windows

**Files**

- Create packages/table/src/execution/cpu/concat.ts
- Create packages/table/src/execution/cpu/pivot.ts
- Create packages/table/src/execution/cpu/unpivot.ts
- Create packages/table/src/execution/cpu/window/*
- Create packages/table/src/__tests__/reshape-window.test.ts

**Steps**

1. Implement schema reconciliation and dictionary recoding for concat.
2. Implement stable union through typed distinct.
3. Implement guarded pivot and chunked unpivot.
4. Implement row/range frames, row number, rank, dense rank, lead, lag, and aggregate windows.
5. Test empty/unbounded/current/offset frames, peer groups, ascending/descending keys, null ordering, partitions split across batches, and randomized row-oracle equivalence.

### Task 11: Implement Callbacks, Async Execution, and Cancellation

**Files**

- Create packages/table/src/execution/cpu/callback.ts
- Create packages/table/src/execution/async-executor.ts
- Create packages/table/src/execution/sync-executor.ts
- Create packages/table/src/__tests__/callbacks-async.test.ts

**Steps**

1. Materialize rows before invoking callbacks and rebuild typed batches after them.
2. Report callback barriers and temporary allocations in explain output.
3. Preserve input progress semantics when a callback throws.
4. Test fragmented async sources, backpressure, early consumer return, abort, and callback source privacy.

### Task 12: Add Optional Compute Lowering

**Files**

- Create packages/table/src/backend/compute-contract.ts
- Create packages/table/src/backend/partition.ts
- Create packages/table/src/backend/compute-adapter.ts
- Create packages/table/src/__tests__/compute.test.ts

**Steps**

1. Define `TableComputeBackend` in the root without importing the optional peer and implement `computeBackend(runtime)` in `/compute` against the real `@stopcock/compute` public API.
2. Lower only semantically identical numeric/bool fused expressions into versioned `KernelProgram` values; use separate kernels for selection, values, and validity outputs required by Compute's single-output contract.
3. Adapt compatible column buffers to rank-one `TensorView` inputs, insert explicit copy/transfer/materialization nodes where layouts differ, and rebuild immutable vectors only after the full batch succeeds.
4. Cache compiled kernels by expression/schema/dtype/shape and include every Compute report, fallback, transfer, and per-batch kernel count in Table explain/instrumentation output.
5. Run the same oracle suite with a deterministic fake `TableComputeBackend` and the real Compute runtime when available.
6. Prove unsupported and callback segments remain CPU and prove Table never calls an invented `executeTableSegment`-style runtime method.

### Task 13: Implement Incremental CSV, JSON, and NDJSON

**Files**

- Create packages/table/src/io/text/chunks.ts
- Create packages/table/src/io/csv/parser.ts
- Create packages/table/src/io/csv/writer.ts
- Create packages/table/src/io/json/framer.ts
- Create packages/table/src/io/json/parser.ts
- Create packages/table/src/io/json/writer.ts
- Create packages/table/src/__tests__/csv-json.test.ts

**Steps**

1. Implement bounded incremental framing and streaming UTF-8 decode.
2. Convert fields through schema-aware scalar parsers and builders.
3. Implement deterministic, precision-safe writers.
4. Test every byte split for quoted CSV, escaped JSON, CRLF, and multi-byte UTF-8 fixtures.
5. Add malformed, truncated, over-limit, BOM, custom delimiter, header, and schema-inference cases.

### Task 14: Implement Arrow Layout Mapping and FlatBuffers Metadata

**Files**

- Create packages/table/src/io/arrow/layout/*
- Create packages/table/src/io/arrow/flatbuffers/reader.ts
- Create packages/table/src/io/arrow/flatbuffers/writer.ts
- Create packages/table/src/io/arrow/flatbuffers/arrow-schema.ts
- Create packages/table/src/io/arrow/metadata.ts
- Create packages/table/src/__tests__/arrow-layout.test.ts

**Steps**

1. Map every Columnar Format 1.5 type to internal buffers and children.
2. Preserve schema, field, dictionary, extension, endianness, and variadic-buffer metadata.
3. Implement checked FlatBuffers reads/writes for Schema, RecordBatch, DictionaryBatch, Footer, Tensor, and SparseTensor messages.
4. Add malformed vtable, vector, union tag, recursion, and range fixtures.

### Task 15: Implement Arrow IPC Stream and File Readers/Writers

**Files**

- Create packages/table/src/io/arrow/ipc/framing.ts
- Create packages/table/src/io/arrow/ipc/stream-reader.ts
- Create packages/table/src/io/arrow/ipc/stream-writer.ts
- Create packages/table/src/io/arrow/ipc/file-reader.ts
- Create packages/table/src/io/arrow/ipc/file-writer.ts
- Create packages/table/src/io/arrow/ipc/dictionaries.ts
- Create packages/table/src/__tests__/arrow-ipc.test.ts

**Steps**

1. Implement fragmented incremental stream framing and EOS handling.
2. Implement random-access and byte-array file reads plus footer validation.
3. Implement dictionary replacement/deltas according to stream/file rules.
4. Implement endian conversion and zero-copy/copy policy.
5. Test arbitrary input fragmentation, alignment padding, legacy prefix, empty streams, dictionary order, overlapping blocks, truncation, and oversized lengths.

### Task 16: Implement In-Repo LZ4 Frame and Zstandard

**Files**

- Create packages/table/src/io/arrow/compression/lz4/*
- Create packages/table/src/io/arrow/compression/zstd/*
- Create packages/table/src/io/arrow/compression/registry.ts
- Create packages/table/wasm/compression/*
- Create packages/table/scripts/build-compression-wasm.ts
- Create packages/table/src/__tests__/compression.test.ts

**Steps**

1. Implement TypeScript reference decoders and deterministic encoders.
2. Implement first-party WASM equivalents from checked-in source.
3. Add lazy loading and transparent fallback.
4. Differentially test TS and WASM against official codec CLI golden files and Arrow IPC fixtures.
5. Fuzz frame headers, blocks, checksums, truncation, invalid references, zip-bomb ratios, and output caps.

### Task 17: Implement Extensions, Tensors, and Sparse Tensors

**Files**

- Create packages/table/src/io/arrow/extensions.ts
- Create packages/table/src/io/arrow/tensor.ts
- Create packages/table/src/io/arrow/sparse-tensor.ts
- Create packages/table/src/__tests__/arrow-extensions-tensors.test.ts

**Steps**

1. Preserve unknown extension metadata and implement codec registration.
2. Add canonical-extension fixtures without hardcoding semantic support for every canonical name.
3. Implement standalone dense and sparse tensor metadata/body roundtrip with 64-byte alignment.
4. Test COO, CSR, CSC, CSF, empty tensors, strides, dimension names, unknown extensions, and storage-only operations.

### Task 18: Build the Cross-Language Fixture Matrix

**Files**

- Create packages/table/fixtures/arrow/README.md
- Create packages/table/fixtures/arrow/manifest.json
- Create packages/table/scripts/generate-arrow-fixtures/*
- Create packages/table/src/__tests__/arrow-fixtures.test.ts

**Steps**

1. Check in small deterministic fixtures generated by at least PyArrow and Arrow Rust or Java.
2. Cover every supported layout, nested combination, dictionary mode, extension preservation, endian mode, file/stream framing, tensor kind, and LZ4/Zstd compression mode.
3. Record generator version, command, schema JSON, logical rows, and SHA-256 in the manifest.
4. Read external fixtures in Stopcock and read Stopcock-written files/streams in each external implementation in CI.
5. Keep generator dependencies outside package runtime dependencies.

### Task 19: Add Type Tests, Property Tests, Fuzzing, and Benchmarks

**Files**

- Create packages/table/src/__tests__/public-api.test-d.ts
- Create packages/table/src/__tests__/row-oracle.property.test.ts
- Create packages/table/src/__tests__/malformed.property.test.ts
- Create packages/table/bench/query.bench.ts
- Create packages/table/bench/io.bench.ts
- Create packages/table/bench/arrow.bench.ts
- Create packages/table/bench/baselines.json

**Steps**

1. Prove type inference for select, derive, group, aggregate, joins, windows, rename, and callbacks.
2. Generate random schemas, chunking, nulls, NaNs, and plans and compare against a deliberately simple row oracle.
3. Fuzz text framing, FlatBuffers, IPC framing, vector validation, and compression with strict allocation caps.
4. Benchmark scan/filter/derive fusion, group cardinalities, all joins, windows, CSV/NDJSON, Arrow file/stream, compression, and zero-copy versus copied reads.
5. Record CPU and Compute results separately and gate only stable, low-variance scenarios with a documented tolerance.

### Task 20: Documentation, Query Workbench, and Release

**Files**

- Create packages/table/README.md
- Create packages/table/docs/null-and-numeric-semantics.md
- Create packages/table/docs/arrow-compatibility.md
- Create packages/table/docs/execution-and-compute.md
- Create packages/table/examples/query-workbench/*
- Create a major Changeset only after all gates pass

**Steps**

1. Document every public signature, logical type mapping, inference rule, operator order guarantee, error, limit, and optional peer behavior.
2. Publish an Arrow compatibility table covering read, write, zero-copy, and semantic support by type and IPC structure.
3. Build Query Workbench with editable rows/CSV/NDJSON/Arrow input, AST-based query controls, explain output, CPU/Compute toggle, result table, and downloadable Arrow output.
4. Add examples for joins, windows, callback barriers, extension preservation, dictionaries, compressed IPC, and tensors.
5. Run the release gate, remove private, set the intended release version through Changesets, and verify the packed tarball.

## Exhaustive Verification Matrix

### Runtime tests

- Empty, one-row, multi-batch, zero-column, all-null, no-null, alternating-null, and bit-offset-slice inputs.
- Every primitive and nested type at boundary values.
- Every operator alone and in fused/multi-boundary pipelines.
- Every join with empty sides, duplicates, composite keys, nulls, NaNs, and name collisions.
- Row and range windows with every boundary form and peer pattern.
- Scalar, interpreted, compiled, CPU-only, and mixed-Compute differential results.
- CSV/JSON every-byte fragmentation plus malformed/over-limit inputs.
- Arrow official cross-language file/stream fixtures for every listed layout.
- Dictionary replacement/delta ordering; unknown/canonical extensions; Tensor and SparseTensor.
- LZ4/Zstd TS/WASM and external codec differentials.
- Big-endian bodies, misalignment, compressed buffers, explicit copy modes, and zero-copy eligibility.
- Cancellation and early iterator return at each asynchronous layer.

### Type tests

- Column names narrow through select/drop/rename.
- Derive and aggregate output records infer correctly.
- Join output and explicit selections infer nullability by join kind.
- Numeric/string/date builders reject incompatible expressions.
- Aggregate and window expressions cannot appear in invalid locations.
- Streaming constructors require schema.
- Optional Compute types are usable without loading the peer.

### Benchmark scenarios

- 1M-row numeric scan/filter/derive/project with fusion on and off.
- Group-by at 10, 10K, and 1M cardinality.
- One-to-one, one-to-many, highly duplicated, and skewed joins.
- Partitioned running and bounded windows.
- CSV, NDJSON, uncompressed Arrow, LZ4 Arrow, and Zstd Arrow throughput.
- Arrow aligned zero-copy versus endian swap, decompression, and misaligned copy.
- TypeScript compression fallback versus WASM.
- CPU reference versus supplied Compute runtime, including transfer cost.

## Release Gate

Do not publish 1.0 until all of the following are true:

1. bun run build:packages succeeds.
2. bun run test:packages succeeds with no skipped Table conformance suites.
3. Root lint and package type/declaration tests pass.
4. Packed-tarball smoke tests pass in clean Bun and Node projects with no optional peers installed.
5. The row oracle matches optimized CPU execution for the randomized corpus.
6. CPU and Compute results match for every lowerable expression/operator fixture.
7. Official cross-language Arrow fixtures pass in both directions for every supported layout, compression codec, dictionary mode, extension case, file/stream form, tensor, and sparse tensor.
8. Malformed and oversized corpora prove bounded allocation and stable error codes.
9. Query Workbench runs in CPU mode and, when supplied, Compute mode.
10. Benchmark results and machine details are checked in, with every regression beyond the agreed tolerance explained.
11. README and compatibility documentation make every limitation explicit.
12. @stopcock/synth remains absent from package dependencies, build/test scripts, CI matrices, Changesets, and release automation.

## Explicit 1.0 Non-Goals

- Disk spill, external merge sort, memory-mapped datasets, or distributed execution.
- Streaming joins or unbounded stateful windows.
- SQL text parsing.
- Parsing, compiling, or offloading arbitrary user callbacks.
- Implicit local-time timezone behavior.
- Semantic execution of an unknown Arrow extension without a codec.
- Treating standalone Tensor/SparseTensor messages as queryable record batches.
- Global Compute discovery or mandatory accelerator dependencies.

## Completion Evidence

The implementing worker must leave:

- a public API inventory mapped to source and tests;
- an operator/semantics conformance matrix;
- an Arrow compatibility matrix;
- the external fixture manifest and regeneration commands;
- explain snapshots showing fusion and every barrier class;
- benchmark baselines with machine/runtime metadata;
- packed-tarball smoke-test output;
- the final Changeset and exact release commands.
