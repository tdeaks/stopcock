# Stopcock FP absolute-performance implementation plan

> **Status: superseded.** The FP 2.0 implementation completed on 2026-07-23
> deliberately removed runtime JIT compilation, root namespace bundles, and
> `Stream`. The supported architecture is portable runtime compilation plus
> optional build-time lowering through `@stopcock/fp-compiler`. Keep this
> document as design history only; do not execute its remaining workstreams.

## Outcome

Ship a staged @stopcock/fp 1.x performance program that approaches hand-written fused-loop ceilings while retaining deterministic default semantics, a tidy application-facing API, CSP safety, bounded memory, and credible cross-engine benchmark evidence.

Application code imports only @stopcock/fp. Typed arrays are first-class inputs to the existing A namespace; they are not exposed through FP.typed, T, /typed, or /jit entrypoints. Advanced backends are root-level asynchronous compiler functions which lazily load an internal JIT chunk or the optional @stopcock/compute peer:

    import {
      A,
      M,
      N,
      compile,
      compilePure,
      compileJit,
      compileSimd,
      compileParallel,
      flow,
      pipe,
    } from '@stopcock/fp'

    const steps = [
      A.map(M.mul(2)),
      A.filter(N.gt(0)),
      A.take(100),
    ] as const

    const portable = compile(...steps)
    portable([1, 2, 3])                    // number[]
    portable(new Float32Array([1, 2, 3]))  // Float32Array

    const jit = await compileJit(...steps)
    const simd = await compileSimd({ math: 'fast' }, ...steps)
    const parallel = await compileParallel({ math: 'fast' }, ...steps)

Typed-array acceptance in this example is the 1.2.0 end state; compile handles ordinary arrays until Milestone 4 lands.

The build compiler remains a separate development dependency, @stopcock/fp-compiler, with a native-WASM SWC companion. It rewrites ordinary @stopcock/fp call sites; application source does not import either compiler package.

This plan supersedes the 2026-06-28 FP performance-loss remediation plan.

## Scope commitment

- Milestones 0 through 2 are committed work and close every measured hotspot.
- Milestones 3 and 4 are planned and start only after 1.0.0 stable ships.
- Milestones 5 and 6 are contingent proposals: they require @stopcock/compute to pass its own 1.0 gates and demonstrated demand, and they build no execution machinery of their own.
- Stopping after Milestone 2 leaves a coherent, shippable package.

## Non-negotiable decisions

- Exact semantics are the default everywhere, including eager A reductions over typed arrays. Callback-eliding, traversal-reordering, and algebraic rewrites require compilePure, assumePure, or an explicit fast-math backend option.
- The root portable executor never contains or evaluates dynamic JavaScript.
- compileJit dynamically imports the internal JIT chunk once, then returns a synchronous runner. It accepts arbitrary callbacks. When dynamic code is blocked it throws a named JitUnavailableError, or resolves to the portable runner when onUnavailable is 'fallback'.
- compileSimd dynamically imports the optional @stopcock/compute peer once and executes through its WASM backend, then returns a synchronous typed-array runner. It accepts closed tagged numeric operations only. @stopcock/fp ships no WASM artifact of its own.
- compileParallel dynamically imports @stopcock/compute's browser or Node worker pool, then returns an asynchronous runner. It accepts closed tagged numeric operations only. @stopcock/fp ships no worker implementation of its own.
- The package exposes no process-global fusion mode. Backend and purity selection are captured by each compiled runner.
- Tier-one engines are Node, Bun, Deno, Chromium, Firefox, and WebKit.
- Scalar typed support covers all twelve numeric constructors: Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, Float16Array, Float32Array, Float64Array, BigInt64Array, and BigUint64Array.
- Fast float math applies only where an explicit backend documents it: compilePure plans and the compileSimd/compileParallel default of math: 'fast'. Eager A reductions and portable compile evaluate floats exactly, left-to-right. Fast-math chunk and lane geometry is a pure function of input length and element width, never of worker count, so fast results are reproducible across machines.
- SIMD and worker execution are staged accelerators and never activate implicitly for arbitrary callbacks.
- Full validation and benchmark matrices run only on isolated CI hardware. Developer-laptop commands are focused, sequential, and bounded.
- Commit the in-flight Vite Plus migration before Milestone 0 starts so this plan begins from a clean tree. Never reset, reformat, or rewrite unrelated files.

