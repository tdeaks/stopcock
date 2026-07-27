import type {
  ElementOpName,
  TerminalOpName,
  BoundaryOpName,
} from '../../../packages/fp-compiler/src/ops'
import { OP_CODES } from '../../../packages/fp/src/opcodes'

export const COMPILER_OPERATION_CORPUS_ID =
  'stopcock-fp-compiler-operation-complete-w0-v1'
export const COMPILER_OPERATION_CORPUS_VERSION = 1

export type CompilerSupportedOpName = ElementOpName | TerminalOpName | BoundaryOpName

export type CompilerOperationCategory =
  | 'element'
  | 'stateful'
  | 'terminal'
  | 'materializer'

export interface CompilerOperationCorpusCase {
  readonly name: string
  readonly targetOp: CompilerSupportedOpName
  readonly opcode: number
  readonly category: CompilerOperationCategory
  readonly inputSeed: number
  readonly size: number
  /**
   * Data-last @stopcock/fp/array expressions, in pipe order. These are
   * deliberately plain source strings so the checked-in projection is both
   * hashable and directly reviewable.
   */
  readonly sourceSteps: readonly string[]
}

const operationCase = (
  targetOp: CompilerSupportedOpName,
  category: CompilerOperationCategory,
  sourceSteps: readonly string[],
  size = 1_024,
): CompilerOperationCorpusCase =>
  Object.freeze({
    name: `operation/${targetOp}`,
    targetOp,
    opcode: OP_CODES[targetOp],
    category,
    inputSeed: 0xc011ec7 + targetOp.length * 0x9e37,
    size,
    sourceSteps: Object.freeze(sourceSteps),
  })

/**
 * One independently measured row per compiler capability. The order is the
 * exact sorted SUPPORTED_OP_NAMES order. `flatten` has one preparatory map so
 * the boundary receives its real array-of-arrays domain; target coverage is
 * still attributed only to flatten.
 */
