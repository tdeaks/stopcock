# Stopcock differentiable creative computing reference-application plan

> **Status:** proposed flagship reference application.
>
> **Application:** a deterministic accessible theme optimizer.
>
> **Primary dependencies:** `@stopcock/autodiff`, `@stopcock/color`,
> `@stopcock/la`, `@stopcock/svg`, and the planned
> [`@stopcock/optimize`](./2026-07-21-stopcock-optimize-1.0-implementation.md).
> `@stopcock/img` is optional for sampling seed colours from an image.
>
> **Product boundary:** this is a private app and documentation showcase first,
> not a new public creative-computing package.

## Outcome

Build a substantial reference application that takes:

- named semantic colour roles;
- one or more brand/seed colours;
- light and/or dark surface assumptions;
- text/background role pairs;
- optional sampled-image colours;
- configured WCAG targets;
- configured colour-vision-distinguishability goals;
- sRGB or Display-P3 output gamut;

and deterministically searches for an improved theme.

The app must:

- optimize a smooth surrogate objective over continuous OKLab parameters;
- use Stopcock Optimize for the search and Autodiff for gradients where
  applicable;
- validate the final candidates with exact `@stopcock/color` gamut, contrast,
  and colour-vision simulation functions;
- clearly separate differentiable surrogate scores from exact pass/fail checks;
- return a failure/partial result when no feasible theme is found;
- render an interactive before/after UI and downloadable SVG/JSON report;
- expose convergence, constraints, exact audit, and reproducibility data.

The demo proves that Stopcock's numerical packages can cooperate on a useful,
visual problem. It does not redefine Stopcock as a design-tool framework.

## Current repository seams

- `@stopcock/autodiff` supports reverse-mode scalar objectives over scalar,
  vector, and matrix inputs.
- the existing docs already contain differentiable robot-arm and curve-fitting
  demonstrations.
- `@stopcock/color` supports OKLab/OKLCh conversion, gamut mapping, contrast,
  palette utilities, and colour-vision simulation.
- exact gamut mapping uses branching/binary search;
- WCAG checks contain hard thresholds;
- image filters quantize into `Uint8ClampedArray`;
- these exact validation paths are not themselves smooth differentiable
  programs;
- the Optimize plan supplies deterministic codecs, gradients, L-BFGS-B,
  first-order methods, Nelder-Mead, traces, cancellation, and checkpointing;
- `@stopcock/svg` can generate a self-contained visual report.

## Explicit exclusions

- No claim that WCAG conformance is “optimized” without exact final checks.
- No claim that a CVD distance threshold is a legal accessibility standard.
- No differentiation through byte-quantized image filters.
- No differentiation through current branchy gamut mapping.
- No opaque neural model or stochastic cloud service.
- No user-account, collaboration, or hosted persistence work.
- No arbitrary CSS design-system ingestion in the first version.
- No general constraint-programming or global-optimum guarantee.
- No new public API in Color merely to make the demo convenient.

## Theme model

Optimize Cartesian OKLab values rather than raw OKLCh hue:

```ts
export interface ThemeRole {
  readonly id: string
  readonly kind: "surface" | "text" | "accent" | "status" | "border"
  readonly seed: Color
  readonly locked?: boolean
}

export interface ThemeVectorRole {
  readonly L: number
  readonly a: number
  readonly b: number
}

export interface ThemeModel {
  readonly roles: Readonly<Record<string, ThemeVectorRole>>
}
```

Using `a/b` avoids a discontinuity at the `0/360` hue wrap. The Optimize
`ParameterCodec` packs roles in stable sorted-ID order. Locked roles are
excluded or fixed with equal lower/upper bounds.

Bounds are broad finite OKLab search bounds, not a promise that every point is
inside the selected RGB gamut. Gamut feasibility is handled by a smooth
penalty during search and exact validation afterward.

## Input contract

```ts
export interface ThemeOptimizationRequest {
  readonly roles: readonly ThemeRole[]
  readonly contrast: readonly ContrastConstraint[]
  readonly distinguishability: readonly DistinguishabilityConstraint[]
  readonly relationships?: readonly RelationshipConstraint[]
  readonly gamut: "srgb" | "display-p3"
  readonly method?: ThemeOptimizationMethod
  readonly seed: number
  readonly budget?: ThemeOptimizationBudget
}
```

Validation:

- role IDs are unique and bounded strings;
- all referenced roles exist;
- colours and numeric weights are finite;
- contrast ratios are positive and use named presets or explicit values;
- no contradictory lock/bound configuration starts optimization;
- an empty or fully locked model performs audit only;
- budgets are bounded before work begins.

## Differentiable objective

The scalar objective is a weighted sum with each component reported
independently.

