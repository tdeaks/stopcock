import { parse } from '@babel/parser'
import * as t from '@babel/types'
import { describe, expect, it } from 'vite-plus/test'
import {
  FULL_RUNNER_LOWERING_ID,
  PREFIX_RESIDUAL_STEP_VECTOR_LOWERING_ID,
  createStaticCompilerPlan,
  type Step,
} from '../plan-ir'
import { compilerOperatorFact } from '../ops'

const parsedCall = (source: string): t.CallExpression => {
  const program = parse(source, { sourceType: 'module' }).program
  const statement = program.body[0]
  if (!t.isExpressionStatement(statement) || !t.isCallExpression(statement.expression)) {
    throw new Error('expected a call expression')
  }
  return statement.expression
}

const expressionAt = (call: t.CallExpression, index: number): t.Expression => {
  const argument = call.arguments[index]
  if (argument === undefined || !t.isExpression(argument)) {
    throw new Error(`expected expression argument ${index}`)
  }
  return argument
}

const argumentsOf = (node: t.Expression): readonly t.Expression[] => {
  if (!t.isCallExpression(node)) return []
  return node.arguments.map((argument, index) => {
    if (!t.isExpression(argument)) {
      throw new Error(`expected expression operator argument ${index}`)
    }
    return argument
  })
}

const factFor = (name: string) => {
  const fact = compilerOperatorFact(name)
  if (fact === undefined) throw new Error(`missing compiler operator fact for ${name}`)
  return fact
}

const stepsFrom = (
  call: t.CallExpression,
  names: readonly string[],
  startIndex = 1,
): readonly Step[] =>
  names.map((name, index) => {
    const node = expressionAt(call, index + startIndex)
    return { name, node, args: argumentsOf(node), fact: factFor(name) }
  })

const sourceText = (source: string, node: t.Node): string => {
  if (node.start === null || node.start === undefined || node.end === null || node.end === undefined) {
    throw new Error('expected parser source locations')
  }
  return source.slice(node.start, node.end)
}