## Current evidence and priority order

Treat the existing reports as diagnostic input, not publishable proof:

- The report header states 174/314 Stopcock wins while the physical comparison rows produce 174/310; four of those rows are public render() path pseudo-competitors, not libraries.
- The measured one-million-element subset is 42/66 Stopcock wins against library peers: 69 measured rows minus 3 native-loop baseline rows.
- Most large-scale rows are projected. Projections may guide investigation but may never support a public claim or release gate.
- The nominal Bun benchmark lane currently passes through a Node-shebang executable, so it is not a genuine Bun/JSC result.
- Report shell pipelines can mask failures, and three suites have produced parse or competitor-fixture failures.

Measured hotspot order:

1. without, roughly 1.97x behind at one million elements.
2. chunk, roughly 1.84x behind at one million elements.
3. Stream, roughly 1.76x to 2.05x behind, measured at 1K to 100K; the one-million row is projected.
4. filterMap followed by take, roughly 1.56x to 1.70x behind, measured at 1K to 100K; the one-million row is projected.
5. reverse, roughly 1.48x behind at one million elements.

Keep object, lens, equality, and successful early-exit cases as permanent regression sentinels.

## Public runtime contract

### Existing collection vocabulary

A remains the only eager collection namespace. Extend its overloads and runtime dispatch rather than creating a typed namespace.

Fixed-width and filtering operations preserve the input constructor:

- A.map, A.filter, A.reject, A.scan
- A.take, A.drop, A.takeWhile, A.dropWhile
- A.reverse, A.uniq, A.sort, A.sortBy
- A.zipWith when both inputs and the output constructor are compatible

Structural or expanding operations retain their natural structural result:

- A.flatMap over a typed input returns an ordinary Array because the output width and constructor are not knowable.
- A.chunk over a typed input returns an Array of same-constructor typed-array chunks.
- Grouping and partitioning retain their existing tuple, object, or Array containers.

Add explicit constructor-changing and allocation-aware operations:

    A.mapTo(source, Float64Array, fn)
    A.zipWithTo(left, right, Float32Array, fn)
    A.mapInto(source, target, fn, offset?)
    A.filterInto(source, target, predicate, offset?)
    A.scanInto(source, target, reducer, initial, offset?)
    A.takeView(source, count)
    A.dropView(source, count)

Rules:

- Owning operations never mutate or alias their input.
- takeView and dropView alias the source explicitly; nothing else carries the View name.
- There is no filterView: a no-shrink-copy filter is A.filterInto into a caller-owned buffer plus subarray.
- Into operations return the written element count, not a result object.
- Capacity and overlap checks complete before any callback executes.
- An exact same-range source and destination is supported for one-to-one transforms and stable forward filter compaction.
- Distinct partially overlapping views throw RangeError.
- mapTo and zipWithTo are the only implicit constructor-change points; Number and BigInt conversion still requires a callback returning the destination element type.
- mapTo and zipWithTo also exist as tagged data-last steps for pipe and compile. Into and View operations are eager-only and never appear in compiled plans.

### Compilation API

Portable compilation:

    compile(...steps): Runner
    compilePure(...steps): Runner

- Both plan and bind once.
- compile uses exact semantics.
- compilePure opts callbacks into the pure transformation contract.
- The runner specializes on first input-domain encounter and keeps a bounded polymorphic cache; per-typed-constructor specialization activates when Milestone 4 lands.
- flow delegates to the same planner at every arity.
- pipe uses allocation-free direct dispatch for common arities and the shared shape cache for repeated dynamic calls.

