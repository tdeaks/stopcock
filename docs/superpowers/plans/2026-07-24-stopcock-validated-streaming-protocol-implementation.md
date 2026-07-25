# Stopcock validated HTTP and streaming protocol implementation plan

> **Status:** proposed two-product workstream.
>
> **Product A:** validated HTTP client contracts.
>
> **Product B:** bounded NDJSON response streaming.
>
> Product A is independently releasable. Product B cannot begin until raw
> response ownership, honest transport errors, cancellation, and byte-stream
> limits are complete.

## Outcome

Replace asserted HTTP response generics with explicit endpoint contracts that
decode unknown data and return honest typed errors. Then extend the same
contract model to bounded NDJSON streams with:

- incremental UTF-8 decoding;
- bounded line framing;
- per-row Standard Schema validation;
- byte, line, and row coordinates;
- cancellation and reader cleanup;
- backpressure through `AsyncIter`;
- row-level diagnostics without retaining whole payloads.

The first releases are client-side. Server adapters, binary protocols,
schema-derived arbitrary fixtures, and generated redaction are later work
because opaque Standard Schema validators do not contain enough structure to
derive them safely.

## Current repository seams

- `@stopcock/http` eagerly parses `json`, `text`, `blob`, or `arrayBuffer` and
  casts the result to a caller-supplied generic.
- the declared `Task<T, HttpError<E>>` error channel does not fully model
  network, timeout, abort, parse, or user-transform failures;
- `@stopcock/async` Task carries cancellation, and `AsyncIter` supplies pull
  iteration plus sequential/bounded-concurrency transforms;
- `@stopcock/parser` accepts a complete UTF-16 string and has success/failure,
  not byte chunks or `NeedMore`;
- `@stopcock/fp/schema` implements Standard Schema interoperability and
  validation but no structural schema AST, encoder, generator, or redaction
  model;
- the planned Table package already owns complete CSV/JSON/NDJSON table
  ingestion and bounded text framing. Shared primitives should be factored only
  after there are two real consumers.

## Explicit exclusions

- No generic return type accepted without a decoder.
- No automatic client/server code generation from TypeScript types.
- No server framework adapters in the first release.
- No fixture/arbitrary generation from opaque Standard Schema.
- No inferred redaction rules.
- No unbounded body, line, row, issue, or diagnostic accumulation.
- No buffering an entire NDJSON response before yielding rows.
- No arbitrary binary framing in Product B.
- No retry after streaming rows have become externally visible.
- No dependency on Table merely to parse an HTTP NDJSON response.

## Product A — validated HTTP client contracts

### Raw response seam

Add a transport-level API that does not consume the body:

```ts
export type TransportError =
  | NetworkError
  | TimeoutError
  | AbortError
  | RequestConstructionError

export interface RawHttpResponse {
  readonly status: number
  readonly statusText: string
  readonly headers: Headers
  readonly response: Response
}

export interface RawTaskMethods {
  request(
    request: ResolvedRequest,
  ): Task<RawHttpResponse, TransportError>
}
```

Rules:

- response ownership transfers to the successful caller;
- hooks cannot consume the body and then pretend it remains available;
- timeout and caller abort remain distinguishable and preserve their cause;
- fetch/XHR implementation differences normalize into the same stable error
  union;
- retries happen only before body consumption and according to explicit
  idempotency policy;
- a raw response is consumed or cancelled exactly once.

### Endpoint descriptor

```ts
export interface EndpointDefinition<
  Path,
  Query,
  Headers,
  Body,
  Responses extends ResponseMap,
  DomainError,
> {
  readonly format: "stopcock.http.endpoint"
  readonly version: 1
  readonly id: string
  readonly method: HttpMethod
  readonly path: PathTemplate<Path>
  readonly query?: InputCodec<Query>
  readonly headers?: InputCodec<Headers>
  readonly body?: BodyCodec<Body>
  readonly responses: Responses
  readonly domainError?: DomainErrorDecoder<DomainError>
  readonly limits?: EndpointLimits
  readonly redaction?: ExplicitRedactionPolicy
}
```

The descriptor is partly data and partly explicit runtime capability:

- method, path template, status map, body kind, limits, and IDs are data;
- Standard Schema validators and encoders are caller-supplied functions;
- no hash claims to capture opaque function behavior;
- `id + version` is caller-owned contract identity;
- examples/fixtures are explicitly supplied, not generated from validators.

### Status-specific response map

```ts
const getUser = endpoint({
  id: "users.get",
  method: "GET",
  path: "/users/:id",
  responses: {
    200: json(userSchema),
    404: json(notFoundSchema, { kind: "domain-error" }),
  },
})
```

Rules:

- every accepted status has an explicit decoder;
- an unlisted status returns `UnexpectedStatusError` with bounded sanitized
  body preview only when configured;
