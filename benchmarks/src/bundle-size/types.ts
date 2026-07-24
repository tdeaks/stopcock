export type JsonPrimitive = boolean | number | string | null
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue }

export type ConsumerBundlerId = 'esbuild' | 'rollup' | 'rolldown' | 'webpack'

export type ConsumerFixtureSourceKind = 'consumer' | 'compiler-transformed'

export type ConsumerFixtureApplicability =
  | Readonly<{
      status: 'active'
    }>
  | Readonly<{
      status: 'not-applicable'
      reason: 'expected-export-absent'
      expectedSpecifier: string
      activationStage: 'S6' | 'S9'
    }>

export interface ConsumerFixtureDefinition {
  readonly id: string
  readonly entryKind: 'single' | 'multi-entry-closure'
  readonly sourceKind: ConsumerFixtureSourceKind
  readonly source: string | null
  readonly expected: JsonValue | null
  readonly applicability: ConsumerFixtureApplicability
}

export interface ConsumerEmittedChunk {
  readonly file: string
  readonly code: string
  readonly imports: readonly string[]
  readonly modules: Readonly<Record<string, number>>
  readonly isEntry: boolean
  readonly entryId: string | null
}

export interface ConsumerBundleOutput {
  readonly chunks: readonly ConsumerEmittedChunk[]
}

export interface ConsumerBundleEntry {
  readonly fixtureId: string
  readonly path: string
}

export interface ConsumerBundleRequest {
  readonly buildId: string
  readonly entries: readonly ConsumerBundleEntry[]
  readonly consumerRoot: string
  readonly outputDirectory: string
}

export type ConsumerBundleAdapter = (
  request: ConsumerBundleRequest,
) => Promise<ConsumerBundleOutput>
