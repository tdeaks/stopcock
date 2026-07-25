/**
 * Fusion diagnostics.
 *
 * Absent from every bundle that does not import it. `explain` is static: it
 * reads the plan, the generated runner key set, and the compact fact table,
 * so explaining a pipeline no longer pulls the optimized engine in behind it.
 *
 * `explainRunner` and the optimizer statistics moved to `@stopcock/fp/fusion/
 * optimized`. They are engine-bound — a runner only exists because `compile`
 * made one — and re-exporting them from here put the engine's chunk back into
 * any consumer that imported this entry, which defeated the whole point.
 */
export { explain, explainPure, type PipelineExplanation } from './internal/explain'
export { type PureRewrite } from './internal/plan-analysis'