export const COMPILER_OPERATION_CASES: readonly CompilerOperationCorpusCase[] =
  Object.freeze([
    operationCase('adjust', 'materializer', [
      "A.adjust(3, (x) => x + 1)",
    ]),
    operationCase('aperture', 'materializer', [
      "A.aperture(4)",
    ]),
    operationCase('append', 'materializer', [
      "A.append(7)",
    ]),
    operationCase('arrayEndsWith', 'materializer', [
      "A.arrayEndsWith([input[input.length - 1]])",
    ]),
    operationCase('arrayStartsWith', 'materializer', [
      "A.arrayStartsWith([input[0]])",
    ]),
    operationCase('chunk', 'materializer', [
      "A.chunk(8)",
    ]),
    operationCase('count', 'terminal', ['A.count((x) => x % 3 === 1)']),
    operationCase('difference', 'materializer', [
      "A.difference(input)",
    ]),
    operationCase('drop', 'stateful', ['A.drop(257)']),
    operationCase('dropLast', 'materializer', [
      "A.dropLast(257)",
    ]),
    operationCase('dropLastWhile', 'materializer', [
      "A.dropLastWhile((x) => x > 450)",
    ]),
    operationCase('dropRepeats', 'materializer', ['A.dropRepeats']),
    operationCase('dropWhile', 'stateful', ['A.dropWhile((x) => x < 0)']),
    operationCase('every', 'terminal', [
      'A.every((x) => x !== input[input.length - 1])',
    ]),
    operationCase('filter', 'element', ['A.filter((x) => x % 3 === 1)']),
    operationCase('filterMap', 'element', [
      'A.filterMap((x) => x % 3 === 1 ? x * 2 + 1 : undefined)',
    ]),
    operationCase('find', 'terminal', [
      'A.find((x) => x === input[input.length - 1])',
    ]),
    operationCase('findIndex', 'terminal', [
      'A.findIndex((x) => x === input[input.length - 1])',
    ]),
    operationCase('findIndexOrUndefined', 'materializer', [
      "A.findIndexOrUndefined((x) => x === input[input.length - 1])",
    ]),
    operationCase('findLast', 'materializer', [
      "A.findLast((x) => x === input[0])",
    ]),
    operationCase('findLastIndex', 'materializer', [
      "A.findLastIndex((x) => x === input[0])",
    ]),
    operationCase('findMap', 'terminal', [
      'A.findMap((x) => x === input[input.length - 1] ? x * 2 + 1 : undefined)',
    ]),
    operationCase('findMapOrUndefined', 'materializer', [
      "A.findMapOrUndefined((x) => x === input[input.length - 1] ? x * 2 + 1 : undefined)",
    ]),
    operationCase('findOrUndefined', 'materializer', [
      "A.findOrUndefined((x) => x === input[input.length - 1])",
    ]),
    operationCase('flatMap', 'element', ['A.flatMap((x) => [x, x + 1])']),
    operationCase('flatten', 'materializer', [
      'A.map((x) => [x, x + 1])',
      'A.flatten',
    ]),
    operationCase('forEach', 'terminal', [
      'A.forEach((x) => (__observation += x))',
    ]),
    operationCase('groupBy', 'materializer', [
      "A.groupBy((x) => String(x % 8))",
    ]),
    operationCase('groupWith', 'materializer', [
      "A.groupWith((a, b) => a === b)",
    ]),
    operationCase('hasAtLeast', 'materializer', [
      "A.hasAtLeast(257)",
    ]),
    operationCase('head', 'terminal', ['A.head'], 32),
    operationCase('includes', 'materializer', [
      "A.includes(input[input.length - 1])",
    ]),
    operationCase('indexOf', 'materializer', [
      "A.indexOf(input[input.length - 1])",
    ]),
    operationCase('init', 'materializer', ['A.init']),
    operationCase('insert', 'materializer', [
      "A.insert(3, 42)",
    ]),
    operationCase('intersection', 'materializer', [
      "A.intersection(input)",
    ]),
    operationCase('intersperse', 'materializer', [
      "A.intersperse(0)",
    ]),
    operationCase('isEmpty', 'terminal', ['A.isEmpty'], 32),
    operationCase('join', 'materializer', ["A.join('|')"]),
    operationCase('last', 'terminal', ['A.last'], 32),
    operationCase('lastIndexOf', 'materializer', [
      "A.lastIndexOf(input[input.length - 1])",
    ]),
    operationCase('length', 'terminal', ['A.length'], 32),
    operationCase('map', 'element', ['A.map((x) => x * 3 + 1)']),
    operationCase('mapWhile', 'stateful', [
      'A.mapWhile((x) => Math.abs(x) < 450 ? x * 2 + 1 : undefined)',
    ]),
    operationCase('max', 'terminal', ['A.max']),
    operationCase('meanBy', 'materializer', [
      "A.meanBy((x) => x * 2)",
    ]),
    operationCase('min', 'terminal', ['A.min']),
    operationCase('none', 'terminal', [
      'A.none((x) => x === input[input.length - 1])',
    ]),
    operationCase('nth', 'materializer', [
      "A.nth(257)",
    ]),
    operationCase('partition', 'materializer', [
      "A.partition((x) => x % 3 === 1)",
    ]),
    operationCase('pluck', 'materializer', [
      "A.map((x) => ({ v: x }))",
      "A.pluck('v')",
    ]),
    operationCase('prepend', 'materializer', [
      "A.prepend(7)",
    ]),
    operationCase('reduce', 'terminal', ['A.reduce((acc, x) => acc + x, 7)']),
    operationCase('reduceRight', 'materializer', [
      "A.reduceRight((acc, x) => acc + x, 7)",
    ]),
    operationCase('reduceWhile', 'materializer', [
      "A.reduceWhile((acc) => acc < 4096, (acc, x) => acc + x, 0)",
    ]),
    operationCase('reject', 'element', ['A.reject((x) => x % 3 === 1)']),
    operationCase('remove', 'materializer', [
      "A.remove(3, 2)",
    ]),
    operationCase('reverse', 'materializer', ['A.reverse']),
    operationCase('scan', 'stateful', ['A.scan((acc, x) => acc + x, 7)']),
    operationCase('slidingWindow', 'materializer', [
      "A.slidingWindow(4)",
    ]),
    operationCase('some', 'terminal', [
      'A.some((x) => x === input[input.length - 1])',
    ]),
    operationCase('sort', 'materializer', ['A.sort'], 2_048),
    operationCase('sortAsc', 'materializer', ['A.sortAsc'], 2_048),
    operationCase('sortBy', 'materializer', ['A.sortBy((a, b) => a - b)'], 2_048),
    operationCase('sortDesc', 'materializer', ['A.sortDesc'], 2_048),
    operationCase('splitAt', 'materializer', [
      "A.splitAt(257)",
    ]),
    operationCase('splitWhen', 'materializer', [
      "A.splitWhen((x) => x > 450)",
    ]),
    operationCase('splitWhenever', 'materializer', [
      "A.splitWhenever((x) => x % 64 === 1)",
    ]),
    operationCase('sum', 'terminal', ['A.sum']),
    operationCase('sumBy', 'materializer', [
      "A.sumBy((x) => x * 2)",
    ]),
    operationCase('symmetricDifference', 'materializer', [
      "A.symmetricDifference(input)",
    ]),
    operationCase('tail', 'materializer', ['A.tail']),
    operationCase('take', 'stateful', ['A.take(512)']),
    operationCase('takeLast', 'materializer', [
      "A.takeLast(257)",
    ]),
    operationCase('takeLastWhile', 'materializer', [
      "A.takeLastWhile((x) => x > 450)",
    ]),
    operationCase('takeUntil', 'stateful', ['A.takeUntil((x) => x > 450)']),
    operationCase('takeWhile', 'stateful', ['A.takeWhile((x) => x < 450)']),
    operationCase('union', 'materializer', [
      "A.union(input)",
    ]),
    operationCase('uniq', 'materializer', ['A.uniq']),
    operationCase('uniqBy', 'materializer', [
      "A.uniqBy((x) => x % 16)",
    ]),
    operationCase('uniqWith', 'materializer', [
      "A.uniqWith((a, b) => a === b)",
    ]),
    operationCase('update', 'materializer', [
      "A.update(3, 42)",
    ]),
    operationCase('without', 'materializer', [
      'A.without([input[input.length - 1]])',
    ]),
    operationCase('xprod', 'materializer', [
      "A.xprod([1, 2])",
    ]),
    operationCase('zip', 'materializer', [
      "A.zip(input)",
    ]),
    operationCase('zipWith', 'materializer', [
      "A.zipWith(input, (a, b) => a + b)",
    ]),
  ])

export const compilerOperationCorpusProjection = (): readonly Readonly<{
  name: string
  targetOp: CompilerSupportedOpName
  opcode: number
  category: CompilerOperationCategory
  inputSeed: number
  size: number
  sourceSteps: readonly string[]
}>[] =>
  COMPILER_OPERATION_CASES.map((item) => ({
    name: item.name,
    targetOp: item.targetOp,
    opcode: item.opcode,
    category: item.category,
    inputSeed: item.inputSeed,
    size: item.size,
    sourceSteps: item.sourceSteps,
  }))