- `204`/`HEAD` have explicit empty-body codecs;
- JSON content type is checked according to a documented strict/compatible
  policy;
- malformed JSON and schema rejection are separate errors;
- decoder issues preserve paths but obey count/depth limits;
- the body cannot be decoded twice.

### Honest result type

```ts
export type EndpointError<DomainError> =
  | TransportError
  | HttpStatusError
  | UnexpectedStatusError
  | BodyReadError
  | JsonSyntaxError
  | DecodeError
  | DomainError

export function call<E extends AnyEndpoint>(
  client: ContractClient,
  endpoint: E,
  input: EndpointInput<E>,
): Task<EndpointOutput<E>, EndpointFailure<E>>
```

All thrown transport/body/decoder failures are caught at the boundary and
normalized. User callbacks invoked outside the endpoint contract are not
falsely included in the typed error union.

## Product B — bounded NDJSON streaming

### Stream result model

The request/status phase returns a Task. Successful body iteration returns an
`AsyncIter`:

```ts
export interface NdjsonResponse<Row> {
  readonly status: number
  readonly headers: Headers
  readonly rows: AsyncIter<Result<Row, RowDecodeError>>
  cancel(reason?: unknown): Promise<void>
}

export function stream<E extends NdjsonEndpoint>(
  client: ContractClient,
  endpoint: E,
  input: EndpointInput<E>,
): Task<NdjsonResponse<EndpointRow<E>>, EndpointOpenFailure<E>>
```

Row schema errors are values so callers may stop, collect, or continue according
to endpoint policy. Transport/read/framing errors terminate the iterator.

### Byte source and backpressure

- Acquire `Response.body` and one reader only after status validation.
- Pull one chunk only when the downstream iterator requests progress.
- Never call `response.text()` or concatenate the complete body.
- Cancellation invokes `reader.cancel(reason)` and releases the lock in
  `finally`.
- Early consumer return closes the reader.
- A missing body on a streaming success status is an explicit error.
- Browser `ReadableStream<Uint8Array>` is adapted to `AsyncIter` without
  platform globals leaking into unrelated package entrypoints.

### UTF-8 and line framing

Use `TextDecoder("utf-8", { fatal: true })` in streaming mode:

- preserve partial multi-byte sequences across chunks;
- optionally accept one UTF-8 BOM at byte zero;
- recognize LF and CRLF, including CRLF split across chunks;
- define whether a final line without newline is accepted;
- reject malformed UTF-8 with byte offset;
- count offsets in original bytes, not UTF-16 code units;
- permit configured empty-line handling;
- parse each bounded completed line with `JSON.parse`;
- never allow one line to exceed `maxLineBytes`.

Default limits are conservative and explicit:

```ts
export interface NdjsonLimits {
  readonly maxTotalBytes: number
  readonly maxLineBytes: number
  readonly maxRows: number
  readonly maxIssuesPerRow: number
  readonly maxDiagnosticPreviewBytes: number
}
```

Length checks happen before buffer growth.

### Row diagnostics

```ts
export interface RowDecodeError {
  readonly kind: "json-syntax" | "schema"
  readonly row: number
  readonly byteStart: number
  readonly byteEnd: number
  readonly issues: readonly StandardSchemaIssue[]
  readonly preview?: string
}
```

Previews are disabled by default, bounded when enabled, decoded safely, and
passed through explicit redaction. No error retains the whole response,
reader, or original byte buffer.

### Stream retry policy

- Opening a request may use ordinary idempotent retry before a successful
  response is returned.
- Once the first row or row error is yielded, automatic retry is disabled.
- Resumption requires an endpoint-specific cursor/range contract and is outside
  the first release.
- A caller can create a new request explicitly.

## Shared framing ownership

Do not prematurely create a generic streaming-parser package.

Decision rule:

1. if Table's incremental text framing is not implemented, keep the NDJSON
   framer private to HTTP;
2. if both Table and HTTP have passing independent implementations, compare
   semantics and extract only the common byte-source, UTF-8, and bounded-line
   primitives;
3. the extracted home may be `@stopcock/parser/stream`, but only with no
   dependency on HTTP or Table;
4. CSV state machines and Table row/schema conversion remain Table-owned;
5. HTTP status, body ownership, and endpoint diagnostics remain HTTP-owned;
6. extraction must preserve both consumers' fixture corpora and bundle
   boundaries.

## Redaction and fixtures

Standard Schema cannot infer sensitive fields. Endpoint contracts therefore
accept explicit:

- request header/query/body redaction paths;
- response diagnostic redaction paths;
- safe header allowlist;
- bounded examples and fixtures;
- round-trip pairs only where an explicit encoder and decoder both exist.

Defaults fail closed:

- authorization, cookie, set-cookie, and proxy-auth headers never appear;
- body previews are disabled;
- unknown structured fields are omitted from diagnostics;
- receipt/log output contains endpoint ID and status, not URL query values.

## Contract checking and receipts

