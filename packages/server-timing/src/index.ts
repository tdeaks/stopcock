import {
  defineMiddleware,
  definePlugin,
  defineRoutePlugin,
  type RoutePlugin,
  type ServerPlugin,
} from '@stopcock/server'

export type TimingMark = {
  readonly name: string
  readonly duration: number
}

export type Timing = {
  readonly marks: readonly TimingMark[]
  mark(name: string): number
}

export type ServerTimingOptions = {
  readonly metric?: string
  readonly precision?: number
}

export type TimingOptions = {
  readonly precision?: number
}

const TOTAL_START = Symbol.for('@stopcock/server-timing/total-start')

const now = (): number => {
  const perf = globalThis.performance
  return perf?.now ? perf.now() : Date.now()
}

const token = (name: string): string => {
  const cleaned = name.trim().replace(/[^!#$%&'*+\-.^_`|~0-9A-Za-z]/g, '_')
  return cleaned || 'metric'
}

const formatDuration = (duration: number, precision: number): string => {
  const fixed = Math.max(0, duration).toFixed(precision)
  return fixed.replace(/\.?0+$/, '') || '0'
}

const metric = (name: string, duration: number, precision: number): string =>
  `${token(name)};dur=${formatDuration(duration, precision)}`

const appendHeader = (response: Response, name: string, value: string): Response => {
  try {
    response.headers.append(name, value)
    return response
  } catch {
    const headers = new Headers(response.headers)
    headers.append(name, value)
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  }
}

export const serverTiming = (options: ServerTimingOptions = {}): ServerPlugin => {
  const name = options.metric ?? 'total'
  const precision = options.precision ?? 2

  return definePlugin({
    name: 'server-timing',
    setup: () => ({
      hooks: [
        {
          before: (ctx) => {
            ;(ctx as { [TOTAL_START]?: number })[TOTAL_START] = now()
          },
          after: (ctx, response) => {
            const start = (ctx as { [TOTAL_START]?: number })[TOTAL_START]
            if (start === undefined) return response
            return appendHeader(response, 'Server-Timing', metric(name, now() - start, precision))
          },
        },
      ],
    }),
  })
}

const createTiming = (precision: number): Timing => {
  const start = now()
  const marks: TimingMark[] = []
  return {
    get marks() {
      return marks
    },
    mark(name) {
      const duration = Number(formatDuration(now() - start, precision))
      marks.push({ name, duration })
      return duration
    },
  }
}

export const timing = (options: TimingOptions = {}): RoutePlugin<{ timing: Timing }> => {
  const precision = options.precision ?? 2

  return defineRoutePlugin({
    name: 'timing',
    middleware: defineMiddleware<{ timing: Timing }>(() => ({
      timing: createTiming(precision),
    })),
    hooks: [
      {
        after: (ctx, response) => {
          const marks = (ctx as { timing?: Timing }).timing?.marks ?? []
          let current = response
          for (const mark of marks) {
            current = appendHeader(current, 'Server-Timing', metric(mark.name, mark.duration, precision))
          }
          return current
        },
      },
    ],
  })
}

export const serverTimingPlugin = serverTiming
export const timingPlugin = timing