### Seed fidelity

Use squared OKLab distance between each unlocked role and its seed:

```text
seedLoss = weight * ((L-L0)^2 + (a-a0)^2 + (b-b0)^2)
```

Role-specific weights let brand colours move less than generated supporting
roles.

### Smooth gamut penalty

Implement an autodiff-compatible OKLab-to-linear-RGB conversion using scalar
matrix/polynomial operations. Penalize channels outside `[0, 1]` with
softplus/squared hinge terms. This is a search surrogate only.

The final candidate is checked through exact `@stopcock/color` conversion and
gamut predicates. Exact gamut mapping may generate a separate repaired
candidate, which must then rerun every exact constraint.

### Contrast surrogate

Convert foreground/background to differentiable linear luminance. Use a smooth
lower-bound penalty for the requested ratio. Where foreground/background
ordering can flip, use a smooth approximation during search.

Every result is subsequently checked by exact `contrastRatio`, `meetsAA`, or
the configured exact threshold.

### Colour-vision distinguishability

Apply differentiable fixed CVD simulation matrices for configured deficiency
types, then penalize pair distance below a caller-selected heuristic threshold.
Label this metric a configurable distinguishability objective, not a standard.

Exact `@stopcock/color` CVD simulation and distance functions audit the final
theme.

### Relationship constraints

Support a small closed set:

- preferred relative lightness ordering;
- minimum OKLab/OKLCh distance;
- target lightness/chroma range;
- seed hue-sector preference expressed through Cartesian direction;
- paired light/dark role symmetry.

Each has a smooth loss and a separate exact result where meaningful.

## Solver strategy

Use a deterministic staged search:

1. validate/audit the original theme;
2. construct the stable codec and objective;
3. run a bounded L-BFGS-B or Adam candidate using autodiff gradients;
4. optionally run a small fixed set of deterministic perturbation starts;
5. if gradients stall near hard boundaries, run a bounded Nelder-Mead
   refinement on the best candidate;
6. exact-audit every candidate;
7. choose the lowest exact-feasible score with stable tie-breaking;
8. if none is feasible, return the best partial candidate plus unsatisfied
   exact constraints.

The number and generation of restart points are fixed by method version and
seed. `Math.random()` is never used.

## Autodiff extension gate

Prefer composing the objective from existing scalar operations. Add a public
custom-gradient primitive only if a necessary smooth operation cannot be
expressed efficiently:

```ts
export function customScalar(
  forward: (...inputs: readonly number[]) => number,
  backward: (
    outputGradient: number,
    inputs: readonly number[],
    output: number,
  ) => readonly number[],
): (...inputs: readonly Var<number>[]) => Var<number>
```

If added:

- validate gradient arity and finite values;
- record one tape node with no access to mutable tape internals;
- provide analytic/numeric gradient differential tests;
- preserve thrown-error identity;
- document it as advanced API;
- do not expose raw tape recording or let user code mutate adjoints.

Reject this addition if app-local composition is sufficient.

## Exact audit and result model

```ts
export interface ThemeOptimizationResult {
  readonly status: "feasible" | "partial" | "infeasible" | "aborted"
  readonly methodVersion: string
  readonly requestHash: string
  readonly seed: number
  readonly original: ThemeAudit
  readonly candidate: ThemeAudit
  readonly trace: ThemeOptimizationTrace
  readonly theme: Readonly<Record<string, Color>>
  readonly unsatisfied: readonly ExactConstraintFailure[]
}
```

`ThemeAudit` contains:

- exact colour-space values;
- gamut pass/fail;
- exact contrast matrix and named constraint results;
- configured CVD-simulated pair distances;
- seed distance;
- warnings for heuristic/non-normative metrics.

A `partial` result can be shown but not labelled accessible. An `infeasible`
result retains the exact audit explaining why.

## Image sampling

Optional image input is a seed extractor only:

- accept caller-provided `Image`;
- downsample under strict pixel/byte limits;
- derive a small deterministic palette using existing Img/Color functions;
- never differentiate through the image;
- do not upload image data;
- discard pixel buffers after seed extraction;
- report which generated seed colours entered the request.

The optimizer works fully without Img.

## Reference application

Create a private `apps/theme-optimizer` workspace only after Optimize is live.
It contains:

- role/seed editor;
- light and dark preview surfaces;
- live exact contrast matrix;
- selectable CVD simulation lens;
- convergence/loss chart;
- constraint table separating surrogate and exact values;
- original/candidate comparison;
- deterministic method/seed/budget controls;
- run, cancel, reset, and reproduce controls;
- JSON request/result download;
- standalone SVG audit report.

The docs may embed a reduced version after the full app and library imports pass
packed-consumer tests.

## SVG report