Lazy backends:

    compileJit(options?, ...steps): Promise<Runner>
    compileSimd(options, ...steps): Promise<TypedRunner>
    compileParallel(options, ...steps): Promise<AsyncTypedRunner>

compileJit options:

    interface JitCompileOptions {
      readonly assumePure?: boolean
      readonly onUnavailable?: 'throw' | 'fallback'
    }

onUnavailable defaults to 'throw'; 'fallback' resolves to the portable runner with identical exact semantics.

compileSimd options:

    interface SimdCompileOptions {
      readonly math?: 'fast' | 'strict'
      readonly backend?: 'auto' | 'simd'
    }

compileParallel options:

    interface ParallelCompileOptions {
      readonly math?: 'fast' | 'strict'
      readonly backend?: 'auto' | 'js' | 'simd'
      readonly parallelism?: 'auto' | number
      readonly maxQueued?: number
    }

- compileJit and compileSimd return synchronous runners after one-time asynchronous preparation.
- compileParallel returns a runner whose invocations return Promise results.
- compileSimd and compileParallel reject untagged callbacks during compilation with an UnsupportedKernelOperationError naming the first unsupported step.
- backend: simd throws a named error when @stopcock/compute is absent or SIMD validation fails. backend: auto uses the best checked-in eligible backend and otherwise uses scalar JS, including when compute is not installed.

### Explanation and diagnostics

Replace the old global mode API with:

    explainPipeline(...steps): PipelineExplanation
    getOptimizerStats(): Readonly<OptimizerStats>
    resetOptimizerStats(): void

Explanation includes domains, segments, materialization boundaries, exact or pure semantics, selected executor, typed-constructor specialization, tier state, and accelerator eligibility. Stats are diagnostic only and cannot alter execution.

Migration:

- setFusionMode('no-jit') becomes the normal root compile, flow, and pipe APIs.
- setFusionMode('jit') becomes await compileJit(...steps).
- getFusionMode is removed.
- explainFusion becomes explainPipeline; getFusionStats and resetFusionStats become getOptimizerStats and resetOptimizerStats.
- Existing runtime subpath imports migrate to root namespaces or named exports. This removes the sixteen current subpaths, which 0.0.x semver permits; update the eight-package roadmap's blanket API-compatibility statement to match.

## Canonical optimizer architecture

### Operation registry

Create one canonical operation registry which generates:

- runtime operation identifiers and metadata;
- tagged scalar and collection helpers;
- portable/AOT lowering tables;
- JIT lowering tables;
- build-compiler recognition tables;
- TypeScript closed-kernel definitions and @stopcock/compute lowering tables;
- documentation tables.

Every entry declares:

- input and output domain: Array, typed array, iterable, or scalar;
- cardinality: one-to-one, filtering, expanding, stateful, sink, or materializer;
- callback arity and argument bindings;
- early-termination behavior;
- constructor-preservation behavior;
- sparse-hole behavior;
- reverse safety;
- exact and pure lowering permissions;
- SIMD and worker eligibility.

Add a non-writing codegen check. CI fails if generated TypeScript, declarations, Rust definitions, or documentation differ from the canonical registry.

### Plan IR

    interface PlanShape {
      readonly codes: readonly OpCode[]
      readonly segments: readonly SegmentShape[]
    }

    interface BoundPlan {
      readonly shape: PlanShape
      readonly bindings: readonly unknown[]
    }

- Segment at every real domain transition and materialization boundary.
- Normalize nested tagged callbacks once.
- Use collision-free tuple or trie shape keys.
- Build a deliberately simple reference interpreter as the semantic oracle.
- Lower the reference Plan into one shared control-flow form consumed by portable AOT, runtime JIT, build compiler, Stream, and typed scalar execution.
- Delete all Function-to-string and regex callback parsing.

### Exact and pure behavior

Exact execution:

