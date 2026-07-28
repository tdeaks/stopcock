/**
 * Static pipeline diagnostics.
 *
 * Nothing here executes a pipeline, and nothing here is fused: this package
 * has no runtime fusion engine any more. `explain`/`explainPure` describe
 * what running the given steps through `pipe` does right now, which is
 * always `'sequential'`. `'compiled site'` exists in the return type for the
 * one case this function cannot observe from inside itself: when
 * `@stopcock/fp-compiler` recognises a literal `pipe`/`flow`/`compile` call
 * in source, it replaces that call with a fused loop at build time, before
 * this function -- or the steps it would have closed over -- ever runs. A
 * truly compiled site never calls `explain()`; there is nothing left here to
 * ask it.
 */

export type PipelineExplanation = 'sequential' | 'compiled site'

export function explain(...steps: readonly unknown[]): PipelineExplanation {
  void steps
  return 'sequential'
}

export function explainPure(...steps: readonly unknown[]): PipelineExplanation {
  void steps
  return 'sequential'
}
