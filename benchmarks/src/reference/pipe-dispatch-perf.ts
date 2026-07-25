// Non-gating characterization of pipe()'s bounded identity/front-cache layers.
// Run directly with Bun, or import it from a temporary Vitest test to measure
// Node/V8. It is deliberately separate from the release-gated pipeline corpus:
// small inputs expose dispatch and binding costs instead of hiding them behind
// the loop. The frozen local baseline makes every comparison same-process.
import * as A from '../../../packages/fp/src/array'
import { compile } from '../../../packages/fp/src/compile'
import { pipe } from '../../../packages/fp/src/internal/fusion-engine'
import { baselinePipe } from './pipe-dispatch-baseline'
import { runPaired } from './perf-runner'

const input = [1, 2, 3, 4, 5, 6, 7, 8]
const BATCH = 1_000
const ROUNDS = 40
let blackhole: unknown

const mapStep = A.map((value: number) => value + 1)
const filterStep = A.filter((value: number) => value % 2 === 0)
const compiled = compile(mapStep, filterStep)
const longSteps = [
  A.map((value: number) => value + 1),
  A.filter((value: number) => value % 2 === 0),
  A.map((value: number) => value * 2),
  A.filter((value: number) => value > 2),
  A.map((value: number) => value - 1),
  A.reduce((accumulator: number, value: number) => accumulator + value, 0),
] as const
const compiledLong = compile(...longSteps)

const stablePipe = (): void => {
  for (let index = 0; index < BATCH; index++) {
    blackhole = pipe(input, mapStep, filterStep)
  }
}

const compiledRunner = (): void => {
  for (let index = 0; index < BATCH; index++) {
    blackhole = compiled(input)
  }
}

const stableBaseline = (): void => {
  for (let index = 0; index < BATCH; index++) {
    blackhole = baselinePipe(input, mapStep, filterStep)
  }
}

const stableLongPipe = (): void => {
  for (let index = 0; index < BATCH; index++) {
    blackhole = pipe(input, ...longSteps)
  }
}

const compiledLongRunner = (): void => {
  for (let index = 0; index < BATCH; index++) {
    blackhole = compiledLong(input)
  }
}

const stableLongBaseline = (): void => {
  for (let index = 0; index < BATCH; index++) {
    blackhole = baselinePipe(input, ...longSteps)
  }
}

const freshPipe = (): void => {
  for (let index = 0; index < BATCH; index++) {
    blackhole = pipe(
      input,
      A.map((value: number) => value + 1),
      A.filter((value: number) => value % 2 === 0),
    )
  }
}

const freshCompile = (): void => {
  for (let index = 0; index < BATCH; index++) {
    blackhole = compile(
      A.map((value: number) => value + 1),
      A.filter((value: number) => value % 2 === 0),
    )(input)
  }
}

const freshBaseline = (): void => {
  for (let index = 0; index < BATCH; index++) {
    blackhole = baselinePipe(
      input,
      A.map((value: number) => value + 1),
      A.filter((value: number) => value % 2 === 0),
    )
  }
}

const freshThreePipe = (): void => {
  for (let index = 0; index < BATCH; index++) {
    blackhole = pipe(
      input,
      A.map((value: number) => value + 1),
      A.filter((value: number) => value % 2 === 0),
      A.take(3),
    )
  }
}

const freshThreeCompile = (): void => {
  for (let index = 0; index < BATCH; index++) {
    blackhole = compile(
      A.map((value: number) => value + 1),
      A.filter((value: number) => value % 2 === 0),
      A.take(3),
    )(input)
  }
}

const freshThreeBaseline = (): void => {
  for (let index = 0; index < BATCH; index++) {
    blackhole = baselinePipe(
      input,
      A.map((value: number) => value + 1),
      A.filter((value: number) => value % 2 === 0),
      A.take(3),
    )
  }
}

const format = (value: number): string => value.toFixed(3)

const stable = runPaired(stablePipe, compiledRunner, { rounds: ROUNDS })
const stableLong = runPaired(stableLongPipe, compiledLongRunner, { rounds: ROUNDS })
const fresh = runPaired(freshPipe, freshCompile, { rounds: ROUNDS })
const freshThree = runPaired(freshThreePipe, freshThreeCompile, { rounds: ROUNDS })
const stableGain = runPaired(stablePipe, stableBaseline, { rounds: ROUNDS })
const stableLongGain = runPaired(stableLongPipe, stableLongBaseline, { rounds: ROUNDS })
const freshGain = runPaired(freshPipe, freshBaseline, { rounds: ROUNDS })
const freshThreeGain = runPaired(freshThreePipe, freshThreeBaseline, { rounds: ROUNDS })

console.log('pipe dispatch characterization')
console.log('ratio = referenceNs / pipeNs; >1 means pipe is faster')
console.log(
  `stable vs pre-change: ${format(stableGain.medianRatio)} [${format(stableGain.ciLow)}, ${format(stableGain.ciHigh)}]`,
)
console.log(
  `stable six-step vs pre-change: ${format(stableLongGain.medianRatio)} [${format(stableLongGain.ciLow)}, ${format(stableLongGain.ciHigh)}]`,
)
console.log(
  `fresh closures vs pre-change: ${format(freshGain.medianRatio)} [${format(freshGain.ciLow)}, ${format(freshGain.ciHigh)}]`,
)
console.log(
  `fresh three-step vs pre-change: ${format(freshThreeGain.medianRatio)} [${format(freshThreeGain.ciLow)}, ${format(freshThreeGain.ciHigh)}]`,
)
console.log(
  `stable hoisted vs compile: ${format(stable.medianRatio)} [${format(stable.ciLow)}, ${format(stable.ciHigh)}]`,
)
console.log(
  `stable six-step vs compile: ${format(stableLong.medianRatio)} [${format(stableLong.ciLow)}, ${format(stableLong.ciHigh)}]`,
)
console.log(
  `fresh closures vs fresh compile: ${format(fresh.medianRatio)} [${format(fresh.ciLow)}, ${format(fresh.ciHigh)}]`,
)
console.log(
  `fresh three-step vs fresh compile: ${format(freshThree.medianRatio)} [${format(freshThree.ciLow)}, ${format(freshThree.ciHigh)}]`,
)
void blackhole