- Processes streamable operations left-to-right per accepted item.
- Treats arrays as dense: holes read as undefined and callbacks execute for them, identically in every lowering.
- Preserves argument evaluation, callback order, callback count, and the first thrown error except for documented short-circuiting operations.
- Never eliminates map or tap callbacks merely because a later terminal does not consume their values.
- Uses full stable sort when comparator invocation is observable.
- Evaluates preceding callbacks in forward order before materializing reverse, sort, join, or grouping.

Pure execution may:

- eliminate unused callback stages;
- traverse direction-safe pipelines backwards;
- stop as soon as enough unique or flattened values exist;
- replace sort followed by take with stable bounded top-k;
- reassociate closed numeric reductions according to their math mode;
- change callback or comparator invocation count and order.

Stable top-k uses original source index as the final comparator tie-break.

### Runtime caches and tiering

- Add direct run2 through run5 paths so common pipe calls do not allocate an operator array.
- Use a four-entry polymorphic input/binding cache including every callback identity, bound constant, reducer initial value, and typed constructor.
- Store global callback metadata in WeakMap.
- Keep generated shape runners in a bounded 256-entry LRU.
- Generated runners accept bindings and never retain arbitrary callbacks in the shape cache.
- Remove shared mutable callback/argument buffers so reentrant pipe calls are safe.
- Runners returned by compileJit interpret first and promote to generated code at eight executions or 4,096 processed elements. Portable compile, flow, and pipe runners never promote to dynamic code.
- Calibrate and check in separate V8, JSC, and SpiderMonkey threshold tables. Select the table from process.versions.v8, Bun.version, and Deno.version on servers and a cached one-time Error-stack-format probe in browsers; never solely typeof Bun. Ambiguous detection uses the V8 table.

## Milestone 0: semantic stabilization and benchmark truth

- [ ] Commit the in-flight Vite Plus migration so plan work starts from a clean tree.
- [ ] Provision the dedicated perf runners, or check in the interim single-machine profile that stands in until they exist; without one of the two, the performance release gates cannot run and releases stay blocked.
- [ ] Add focused regression tests for every currently confirmed optimizer failure.
- [ ] Fix generated data-first forEach and forEachWithIndex fallthrough in the generator, then regenerate.
- [ ] Remove arbitrary callback-source inlining.
- [ ] Include every bound argument in plan identity.
- [ ] Correct array-to-terminal-to-scalar and materializer-to-array segmentation.
- [ ] Fix no-JIT filter-to-sum.
- [ ] Fix AOT flatMap-to-take cardinality.
- [ ] Fix flatMap early termination across outer and inner iterators.
- [ ] Fix tagged scalar flow chains at all supported arities.
- [ ] Remove broken hand-written AOT patterns until the shared lowerer replaces them.
- [ ] Replace report text parsing with a raw JSON schema.
- [ ] Fail reports on missing, duplicate, skipped, invalid, or non-finite rows.
- [ ] Correct measured denominators and label projected data as non-evidence.
- [ ] Make each runtime assert its executable and engine identity from inside the benchmark process.

Exit gate:

- Focused reference, portable, current AOT, JIT, and Stream regression cases agree.
- Report generation propagates every child-process failure.
- No public performance claim uses a projected row.

## Milestone 1: Plan IR and portable 1.0 runtime

- [ ] Implement the registry, PlanShape, BoundPlan, and semantic interpreter.
- [ ] Retire the ReScript layer: the registry replaces codegen/defs and the parsed .res.js bodies as the sole source of truth. Port the remaining ReScript-only operation bodies to TypeScript, then delete the .res, .res.js, and .gen.tsx files, the lib/ build cache, the stale rescript.json, and the @rescript/runtime devDependency. Until deletion, the ReScript sources are read-only inputs.
- [ ] Implement shared control-flow lowering and terminal sinks.
- [ ] Stream flatten and uniq without intermediates.
- [ ] Keep join, general reverse, general sort, and regrouping as explicit boundaries.
- [ ] Implement root compile, compilePure, explainPipeline, and optimizer statistics.
- [ ] Make flow delegate to compilation at every arity.
- [ ] Add direct pipe arity paths and bounded caches.
- [ ] Implement internal lazy JIT loading behind root compileJit.
- [ ] Remove global fusion configuration and publish the migration guide.