The optional compiler/check integration may:

- validate duplicate endpoint IDs and impossible status maps;
- confirm path parameters are supplied;
- emit endpoint descriptor/version/source hashes;
- report explicit decoders, limits, and redaction presence;
- link fixture/law results produced by a separate test command.

It may not:

- prove an opaque Standard Schema is correct;
- generate fixtures from it;
- claim a network call occurred at build time;
- include secret request/response data.

## Implementation phases

### Phase 0 — Freeze current HTTP behavior and error leaks

1. Add fixtures for network rejection, timeout, abort, non-2xx status, invalid
   JSON, transform throw, consumed body, and retry.
2. Identify every current cast into `Task<T, HttpError<E>>`.
3. Freeze compatibility behavior for existing unvalidated methods.

**Gate:** new contract work can coexist with existing APIs without silently
changing their behavior.

### Phase 1 — Add raw response ownership and honest errors

1. Implement raw Task transport.
2. Normalize fetch/XHR errors.
3. Separate timeout and caller abort.
4. Make response/body ownership and retry phases explicit.

**Gate:** every failure fixture reaches the documented discriminated branch and
no response body is consumed unexpectedly.

### Phase 2 — Implement endpoint descriptors and JSON decoding

1. Add path/query/header/body input codecs.
2. Add status-specific JSON/empty/text response codecs.
3. Integrate Standard Schema validation with bounded issues.
4. Return exact endpoint output/error types.

**Gate:** compile-time type tests and runtime unknown-data fixtures agree; no
generic assertion path exists in the contract API.

### Phase 3 — Add explicit redaction, fixtures, and contract tests

1. Implement fail-closed diagnostic redaction.
2. Add manually supplied examples and round-trip laws where codecs exist.
3. Add endpoint ID/version manifests and duplicate detection.
4. Add contract-check receipt integration.

**Gate:** test/log snapshots contain no configured secret values.

### Phase 4 — Implement byte source and NDJSON framing

1. Adapt response readers to cancellable pull-based `AsyncIter`.
2. Implement fatal streaming UTF-8 and bounded LF/CRLF framing.
3. Add byte/row coordinates and all allocation limits.
4. Parse bounded lines and validate rows.

**Gate:** arbitrary chunk fragmentation produces the same rows/coordinates as
the single-buffer reference and never exceeds configured buffering.

### Phase 5 — Harden stream lifecycle

1. Test early return, explicit cancel, abort, read failure, row-policy stop, and
   consumer throw.
2. Release reader locks/listeners in every path.
3. Enforce no retry after first yield.
4. Add slow-consumer backpressure tests.

**Gate:** no lifecycle path leaks a reader, continues pulling after stop, or
emits a row after cancellation.

### Phase 6 — Decide shared parser extraction

Compare live Table and HTTP framing implementations using their full fixture
sets. Extract only when it reduces duplication without merging ownership or
inflating unrelated entrypoints.

### Phase 7 — Documentation and release

1. Document validated JSON endpoints first.
2. Document streaming as a separate capability and failure model.
3. Add Node, Bun, and browser examples.
4. Pack/test root, contract, and stream subpaths with bundle-isolation checks.

## Test matrix

- every HTTP method and path/query/header encoding edge;
- network, timeout, abort, status, body read, JSON syntax, schema, and domain
  errors;
- 204, HEAD, empty, wrong content type, and unknown statuses;
- retry before response and no retry after stream visibility;
- UTF-8 ASCII/multibyte/BOM/malformed/truncated sequences;
- LF, CRLF, split CRLF, empty lines, and final unterminated line;
- every line/total/row/issue/preview limit;
- arbitrary chunk fragmentation from one byte per chunk upward;
- schema success/failure and bounded issues;
- early iterator return, cancel, abort, reader error, consumer throw, and
  missing body;
- redaction of headers, paths, and previews;
- Node, Bun, real browser, packed ESM, declaration, and tree-shaking tests.

## Acceptance criteria

- Validated endpoints never trust a caller-supplied response generic.
- The Task error union honestly includes transport, status, read, syntax,
  decode, and domain failures.
- Raw response ownership is explicit and single-consumer.
- NDJSON processing is incremental, bounded, pull-based, and cancellable.
- Per-row errors contain coordinates and bounded diagnostics, not whole data.
- No automatic retry occurs after visible stream output.
- Standard Schema remains an interoperability protocol, not misrepresented as
  a generative schema AST.
- Server adapters, binary framing, generated fixtures, and inferred redaction
  stay out until separately designed.
- Existing unvalidated HTTP APIs remain available through a documented
  compatibility window.

## Rollback

Product A and Product B are separately revertible. A failed streaming slice
does not block validated JSON contracts. Existing asserted-generic methods stay
untouched until a migration and major-version decision. Never recover by
buffering the whole stream, weakening limits, or casting decode failures into a
narrower error type.