Generate a self-contained accessible SVG with:

- theme swatches and role names;
- original versus candidate values;
- text/background previews;
- exact contrast ratios and pass/fail badges;
- CVD-simulated comparison rows;
- gamut/output-space declaration;
- convergence summary;
- method version, request hash, seed, and timestamp supplied by caller;
- explicit disclaimer for heuristic CVD thresholds.

Do not embed input images, secrets, or unbounded trace data.

## Implementation phases

### Phase 0 — Freeze fixtures and exact audit

1. Define representative light, dark, brand-constrained, status-colour, and
   deliberately infeasible themes.
2. Implement exact audit using only current Color APIs.
3. Freeze expected WCAG and gamut outcomes.
4. Define the CVD heuristic and label it non-normative.

**Gate:** exact audit is independently useful before optimization exists.

### Phase 1 — Build smooth colour objective

1. Implement differentiable OKLab-to-linear-RGB and luminance primitives.
2. Add seed, gamut, contrast, distinguishability, and relationship losses.
3. Compare autodiff gradients with central finite differences over safe points.
4. Stress near zero chroma, gamut boundaries, equal luminance, and extreme
   bounds.

**Gate:** relative gradient error stays within a documented tolerance and all
non-finite regions fail predictably.

### Phase 2 — Integrate Optimize

1. Implement stable `ThemeModel` codec/bounds.
2. Add deterministic staged solver selection and restarts.
3. Preserve cancellation, trace, evaluation budgets, and last valid candidate.
4. Run exact audit after every final candidate, not every inner iteration.

**Gate:** same request/method version/seed yields byte-identical theme values
and accepted trace across repeated runs on the same supported runtime.

### Phase 3 — Add feasibility selection and repair

1. Rank exact-feasible candidates before lower surrogate-only candidates.
2. Add optional exact gamut mapping as a new candidate.
3. Rerun every constraint after repair.
4. Return partial/infeasible results honestly.

**Gate:** no result receives `feasible` unless every configured exact
constraint passes.

### Phase 4 — Build app and SVG report

1. Implement the private interactive workspace.
2. Keep expensive solve work cancellable and avoid blocking input/preview.
3. Add keyboard, focus, screen-reader, reduced-motion, and responsive behavior.
4. Add deterministic JSON and SVG exports.

**Gate:** accessibility audit and visual regression pass for the app itself.

### Phase 5 — Add image seeding and docs embed

1. Add bounded local image palette sampling.
2. Ensure image bytes never enter receipts or exported reports.
3. Add a reduced docs showcase and tutorial.
4. Link every visible claim to exact audit or labelled heuristic evidence.

## Test matrix

- empty, locked, partially locked, and many-role themes;
- sRGB and Display-P3 targets;
- light/dark, status, text, accent, and border constraints;
- feasible, tight, contradictory, and impossible constraints;
- zero chroma, hue-wrap-equivalent Cartesian values, near-black, near-white,
  and out-of-gamut candidates;
- gradient differential tests;
- deterministic restarts/tie-breaking/checkpoint/cancellation;
- exact audit before/after gamut repair;
- all CVD simulation types;
- malformed/non-finite input and budget exhaustion;
- image seed limits and cleanup;
- SVG escaping, accessibility, snapshot, and JSON round-trip;
- browser, Node-side report generation, packed package imports, and docs build.

## Performance and quality gates

- Interactive default examples complete within a documented budget on the
  pinned browser profile or run in a dedicated worker without blocking input.
- Progress rendering is throttled and never changes solver state.
- The result report separates objective evaluations, gradient evaluations,
  iterations, and wall time.
- Curated feasible fixtures reach every exact configured constraint.
- Deliberately infeasible fixtures return `infeasible` or `partial`, never a
  false accessibility pass.
- Analytic/autodiff objective paths materially outperform finite differences at
  representative role counts.
- Exported SVG and JSON reproduce the exact candidate audit.

## Acceptance criteria

- The theme optimizer is a substantial, reproducible Stopcock application.
- Smooth search and exact validation are visibly separate.
- WCAG claims come only from exact Color checks.
- CVD thresholds are labelled heuristic.
- No current branchy/quantized Color or Img operation is falsely described as
  differentiable.
- Optimize/Autodiff remain general libraries; app-specific policy stays in the
  private app.
- The demo can fail honestly and explain unsatisfied constraints.
- The application itself meets keyboard, screen-reader, contrast, and
  reduced-motion requirements.

## Rollback

The app can be removed without changing any public package. Any Autodiff
addition must be independently useful, tested, and revertible. If the smooth
objective cannot reliably reach exact-feasible themes, retain the exact audit
tool and stop the optimization claim rather than weakening constraints or
calling surrogate success accessible.
