export interface AstNode {
  readonly type: string
  readonly parent?: AstNode
  readonly [key: string]: unknown
}

export interface RuleFix {
  readonly range?: readonly [number, number]
  readonly text?: string
}

export interface RuleFixer {
  readonly replaceText: (node: AstNode, text: string) => RuleFix
}

export interface ReportDescriptor {
  readonly node: AstNode
  readonly messageId: string
  readonly data?: Readonly<Record<string, string | number>>
  readonly fix?: (fixer: RuleFixer) => RuleFix | readonly RuleFix[] | null
}

export interface RuleContext<Options extends readonly unknown[] = readonly unknown[]> {
  readonly options: Options
  readonly report: (descriptor: ReportDescriptor) => void
}

export type RuleListener = Readonly<Record<string, (node: AstNode) => void>>

export interface RuleModule<Options extends readonly unknown[] = readonly unknown[]> {
  readonly meta: {
    readonly type: 'problem' | 'suggestion'
    readonly docs: {
      readonly description: string
      readonly recommended: boolean
    }
    readonly schema: readonly unknown[]
    readonly messages: Readonly<Record<string, string>>
    readonly fixable?: 'code'
  }
  readonly create: (context: RuleContext<Options>) => RuleListener
}

export interface FlatConfig {
  readonly name?: string
  readonly plugins?: Readonly<Record<string, unknown>>
  readonly rules?: Readonly<Record<string, 'off' | 'warn' | 'error'>>
}

export interface StopcockFpPlugin {
  readonly meta: {
    readonly name: string
    readonly version: string
  }
  readonly rules: Readonly<Record<string, unknown>>
  readonly configs: Readonly<Record<string, FlatConfig>>
}
