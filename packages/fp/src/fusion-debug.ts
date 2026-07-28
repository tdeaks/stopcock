/**
 * Fusion diagnostics.
 *
 * Absent from every bundle that does not import it. `explain` is static and
 * constant-time: there is no plan, no registry, and no fact table left to
 * read, because there is no runtime fusion engine left to describe.
 *
 * `explainRunner` and the optimizer statistics moved to `@stopcock/fp/fusion/
 * optimized` back when there was still an optimized engine to report on.
 * That entry is gone; re-exporting engine-bound diagnostics from here would
 * put an engine's chunk back into any consumer that imported this entry,
 * which is exactly what removing them was for.
 */
export { explain, explainPure, type PipelineExplanation } from './internal/explain'