Hot-kernel work:

- [ ] without: unrolled SameValueZero checks through eight exclusions, calibrated linear checks above that, and Set beyond the crossover. Exact mode rebuilds membership when mutable exclusions can change; pure immutable plans may hoist it.
- [ ] chunk: select push versus preallocation from engine-specific measurements.
- [ ] reverse: select manual copy, slice/reverse, or toReversed once per engine.
- [ ] filterMap-to-take: emit one loop with immediate outer termination.
- [ ] tiny math, head, and last: provide monomorphic data-first kernels.

Exit gates for n at least 1,024:

- Warm JIT reaches at least 80% geometric mean of equivalent hand-written fused loops, with no case below 70%.
- Portable execution reaches at least 60%, with no case below 50%.
- Warm compiled calls allocate only their required result.
- Root cold import and minified/gzip bundle growth is tracked and reported; the 5% budget is enforced at Milestone 3, once the legacy Stream machinery this milestone must coexist with is deleted.

## Milestone 2: build-time compiler and first stable release

Create @stopcock/fp-compiler with:

    transformStopcockPipelines(code, id, options)
    stopcockFp(options)

Options:

    interface StopcockCompilerOptions {
      readonly include?: FilterPattern
      readonly exclude?: FilterPattern
      readonly importSources?: readonly string[]
      readonly assumePure?: boolean
      readonly diagnostics?: false | 'summary' | 'verbose' | 'error'
    }

Stable JavaScript adapters, all provided by one unplugin implementation rather than per-host code:

- Vite and Vite Plus
- Rollup and Rolldown
- webpack 5
- Rspack and Rsbuild
- esbuild
- Farm

Bun build and Babel adapters are deferred past compiler v1. Publish @stopcock/fp-compiler-swc as the native Rust/WASM SWC transform. Raw SWC is stable; Next integration remains explicitly experimental while the host plugin facility is experimental. Parcel, Metro, plain tsc, and unconfigured direct execution are not v1 compiler adapters.

Compiler requirements:

- [ ] Resolve imports and lexical bindings instead of identifier spelling.
- [ ] Support aliases, namespaces, root imports, existing namespace calls, pipe, flow, compile, and standalone data-first calls.
- [ ] Evaluate source and step arguments once, left-to-right.
- [ ] Preserve closures, this, exceptions, sparse inputs, source maps, and comments.
- [ ] Inline only simple synchronous callbacks without this, arguments, super, await, yield, defaults, or destructuring.
- [ ] Leave unsupported pipelines unchanged and report the reason according to diagnostics.
- [ ] Emit direct loops without runtime opcodes, planning, intermediate collections, or dynamic code.
- [ ] Generate TypeScript and Rust registries from the same canonical operation definitions.
- [ ] Run the same semantic fixture and property corpus through JavaScript and SWC transforms.
- [ ] Smoke-test Vite Plus, Rollup, webpack 5, and esbuild inside their real hosts; cover the remaining unplugin hosts with unplugin fixture tests.
- [ ] Pack-test runtime, JavaScript compiler, and SWC artifacts independently.

Exit gate for n at least 1,024: build-compiled loops reach at least 90% geometric mean of equivalent hand-written fused loops, with no case below 80%.

## Milestone 3: Stream unification

- [ ] Store transformations as persistent linked Plan nodes with O(1) append.
- [ ] Flatten and cache each immutable plan once.
- [ ] Keep execution state per iterator for replay and concurrent iteration.
- [ ] Route Array sources through their specialized Plan executors; typed-array sources join when Milestone 4 lands.
- [ ] Use a custom next state machine for generic iterables.
- [ ] Maintain an explicit stack for nested flatMap iterators.
- [ ] Integrate scan, chunk, distinct, distinctN, and intersperse as Plan nodes.
- [ ] Model range, repeat, and iterate as specialized sources.
- [ ] Keep zip and concat as source combinators.
- [ ] Fuse terminals directly into the executor.
- [ ] Invoke return on the source and every active inner iterator after early completion or error.
- [ ] Delete Stream's separate callback parser and JIT.

