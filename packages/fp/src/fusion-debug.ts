/**
 * Fusion diagnostics.
 *
 * Absent from every bundle that does not import it. The explanation and
 * statistics surface is pinned here so tooling has one place to depend on;
 * physically separating diagnostic implementation from production bytes is
 * S9's job, not this entry's.
 */
export {
  explain,
  explainPure,
  explainRunner,
  getOptimizerStats,
  resetOptimizerStats,
  type OptimizerStats,
  type PipelineExplanation,
  type PureRewrite,
  type RunnerExplanation,
} from './compile'