describe('StaticCompilerPlanV1', () => {
  it('captures the source before each non-inline operator binding', () => {
    const source = 'pipe(makeSource(), A.map((value) => value + 1), A.take(makeLimit()), A.filter(makePredicate()))'
    const call = parsedCall(source)
    const plan = createStaticCompilerPlan({
      siteKind: 'pipe',
      mode: 'exact',
      sourceTier: 'sequential',
      call,
      source: expressionAt(call, 0),
      steps: stepsFrom(call, ['map', 'take', 'filter']),
    })

    expect(plan.captures.map(({ kind, evaluationOrder, node }) => ({
      kind,
      evaluationOrder,
      source: sourceText(source, node),
    }))).toEqual([
      { kind: 'source', evaluationOrder: 0, source: 'makeSource()' },
      { kind: 'whole-step', evaluationOrder: 1, source: 'A.map((value) => value + 1)' },
      { kind: 'binding', evaluationOrder: 2, source: 'makeLimit()' },
      { kind: 'whole-step', evaluationOrder: 3, source: 'A.take(makeLimit())' },
      { kind: 'binding', evaluationOrder: 4, source: 'makePredicate()' },
      { kind: 'whole-step', evaluationOrder: 5, source: 'A.filter(makePredicate())' },
    ])
    expect(plan.steps[0]).toMatchObject({
      kind: 'operator',
      bindings: [{ kind: 'inline' }],
    })
  })

  it('retains the root step vector and opaque tail as ordered construction captures', () => {
    const source = 'pipe(makeSource(), A.map(makeMapper()), A.take(makeLimit()), makeTail())'
    const call = parsedCall(source)
    const plan = createStaticCompilerPlan({
      siteKind: 'pipe',
      mode: 'exact',
      sourceTier: 'sequential',
      call,
      source: expressionAt(call, 0),
      steps: stepsFrom(call, ['map', 'take']),
      residual: expressionAt(call, 3),
      opaqueReceiver: 'step-vector',
    })

    expect(plan.captures.map(({ kind, stepIndex, evaluationOrder, node }) => ({
      kind,
      stepIndex,
      evaluationOrder,
      source: sourceText(source, node),
    }))).toEqual([
      { kind: 'source', stepIndex: undefined, evaluationOrder: 0, source: 'makeSource()' },
      { kind: 'binding', stepIndex: 0, evaluationOrder: 1, source: 'makeMapper()' },
      { kind: 'whole-step', stepIndex: 0, evaluationOrder: 2, source: 'A.map(makeMapper())' },
      { kind: 'binding', stepIndex: 1, evaluationOrder: 3, source: 'makeLimit()' },
      { kind: 'whole-step', stepIndex: 1, evaluationOrder: 4, source: 'A.take(makeLimit())' },
      { kind: 'opaque', stepIndex: 2, evaluationOrder: 5, source: 'makeTail()' },
    ])
    expect(plan.steps.slice(0, 2)).toMatchObject([
      { kind: 'operator', bindings: [{ kind: 'capture' }] },
      { kind: 'operator', bindings: [{ kind: 'capture' }] },
    ])
    expect(plan.steps.map((step) => step.kind)).toEqual(['operator', 'operator', 'opaque'])
    expect(plan.steps[2]).toMatchObject({ kind: 'opaque', receiver: 'step-vector' })
    expect(plan.segments).toMatchObject([
      { kind: 'stream', start: 0, length: 1 },
      { kind: 'stream', start: 1, length: 1 },
      { kind: 'opaque', start: 2, length: 1 },
    ])
    expect(plan.segmentKinds).toEqual(['stream', 'stream', 'opaque'])
    expect(plan.loweringId).toBe(PREFIX_RESIDUAL_STEP_VECTOR_LOWERING_ID)
    expect(plan.sourceTier).toBe('sequential')
    expect(plan.executionLayout).toBe('sequential-stages')
  })

  it('keeps deferred construction captures outside a source-less runner and preserves pure mode', () => {
    const source = 'compile(A.map(makeMapper()), A.take(makeLimit()))'
    const call = parsedCall(source)
    const steps = stepsFrom(call, ['map', 'take'], 0)
    const exactPlan = createStaticCompilerPlan({
      siteKind: 'compile',
      mode: 'exact',
      sourceTier: 'optimized',
      call,
      steps,
    })
    const purePlan = createStaticCompilerPlan({
      siteKind: 'compilePure',
      mode: 'pure',
      sourceTier: 'optimized',
      call,
      steps,
    })

    expect(exactPlan).toMatchObject({
      result: 'runner',
      mode: 'exact',
      operatorConstruction: 'observable',
      executionLayout: 'fused-streams',
      loweringId: FULL_RUNNER_LOWERING_ID,
    })
    expect(exactPlan.source).toBeUndefined()
    expect(exactPlan.captures.map(({ phase, kind, node }) => ({
      phase,
      kind,
      source: sourceText(source, node),
    }))).toEqual([
      { phase: 'construction', kind: 'binding', source: 'makeMapper()' },
      { phase: 'construction', kind: 'whole-step', source: 'A.map(makeMapper())' },
      { phase: 'construction', kind: 'binding', source: 'makeLimit()' },
      { phase: 'construction', kind: 'whole-step', source: 'A.take(makeLimit())' },
    ])
    expect(purePlan).toMatchObject({
      siteKind: 'compilePure',
      result: 'runner',
      mode: 'pure',
      operatorConstruction: 'observable',
    })
    expect(
      purePlan.captures.filter((capture) => capture.kind === 'whole-step'),
    ).toHaveLength(2)
    expect(purePlan.mode).not.toBe(exactPlan.mode)
  })

  it('records pure map-to-length elision while retaining every construction capture', () => {
    const source = 'compilePure(A.map(makeMapper()), A.map(Number), A.length)'
    const call = parsedCall(source)
    const plan = createStaticCompilerPlan({
      siteKind: 'compilePure',
      mode: 'pure',
      sourceTier: 'compact',
      call,
      steps: stepsFrom(call, ['map', 'map', 'length'], 0),
    })

    expect(plan.steps).toHaveLength(3)
    expect(plan.captures.filter((capture) => capture.kind === 'whole-step')).toHaveLength(3)
    expect(plan.captures.filter((capture) => capture.kind === 'binding')).toHaveLength(2)
    expect(plan.pureRewrites).toEqual([
      {
        kind: 'elide-unused-map',
        elidedStepIndexes: [0, 1],
        terminalIndex: 2,
      },
    ])
    expect(plan.segments).toEqual([
      {
        kind: 'stream',
        start: 2,
        length: 1,
        inputDomain: 'array',
        outputDomain: 'scalar',
        terminalIndex: 2,
      },
    ])
  })

  it('segments from generated operator facts, including boundaries and terminals', () => {
    const source = 'pipe(input, A.map(mapper), A.flatten, A.take(limit), A.sum)'
    const call = parsedCall(source)
    const facts = ['map', 'flatten', 'take', 'sum'].map(factFor)
    const plan = createStaticCompilerPlan({
      siteKind: 'pipe',
      mode: 'exact',
      sourceTier: 'compiler',
      call,
      source: expressionAt(call, 0),
      steps: stepsFrom(call, facts.map(({ name }) => name)),
    })

    expect(facts.map(({ compilerPipelineRole }) => compilerPipelineRole)).toEqual([
      'element',
      'boundary',
      'element',
      'terminal',
    ])
    expect(plan.operatorFacts).toEqual(facts)
    expect(plan.executionLayout).toBe('fused-streams')
    expect(plan.segments).toMatchObject([
      { kind: 'stream', start: 0, length: 1 },
      { kind: 'boundary', start: 1, length: 1 },
      { kind: 'stream', start: 2, length: 2, terminalIndex: 3 },
    ])
  })

  it('separates root stages while retaining explicit fusion segments', () => {
    const source = 'pipe(input, A.map(mapper), A.filter(predicate))'
    const call = parsedCall(source)
    const input = {
      siteKind: 'pipe' as const,
      mode: 'exact' as const,
      call,
      source: expressionAt(call, 0),
      steps: stepsFrom(call, ['map', 'filter']),
    }
    const sequential = createStaticCompilerPlan({
      ...input,
      sourceTier: 'sequential',
    })
    const fused = createStaticCompilerPlan({
      ...input,
      sourceTier: 'compact',
    })

    expect(sequential.segmentKinds).toEqual(['stream', 'stream'])
    expect(sequential.segments).toMatchObject([
      { kind: 'stream', start: 0, length: 1 },
      { kind: 'stream', start: 1, length: 1 },
    ])
    expect(fused.segmentKinds).toEqual(['stream'])
    expect(fused.segments).toMatchObject([{ kind: 'stream', start: 0, length: 2 }])
  })
})
