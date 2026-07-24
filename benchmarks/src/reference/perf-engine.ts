export type PerfEngineId = 'bun-jsc' | 'node-v8'

export interface PerfEngine {
  readonly id: PerfEngineId
  readonly name: 'Bun/JavaScriptCore' | 'Node/V8'
  readonly runtime: 'bun' | 'node'
  readonly runtimeVersion: string
  readonly nodeCompatibility?: string
  readonly v8?: string
  readonly platform: NodeJS.Platform
  readonly architecture: string
}

export const currentPerfEngine = (): PerfEngine => {
  const bunVersion = process.versions.bun
  if (typeof bunVersion === 'string') {
    return {
      id: 'bun-jsc',
      name: 'Bun/JavaScriptCore',
      runtime: 'bun',
      runtimeVersion: bunVersion,
      nodeCompatibility: process.versions.node,
      platform: process.platform,
      architecture: process.arch,
    }
  }
  if (typeof process.versions.v8 === 'string') {
    return {
      id: 'node-v8',
      name: 'Node/V8',
      runtime: 'node',
      runtimeVersion: process.versions.node,
      v8: process.versions.v8,
      platform: process.platform,
      architecture: process.arch,
    }
  }
  throw new Error('performance gates support only Bun/JavaScriptCore and Node/V8')
}

export const expectedEngineName = (id: PerfEngineId): PerfEngine['name'] =>
  id === 'bun-jsc' ? 'Bun/JavaScriptCore' : 'Node/V8'