Add Stream.compile(...operators), returning a reusable Iterable-to-Stream function.

Exit gates:

- Array-backed Stream reaches at least 80% of the equivalent Array executor.
- Generic iterable Stream reaches at least 50%.
- Stream construction is O(k), execution creates no intermediate collections, and iterator closure is correct.
- Root cold import and minified/gzip bundle are within 5% of the pre-Milestone-1 baseline now that the legacy machinery is deleted.

## Milestone 4: automatic typed-array specialization

- [ ] Extend A overloads for all twelve numeric typed-array constructors.
- [ ] Dispatch once per compiled runner/input constructor and cache the specialization.
- [ ] Implement constructor-preserving owning operations.
- [ ] Implement mapTo, zipWithTo, Into, and View operations.
- [ ] Add alias, capacity, overlap, and pre-callback validation.
- [ ] Add a closed, immutable, serializable numeric Kernel IR derived from existing tagged A, M, and N operations; this is the lowering input compileSimd and compileParallel hand to @stopcock/compute.
- [ ] Reject Number/BigInt mixing before execution.
- [ ] Test Float16 types against TypeScript 6 and 7 declaration consumers.
- [ ] Add capabilities reporting and named errors for older runtimes missing Float16Array.

Numeric semantics:

- Native destination conversion applies after each output-producing pointwise stage.
- Float16 and Float32 closed pointwise stages round to their constructor precision after each stage.
- Arbitrary callbacks execute as JavaScript numbers and round when stored.
- Signed and unsigned integer stores wrap natively.
- Uint8ClampedArray follows native clamping and ties-to-even behavior.
- BigInt reductions are exact and return bigint.
- Integer reductions return number and retain normal safe-integer limits.
- Filtering remains stable.
- min and max propagate NaN and preserve negative-zero minimum and positive-zero maximum.

Fast reduction contract:

- Float16 epsilon is 2^-11, Float32 is 2^-24, and Float64 is 2^-53.
- For sum and dot, absolute error is bounded by gamma times the sum of absolute terms, where gamma = m epsilon / (1 - m epsilon) and m = 8 times ceil(log2(max(2, n))).
- Product uses the equivalent relative bound for finite normal results and matches the balanced-tree reference classification for NaN, infinity, zero, and sign.
- Strict mode evaluates reductions left-to-right and disables reassociated SIMD/parallel reductions.

Exit gates for n at least 1,024:

- Built-in and compiled scalar typed kernels reach at least 90% geometric mean of typed hand-written loops.
- Into operations reach at least 95%.
- Arbitrary callback plans reach at least 75%, with no case below 60%.
- No warm plan allocation and no temporary data buffer in Into operations.

## Milestone 5: SIMD through @stopcock/compute

@stopcock/fp builds no WASM artifact and no Rust kernels of its own. compileSimd lowers the closed Kernel IR from Milestone 4 to a @stopcock/compute program and executes it through compute's WASM backend, the same way table and vision consume compute in the eight-package roadmap.

- [ ] Add @stopcock/compute as an optional peer dependency, dynamically imported only by compileSimd and compileParallel.
- [ ] Lower closed tagged numeric plans to compute programs; never move arbitrary callbacks across the boundary.
- [ ] Reuse compute's persistent instance and scratch arena; do not instantiate or grow memory per warmed invocation.
- [ ] Route Float32, Float64, Int32, and Uint32 pointwise kernels and reductions first.
- [ ] Route narrow integer, clamped, and tail handling second.
- [ ] Route Float16 and BigInt vectorization only when each independently passes routing gates.
- [ ] Keep complete scalar JS support for every constructor, used whenever compute is absent or a cohort is unrouted.
- [ ] Include initialization, copy, memory-growth, and tail costs in crossover measurements.

