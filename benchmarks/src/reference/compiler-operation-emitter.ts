// Frozen, benchmark-only reference source emitter for the compiler's complete
// supported-op surface. It is intentionally separate from emitter.ts: the
// portable 44-case denominator and its pinned hash remain byte-for-byte
// unchanged while this additive lane can cover compiler-only operations.
import { none as optionNone } from '../../../packages/fp/src/option'
import {
  mergeSortAsc,
  mergeSortBy,
  mergeSortDesc,
} from '../../../packages/fp/src/sort-kernel'
import type { CompilerSupportedOpName } from './compiler-operation-corpus'

export const COMPILER_OPERATION_EMITTER_ID =
  'stopcock-compiler-operation-reference-emitter-w0-v1'

const loop = (body: string): string =>
  `for (let i = 0, len = input.length; i < len; i++) { ${body} }`

/**
 * Emits a deliberately independent reference implementation for one pinned
 * operation case. Callback formulas and bound values mirror the reviewable
 * source expressions in compiler-operation-corpus.ts.
 */
export const emitCompilerOperationReference = (
  targetOp: CompilerSupportedOpName,
): string => {
  switch (targetOp) {
    case 'map':
      return `const out = new Array(input.length); ${loop('out[i] = input[i] * 3 + 1;')} return out;`
    case 'filter':
      return `const out = []; ${loop('const x = input[i]; if (x % 3 === 1) out.push(x);')} return out;`
    case 'reject':
      return `const out = []; ${loop('const x = input[i]; if (x % 3 !== 1) out.push(x);')} return out;`
    case 'filterMap':
      return `const out = []; ${loop('const x = input[i]; if (x % 3 === 1) out.push(x * 2 + 1);')} return out;`
    case 'flatMap':
      return `const out = new Array(input.length * 2); ${loop('const x = input[i]; out[i * 2] = x; out[i * 2 + 1] = x + 1;')} return out;`
    case 'mapWhile':
      return `const out = []; ${loop('const x = input[i]; if (Math.abs(x) >= 450) break; out.push(x * 2 + 1);')} return out;`
    case 'take': {
      return `const size = input.length < 512 ? input.length : 512; const out = new Array(size); for (let i = 0; i < size; i++) out[i] = input[i]; return out;`
    }
    case 'takeUntil':
      return `const out = []; ${loop('const x = input[i]; if (x > 450) break; out.push(x);')} return out;`
    case 'drop': {
      return `const start = input.length < 257 ? input.length : 257; const out = new Array(input.length - start); for (let i = start; i < input.length; i++) out[i - start] = input[i]; return out;`
    }
    case 'takeWhile':
      return `const out = []; ${loop('const x = input[i]; if (!(x < 450)) break; out.push(x);')} return out;`
    case 'dropWhile':
      return `let start = 0; while (start < input.length && input[start] < 0) start++; const out = new Array(input.length - start); for (let i = start; i < input.length; i++) out[i - start] = input[i]; return out;`
    case 'scan':
      return `const out = new Array(input.length + 1); let acc = 7; out[0] = acc; ${loop('acc += input[i]; out[i + 1] = acc;')} return out;`
    case 'count':
      return `let count = 0; ${loop('if (input[i] % 3 === 1) count++;')} return count;`
    case 'reduce':
      return `let acc = 7; ${loop('acc += input[i];')} return acc;`
    case 'forEach':
      return `let __observation = 0; ${loop('__observation += input[i];')} return { value: undefined, observation: __observation };`
    case 'find':
      return `${loop('const x = input[i]; if (x === input[input.length - 1]) return { _tag: 1, value: x };')} return __none;`
    case 'findIndex':
      return `${loop('if (input[i] === input[input.length - 1]) return { _tag: 1, value: i };')} return __none;`
    case 'findMap':
      return `${loop('const x = input[i]; if (x === input[input.length - 1]) return { _tag: 1, value: x * 2 + 1 };')} return __none;`
    case 'every':
      return `${loop('if (!(input[i] !== input[input.length - 1])) return false;')} return true;`
    case 'some':
      return `${loop('if (input[i] === input[input.length - 1]) return true;')} return false;`
    case 'none':
      return `${loop('if (input[i] === input[input.length - 1]) return false;')} return true;`
    case 'head':
      return `return input.length === 0 ? __none : { _tag: 1, value: input[0] };`
    case 'last':
      return `return input.length === 0 ? __none : { _tag: 1, value: input[input.length - 1] };`
    case 'length':
      return `return input.length;`
    case 'isEmpty':
      return `return input.length === 0;`
    case 'min':
      return `if (input.length === 0) return __none; let value = input[0]; for (let i = 1; i < input.length; i++) if (input[i] < value) value = input[i]; return { _tag: 1, value };`
    case 'max':
      return `if (input.length === 0) return __none; let value = input[0]; for (let i = 1; i < input.length; i++) if (input[i] > value) value = input[i]; return { _tag: 1, value };`
    case 'sort':
    case 'sortAsc':
      return `return __sortKernel.asc(input);`
    case 'sortBy':
      return `return __sortKernel.by(input, (a, b) => a - b);`
    case 'sortDesc':
      return `return __sortKernel.desc(input);`
    case 'reverse':
      return `const out = new Array(input.length); ${loop('out[input.length - 1 - i] = input[i];')} return out;`
    case 'uniq':
      return `return Array.from(new Set(input));`
    case 'sum':
      return `let value = 0; ${loop('value += input[i];')} return value;`
    case 'without':
      return `const excluded = new Set([input[input.length - 1]]); const out = []; ${loop('const x = input[i]; if (!excluded.has(x)) out.push(x);')} return out;`
    case 'tail':
      return `return input.length <= 1 ? [] : input.slice(1);`
    case 'init':
      return `return input.length <= 1 ? [] : input.slice(0, input.length - 1);`
    case 'flatten':
      return `const nested = new Array(input.length); ${loop('const x = input[i]; nested[i] = [x, x + 1];')} const out = new Array(input.length * 2); for (let i = 0; i < nested.length; i++) { out[i * 2] = nested[i][0]; out[i * 2 + 1] = nested[i][1]; } return out;`
    case 'join':
      return `return input.join('|');`
    default: {
      const unsupported: never = targetOp
      throw new Error(
        `compiler operation reference has no emitter for ${String(unsupported)}`,
      )
    }
  }
}

export type CompilerOperationReferenceRunner = (
  input: readonly number[],
) => unknown

const sortKernel = {
  asc: mergeSortAsc,
  by: mergeSortBy,
  desc: mergeSortDesc,
}

export const compileCompilerOperationReference = (
  targetOp: CompilerSupportedOpName,
): CompilerOperationReferenceRunner => {
  const body = emitCompilerOperationReference(targetOp)
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const factory = new Function(
    '__none',
    '__sortKernel',
    `return function compilerOperationReference(input) { ${body} };`,
  )
  return factory(optionNone, sortKernel) as CompilerOperationReferenceRunner
}