An operation/constructor/size cohort enters backend: auto only when:

- median SIMD speedup over the best scalar JS backend is at least 15%;
- the paired 95% lower confidence bound is at least 8%;
- no routed size is more than 3% slower than JS.

Milestone acceptance:

- Server cohort geometric mean is at least 1.30x JS.
- Browser cohort geometric mean is at least 1.20x JS.
- At least one compute-heavy fused kernel reaches 1.50x on every canonical engine.
- Unsupported cohorts pass the full scalar gate and explain why SIMD was not selected.
- With @stopcock/compute absent, backend: auto passes the full scalar gate and backend: simd throws its named error; both are packed-consumer tested.

## Milestone 6: explicit parallel backend through @stopcock/compute

compileParallel delegates execution to @stopcock/compute's browser and Node worker pools. @stopcock/fp owns the semantic contract below and the lowering; it implements no worker protocol, transport, or pool of its own.

Worker invocation:

    const parallel = await compileParallel(
      {
        backend: 'auto',
        math: 'fast',
        parallelism: 'auto',
        maxQueued: 8,
      },
      ...steps,
    )

    const output = await parallel(source, {
      ownership: 'copy',
      signal,
    })

The runner also exposes runInto(source, target, options) for writing results into a caller-owned view. Ownership is mandatory:

- copy preserves caller ownership.
- move requires a view spanning its complete ArrayBuffer and detaches it.
- shared is accepted only by runInto with SharedArrayBuffer-backed source and target views.

Execution rules:

- [ ] Accept serializable closed kernels only; never serialize functions or use eval/blob source.
- [ ] Derive chunk geometry from input length and element width alone, never from worker count, so results are identical across machines.
- [ ] Implement stable filter as count, prefix-offset, and fill phases.
- [ ] Combine fast reduction partials in ascending chunk order with a balanced tree.
- [ ] Use one sequential worker for strict reductions.
- [ ] Return the semantically earliest find/some/every result, not the first worker response.
- [ ] Cancel queued work immediately.
- [ ] Use an atomic cancellation flag when shared memory is available.
- [ ] Without shared memory, suppress delivery after in-flight non-preemptive work completes.
- [ ] Keep the pool reusable after cancellation or worker replacement.
- [ ] Release all workers, listeners, and handles on close.

Default parallelism is min(4, max(1, availableParallelism - 1)), reduced by checked-in crossover tables. Automatic multi-worker routing requires a confidence-backed 10% win.

Prewarmed one-million-element compute-heavy gates, measured with ownership: move (shared for runInto); copy mode is tracked but exempt from the blocking gates:

- Server median speedup at least 1.50x with lower bound at least 1.20x.
- Browser median speedup at least 1.30x with lower bound at least 1.10x.
- Browser main-thread blocking p99 no more than 2 ms.
- Server event-loop delay p99 no more than 5 ms.
- Repeated execution has bounded memory and leaves no active handles after close.

## Benchmark and CI architecture

Make Tinybench 2.9.0 a direct exact dependency. Use a standalone runtime-neutral ESM runner rather than Vitest or wrapper shebangs.

Initial pinned runtime matrix:

- Node 24.18.0
- Bun 1.3.14
- Deno 2.8.1
- Playwright 1.60.0 browser revisions for Chromium, Firefox, and WebKit

Each benchmark row records:

- stable case ID and semantic group;
- implementation and baseline kind;
- exact or pure mode;
- Array/typed constructor and data shape;
- size, selectivity, match position, work units, and output cardinality;
- source, dist, or packed execution;
- construction, first-call, warm, or precompiled state.

Correctness checks, callback counts, mutations, and output checks occur outside timed regions. Seeded data and a result checksum prevent dead-code elimination.

Workload dimensions:

- Sizes 0, 1, 8, 100, 1K, 8K, 100K, 1M, and selected 10M; 8K straddles the 4,096-element promotion threshold so tier transitions are measured.
- Dense small integers, doubles, strings, uniform objects, polymorphic objects, sparse arrays, and all typed constructors.
- Selectivity 0%, 1%, 10%, 50%, 90%, and 100%.
- Match position first, 1%, midpoint, and absent.
- Inline, hoisted, compiled, alternating callbacks, and alternating shapes.
- Bounded output, full output, accessors, materializers, and scalar terminals.

Statistics:

- Five fresh-process paired ABBA rounds on performance PRs and fifteen nightly.
- At least one second warmup and two seconds measurement.
- Target relative margin of error no more than 2%; retry once, then reject above 3%.
- Overlapping confidence intervals report a tie.
- A regression fails when median is below 0.95x and the paired bootstrap 95% upper bound is also below 0.95x.
- Accept an optimization at at least 10% median improvement, lower bound above 3%, and no sentinel regression over 5%.
- Category geometric means may regress no more than 2%.

### Resource and OOM safety

- [ ] Add fp:test:local and fp:bench --profile smoke with one worker and sequential execution.
- [ ] Add fp:qualify, but refuse local execution unless CI=true or FP_ALLOW_FULL_MATRIX=1 is explicitly set.
- [ ] Execute one runtime, benchmark group, browser project, and property shard per child process, then exit.
- [ ] Stream raw JSON rows instead of retaining the complete matrix in memory.
- [ ] Close each browser before starting the next project.
- [ ] Use 100 deterministic generated cases locally, 1,000 per PR shard, 100,000 nightly, and one million aggregated weekly.
- [ ] Give dedicated perf-linux-x64 and perf-macos-arm64 runners concurrency one, fixed power settings, and no colocated jobs.
- [ ] Never run the monorepo-wide suite as FP verification. Run only changed-package tests, focused regressions, declaration tests, pack tests, and individual benchmark groups.

Required CI:

- PR correctness: focused Node and Bun tests, manifest validation, codegen check, compiler adapter smoke, declaration consumers, and packed consumer.
- PR performance: dedicated base/head sentinel groups only.
- Nightly: full Node/Bun/Deno correctness and server performance shards.
- Weekly: Chromium/Firefox/WebKit, Linux x64/macOS arm64, allocation/GC/deopt lanes, million-case properties, and accelerator qualification.
- Release: packed runtime/compiler correctness, all mandatory performance gates, bundle/import budgets, and report validation.

## Release sequence

- 0.0.x stabilization: benchmark truth and confirmed semantic fixes; make no new performance claims.
- 1.0.0 prereleases to stable: Plan IR, portable compile/compilePure, root compileJit, build compiler, all enumerated adapters, migration guide, and pack qualification.
- 1.1.0: unified Stream executor.
- 1.2.0: automatic scalar typed specialization for all twelve constructors and the new A operations.
- 1.3.0: root compileSimd backed by the optional @stopcock/compute peer.
- 1.4.0: root compileParallel delegating to @stopcock/compute worker pools, with explicit ownership.

Use a Changesets fixed group for @stopcock/fp, @stopcock/fp-compiler, and @stopcock/fp-compiler-swc. The runtime tarball may contain a lazy JIT chunk, but the root entry must not statically evaluate or bundle it while compileJit is unused. SIMD and worker execution live in the optional @stopcock/compute peer and add nothing to the fp tarball.

## Final acceptance

Every stable milestone must provide:

- Differential semantic tests against the reference interpreter for every applicable backend.
- Focused regressions for every bug listed in Milestone 0.
- Source, dist, and packed-tarball equivalence.
- Type inference tests for Array and every typed constructor.
- Real-host compiler adapter tests.
- Allocation, cache-bound, reentrancy, and active-handle tests.
- Dedicated-runner performance evidence with raw JSON.
- A public report containing only measured rows and exact denominators.
- Documentation showing only @stopcock/fp imports in application code.
- Packed-consumer coverage of behavior with @stopcock/compute absent.

Implementation is not complete while any mandatory row is skipped, silently projected, executed by the wrong engine, or hidden behind a successful report process.
