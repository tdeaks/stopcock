import { createScanner, LanguageVariant, SyntaxKind, type Scanner } from 'typescript/unstable/ast'
import {
  ASYNC_ROOT_EXPORTS,
  LEGACY_SUBPATHS,
  MANUAL_OPTIC_ROOT_EXPORTS,
  MANUAL_ROOT_EXPORTS,
  MANUAL_SUBPATHS,
  REMOVED_SUBPATHS,
  ROOT_NAMED_MIGRATIONS,
  ROOT_NAMESPACES,
  ROOT_RENAMED_MIGRATIONS,
  RUNTIME_COMPILER_ROOT_EXPORTS,
  SLIM_ROOT_EXPORTS,
} from './mappings'
import type { MigrationDiagnostic, TextEdit, TransformOptions, TransformResult } from './types'

interface Token {
  readonly kind: SyntaxKind
  readonly start: number
  readonly end: number
  readonly text: string
  readonly value: string
}

interface NamedImport {
  readonly exported: string
  readonly local: string
  readonly typeOnly: boolean
}

interface ParsedSpecifier extends NamedImport {
  readonly token: Token
}

type MatchKind = 'option' | 'result'

interface ImportedBindings {
  readonly matchFunctions: ReadonlyMap<string, MatchKind>
  readonly namespaces: ReadonlyMap<string, MatchKind>
  readonly asyncResultFunctions: ReadonlySet<string>
  readonly strictDefaultFunctions: ReadonlySet<string>
}

const scan = (code: string, fileName: string): readonly Token[] => {
  const languageVariant = /\.[cm]?[jt]sx$/u.test(fileName)
    ? LanguageVariant.JSX
    : LanguageVariant.Standard
  const scanner: Scanner = createScanner(true, languageVariant, code)
  const tokens: Token[] = []
  while (true) {
    const kind = scanner.scan()
    if (kind === SyntaxKind.EndOfFile) break
    tokens.push({
      kind,
      start: scanner.getTokenStart(),
      end: scanner.getTokenEnd(),
      text: scanner.getTokenText(),
      value: scanner.getTokenValue(),
    })
  }
  return tokens
}

const tokenName = (token: Token | undefined): string | undefined => {
  if (token === undefined) return undefined
  return token.value.length > 0 ? token.value : token.text
}

const diagnostic = (
  token: Token,
  code: string,
  severity: MigrationDiagnostic['severity'],
  message: string,
): MigrationDiagnostic => ({
  code,
  severity,
  message,
  start: token.start,
  length: token.end - token.start,
})

const quoteOf = (token: Token): "'" | '"' => (token.text.startsWith("'") ? "'" : '"')

const quoted = (value: string, quote: "'" | '"'): string => {
  const escaped = value.replaceAll('\\', '\\\\').replaceAll(quote, `\\${quote}`)
  return `${quote}${escaped}${quote}`
}

const namedText = (item: NamedImport, wholeTypeOnly: boolean): string => {
  const alias = item.exported === item.local ? item.exported : `${item.exported} as ${item.local}`
  return item.typeOnly && !wholeTypeOnly ? `type ${alias}` : alias
}

const renderNamedImport = (
  imports: readonly NamedImport[],
  module: string,
  quote: "'" | '"',
  semicolon: boolean,
  wholeTypeOnly: boolean,
): string => {
  const keyword = wholeTypeOnly ? 'import type' : 'import'
  const names = imports.map((item) => namedText(item, wholeTypeOnly)).join(', ')
  return `${keyword} { ${names} } from ${quoted(module, quote)}${semicolon ? ';' : ''}`
}

const renderNamespaceImport = (
  local: string,
  module: string,
  quote: "'" | '"',
  semicolon: boolean,
  typeOnly: boolean,
): string =>
  `import${typeOnly ? ' type' : ''} * as ${local} from ${quoted(module, quote)}${semicolon ? ';' : ''}`

const findMatchingBrace = (tokens: readonly Token[], openIndex: number): number | undefined => {
  let depth = 0
  for (let index = openIndex; index < tokens.length; index++) {
    if (tokens[index]!.kind === SyntaxKind.OpenBraceToken) depth++
    else if (tokens[index]!.kind === SyntaxKind.CloseBraceToken && --depth === 0) return index
  }
  return undefined
}

const findImportModule = (tokens: readonly Token[], start: number): Token | undefined => {
  for (let index = start; index < tokens.length; index++) {
    const token = tokens[index]!
    if (token.kind === SyntaxKind.SemicolonToken) return undefined
    if (
      token.kind === SyntaxKind.FromKeyword &&
      tokens[index + 1]?.kind === SyntaxKind.StringLiteral
    )
      return tokens[index + 1]
    if (index === start && token.kind === SyntaxKind.StringLiteral) return token
    if (index > start && token.kind === SyntaxKind.ImportKeyword) return undefined
  }
  return undefined
}

const parseSpecifiers = (
  tokens: readonly Token[],
  start: number,
  end: number,
  wholeTypeOnly: boolean,
): readonly ParsedSpecifier[] => {
  const output: ParsedSpecifier[] = []
  let segmentStart = start
  for (let index = start; index <= end; index++) {
    if (index < end && tokens[index]!.kind !== SyntaxKind.CommaToken) continue
    const segment = tokens.slice(segmentStart, index)
    segmentStart = index + 1
    if (segment.length === 0) continue

    let cursor = 0
    const hasTypeModifier =
      segment[cursor]?.kind === SyntaxKind.TypeKeyword &&
      segment[cursor + 1]?.kind !== SyntaxKind.AsKeyword
    const typeOnly = wholeTypeOnly || hasTypeModifier
    if (hasTypeModifier) cursor++
    const importedToken = segment[cursor]
    if (importedToken === undefined) continue
    cursor++

    let local = tokenName(importedToken)
    if (segment[cursor]?.kind === SyntaxKind.AsKeyword) {
      local = tokenName(segment[cursor + 1])
    }
    const imported = tokenName(importedToken)
    if (imported === undefined || local === undefined) continue
    output.push({
      exported: imported,
      local,
      typeOnly,
      token: importedToken,
    })
  }
  return output
}

const importedBindings = (tokens: readonly Token[]): ImportedBindings => {
  const matchFunctions = new Map<string, MatchKind>()
  const namespaces = new Map<string, MatchKind>()
  const asyncResultFunctions = new Set<string>()
  const strictDefaultFunctions = new Set<string>()

  for (let index = 0; index < tokens.length; index++) {
    if (tokens[index]?.kind !== SyntaxKind.ImportKeyword) continue
    let cursor = index + 1
    const wholeTypeOnly = tokens[cursor]?.kind === SyntaxKind.TypeKeyword
    if (wholeTypeOnly) cursor++
    if (tokens[cursor]?.kind === SyntaxKind.OpenParenToken) continue

    if (tokens[cursor]?.kind === SyntaxKind.AsteriskToken) {
      const local = tokenName(tokens[cursor + 2])
      const module = findImportModule(tokens, cursor)?.value
      if (!wholeTypeOnly && local !== undefined) {
        if (module === '@stopcock/fp/option') namespaces.set(local, 'option')
        else if (module === '@stopcock/fp/result') namespaces.set(local, 'result')
      }
      continue
    }

    if (tokens[cursor]?.kind !== SyntaxKind.OpenBraceToken) continue
    const closeIndex = findMatchingBrace(tokens, cursor)
    if (closeIndex === undefined) continue
    const module = tokens[closeIndex + 2]?.value
    if (tokens[closeIndex + 1]?.kind !== SyntaxKind.FromKeyword || typeof module !== 'string')
      continue
    const specifiers = parseSpecifiers(tokens, cursor + 1, closeIndex, wholeTypeOnly)

    for (const specifier of specifiers) {
      if (specifier.typeOnly) continue
      if (module === '@stopcock/fp') {
        if (specifier.exported === 'O') namespaces.set(specifier.local, 'option')
        else if (specifier.exported === 'R') namespaces.set(specifier.local, 'result')
        else if (specifier.exported === 'matchOption') {
          matchFunctions.set(specifier.local, 'option')
        } else if (specifier.exported === 'matchResult') {
          matchFunctions.set(specifier.local, 'result')
        } else if (specifier.exported === 'tryCatchAsync') {
          asyncResultFunctions.add(specifier.local)
        } else if (specifier.exported === 'getWithDefault') {
          strictDefaultFunctions.add(specifier.local)
        }
      } else if (module === '@stopcock/fp/option') {
        if (specifier.exported === 'match') {
          matchFunctions.set(specifier.local, 'option')
        } else if (specifier.exported === 'getWithDefault') {
          strictDefaultFunctions.add(specifier.local)
        }
      } else if (module === '@stopcock/fp/result') {
        if (specifier.exported === 'match') {
          matchFunctions.set(specifier.local, 'result')
        } else if (specifier.exported === 'tryCatchAsync') {
          asyncResultFunctions.add(specifier.local)
        }
      }
    }
  }

  return {
    matchFunctions,
    namespaces,
    asyncResultFunctions,
    strictDefaultFunctions,
  }
}

const migrateRootImports = (
  code: string,
  tokens: readonly Token[],
  edits: TextEdit[],
  diagnostics: MigrationDiagnostic[],
): void => {
  for (let index = 0; index < tokens.length; index++) {
    const importToken = tokens[index]!
    if (importToken.kind !== SyntaxKind.ImportKeyword) continue
    let cursor = index + 1
    if (tokens[cursor]?.kind === SyntaxKind.OpenParenToken) continue
    const wholeTypeOnly = tokens[cursor]?.kind === SyntaxKind.TypeKeyword
    if (wholeTypeOnly) cursor++

    if (tokens[cursor]?.kind !== SyntaxKind.OpenBraceToken) {
      const next = tokens[cursor]
      const module = findImportModule(tokens, cursor)
      if (next?.kind !== SyntaxKind.StringLiteral && module?.value === '@stopcock/fp') {
        diagnostics.push(
          diagnostic(
            importToken,
            'unsupported-root-import',
            'error',
            'Default and namespace imports from @stopcock/fp must be migrated manually.',
          ),
        )
      }
      continue
    }

    const closeIndex = findMatchingBrace(tokens, cursor)
    if (closeIndex === undefined) continue
    const fromToken = tokens[closeIndex + 1]
    const moduleToken = tokens[closeIndex + 2]
    if (
      fromToken?.kind !== SyntaxKind.FromKeyword ||
      moduleToken?.kind !== SyntaxKind.StringLiteral ||
      moduleToken.value !== '@stopcock/fp'
    )
      continue

    const semicolonToken = tokens[closeIndex + 3]
    const semicolon = semicolonToken?.kind === SyntaxKind.SemicolonToken
    const end = semicolon ? semicolonToken.end : moduleToken.end
    const importText = code.slice(importToken.start, end)
    if (importText.includes('//') || importText.includes('/*')) {
      diagnostics.push(
        diagnostic(
          importToken,
          'commented-root-import',
          'error',
          'A commented root import was left unchanged so comments are not discarded.',
        ),
      )
      continue
    }
    if (
      tokens.slice(cursor + 1, closeIndex).some((token) => token.kind === SyntaxKind.StringLiteral)
    ) {
      diagnostics.push(
        diagnostic(
          importToken,
          'unsupported-root-import',
          'error',
          'String-named root imports must be migrated manually.',
        ),
      )
      continue
    }

    const specifiers = parseSpecifiers(tokens, cursor + 1, closeIndex, wholeTypeOnly)
    const root: NamedImport[] = []
    const named = new Map<string, NamedImport[]>()
    const namespaces: Array<{
      local: string
      module: string
      typeOnly: boolean
    }> = []
    let migrated = false

    for (const specifier of specifiers) {
      const renamedRootExport = ROOT_RENAMED_MIGRATIONS[specifier.exported]
      if (renamedRootExport !== undefined) {
        root.push({
          exported: renamedRootExport,
          local: specifier.local,
          typeOnly: specifier.typeOnly,
        })
        diagnostics.push(
          diagnostic(
            specifier.token,
            'root-export-renamed',
            'info',
            `${specifier.exported} was renamed to ${renamedRootExport}.`,
          ),
        )
        migrated = true
        continue
      }

      const namespaceModule = ROOT_NAMESPACES[specifier.exported]
      if (namespaceModule !== undefined) {
        namespaces.push({
          local: specifier.local,
          module: `@stopcock/fp/${namespaceModule}`,
          typeOnly: specifier.typeOnly,
        })
        diagnostics.push(
          diagnostic(
            specifier.token,
            specifier.exported === 'Stream' || specifier.exported === 'D'
              ? 'semantic-migration'
              : 'module-import-migrated',
            specifier.exported === 'Stream' || specifier.exported === 'D' ? 'warning' : 'info',
            specifier.exported === 'Stream'
              ? 'Stream now resolves to Iter; rewrite method chains as pipe operations and review Option-returning partial terminals.'
              : specifier.exported === 'D'
                ? 'Dict now resolves to Record; partial operations return Option and should be reviewed.'
                : `${specifier.exported} was moved to @stopcock/fp/${namespaceModule}.`,
          ),
        )
        migrated = true
        continue
      }

      const migration = ROOT_NAMED_MIGRATIONS[specifier.exported]
      if (migration !== undefined) {
        const module = `@stopcock/fp/${migration.module}`
        const group = named.get(module) ?? []
        group.push({
          exported: migration.exported,
          local: specifier.local,
          typeOnly: specifier.typeOnly,
        })
        named.set(module, group)
        diagnostics.push(
          diagnostic(
            specifier.token,
            'named-import-migrated',
            'info',
            `${specifier.exported} was moved to ${module}.`,
          ),
        )
        migrated = true
        continue
      }

      root.push(specifier)
      if (MANUAL_ROOT_EXPORTS.has(specifier.exported)) {
        const runtimeCompiler = RUNTIME_COMPILER_ROOT_EXPORTS.has(specifier.exported)
        const asyncResult = ASYNC_ROOT_EXPORTS.has(specifier.exported)
        const optic = MANUAL_OPTIC_ROOT_EXPORTS.has(specifier.exported)
        const strictDefault = specifier.exported === 'getWithDefault'
        diagnostics.push(
          diagnostic(
            specifier.token,
            runtimeCompiler
              ? 'runtime-jit-removed'
              : asyncResult
                ? 'async-result-removed'
                : optic
                  ? 'manual-optics-migration'
                  : strictDefault
                    ? 'strict-default-migration'
                    : 'manual-module-migration',
            'error',
            runtimeCompiler
              ? `${specifier.exported} has no FP 2 runtime equivalent; configure @stopcock/fp-compiler instead.`
              : asyncResult
                ? 'tryCatchAsync moved out of synchronous Result; migrate to Task.tryPromise.'
                : optic
                  ? `${specifier.exported} requires a manual migration to the polymorphic optic API.`
                  : strictDefault
                    ? 'getWithDefault requires a lazy getOrElse handler in FP 2.'
                    : `${specifier.exported} has no single FP 2 module equivalent.`,
          ),
        )
      } else if (!SLIM_ROOT_EXPORTS.has(specifier.exported)) {
        diagnostics.push(
          diagnostic(
            specifier.token,
            'unmapped-root-export',
            'warning',
            `${specifier.exported} is not in the FP 2 slim root and has no safe automatic mapping.`,
          ),
        )
      }
    }

    if (!migrated) continue
    const quote = quoteOf(moduleToken)
    const lines: string[] = []
    if (root.length > 0) {
      lines.push(renderNamedImport(root, '@stopcock/fp', quote, semicolon, wholeTypeOnly))
    }
    for (const item of namespaces) {
      lines.push(renderNamespaceImport(item.local, item.module, quote, semicolon, item.typeOnly))
    }
    for (const [module, imports] of named) {
      lines.push(renderNamedImport(imports, module, quote, semicolon, wholeTypeOnly))
    }
    edits.push({
      start: importToken.start,
      end,
      text: lines.join('\n'),
      reason: 'Split legacy FP root imports into focused FP 2 subpaths',
    })
    index = closeIndex + 2
  }
}

const migrateNamedSubpathImports = (
  tokens: readonly Token[],
  edits: TextEdit[],
  diagnostics: MigrationDiagnostic[],
): void => {
  for (let index = 0; index < tokens.length; index++) {
    if (tokens[index]?.kind !== SyntaxKind.ImportKeyword) continue
    let cursor = index + 1
    const wholeTypeOnly = tokens[cursor]?.kind === SyntaxKind.TypeKeyword
    if (wholeTypeOnly) cursor++
    if (tokens[cursor]?.kind !== SyntaxKind.OpenBraceToken) continue
    const closeIndex = findMatchingBrace(tokens, cursor)
    if (closeIndex === undefined) continue
    const module = tokens[closeIndex + 2]?.value
    if (
      tokens[closeIndex + 1]?.kind !== SyntaxKind.FromKeyword ||
      (module !== '@stopcock/fp/option' && module !== '@stopcock/fp/result')
    )
      continue

    const specifiers = parseSpecifiers(tokens, cursor + 1, closeIndex, wholeTypeOnly)
    for (const specifier of specifiers) {
      if (specifier.exported === 'orElseWith') {
        const aliased = specifier.local !== specifier.exported
        edits.push({
          start: specifier.token.start,
          end: specifier.token.end,
          text: aliased ? 'orElse' : 'orElse as orElseWith',
          reason: `Rename ${module}/orElseWith to orElse`,
        })
        diagnostics.push(
          diagnostic(
            specifier.token,
            'subpath-export-renamed',
            'info',
            `${module}/orElseWith was renamed to orElse.`,
          ),
        )
      } else if (module === '@stopcock/fp/option' && specifier.exported === 'getWithDefault') {
        diagnostics.push(
          diagnostic(
            specifier.token,
            'strict-default-migration',
            'error',
            'getWithDefault requires a lazy getOrElse handler in FP 2.',
          ),
        )
      } else if (module === '@stopcock/fp/result' && specifier.exported === 'tryCatchAsync') {
        diagnostics.push(
          diagnostic(
            specifier.token,
            'async-result-removed',
            'error',
            'tryCatchAsync moved out of synchronous Result; migrate to Task.tryPromise.',
          ),
        )
      }
    }
  }
}

interface CallArguments {
  readonly closeIndex: number
  readonly commaIndex: number
}

const twoCallArguments = (
  tokens: readonly Token[],
  openIndex: number,
): CallArguments | undefined => {
  let parentheses = 1
  let brackets = 0
  let braces = 0
  let commaIndex: number | undefined

  for (let index = openIndex + 1; index < tokens.length; index++) {
    const kind = tokens[index]!.kind
    if (kind === SyntaxKind.OpenParenToken) parentheses++
    else if (kind === SyntaxKind.CloseParenToken) {
      parentheses--
      if (parentheses === 0) {
        return commaIndex === undefined ? undefined : { closeIndex: index, commaIndex }
      }
    } else if (kind === SyntaxKind.OpenBracketToken) brackets++
    else if (kind === SyntaxKind.CloseBracketToken) brackets--
    else if (kind === SyntaxKind.OpenBraceToken) braces++
    else if (kind === SyntaxKind.CloseBraceToken) braces--
    else if (
      kind === SyntaxKind.CommaToken &&
      parentheses === 1 &&
      brackets === 0 &&
      braces === 0
    ) {
      if (commaIndex !== undefined) return undefined
      commaIndex = index
    }
  }
  return undefined
}

const matchCallAt = (
  tokens: readonly Token[],
  index: number,
  bindings: ImportedBindings,
): { readonly kind: MatchKind; readonly openIndex: number } | undefined => {
  const name = tokenName(tokens[index])
  if (name === undefined) return undefined
  const previous = tokens[index - 1]?.kind
  if (previous === SyntaxKind.DotToken || previous === SyntaxKind.QuestionDotToken) {
    return undefined
  }

  const directKind = bindings.matchFunctions.get(name)
  if (directKind !== undefined && tokens[index + 1]?.kind === SyntaxKind.OpenParenToken) {
    return { kind: directKind, openIndex: index + 1 }
  }

  const namespaceKind = bindings.namespaces.get(name)
  if (
    namespaceKind !== undefined &&
    tokens[index + 1]?.kind === SyntaxKind.DotToken &&
    tokenName(tokens[index + 2]) === 'match' &&
    tokens[index + 3]?.kind === SyntaxKind.OpenParenToken
  ) {
    return { kind: namespaceKind, openIndex: index + 3 }
  }
  return undefined
}

const migrateMatchCalls = (
  code: string,
  tokens: readonly Token[],
  bindings: ImportedBindings,
  edits: TextEdit[],
  diagnostics: MigrationDiagnostic[],
): void => {
  for (let index = 0; index < tokens.length; index++) {
    const call = matchCallAt(tokens, index, bindings)
    if (call === undefined) continue
    const args = twoCallArguments(tokens, call.openIndex)
    if (args === undefined) continue

    const open = tokens[call.openIndex]!
    const comma = tokens[args.commaIndex]!
    const close = tokens[args.closeIndex]!
    const first = code.slice(open.end, comma.start).trim()
    const second = code.slice(comma.end, close.start).trim()
    if (
      first.length === 0 ||
      second.length === 0 ||
      first.startsWith('...') ||
      second.startsWith('...')
    )
      continue

    const left = call.kind === 'option' ? 'none' : 'err'
    const right = call.kind === 'option' ? 'some' : 'ok'
    edits.push({
      start: open.end,
      end: close.start,
      text: `{ ${left}: ${first}, ${right}: ${second} }`,
      reason: `Replace positional ${call.kind} match handlers with a named handler object`,
    })
    diagnostics.push(
      diagnostic(
        tokens[index]!,
        'match-handlers-migrated',
        'info',
        `${call.kind === 'option' ? 'Option' : 'Result'}.match now accepts named handlers.`,
      ),
    )
    index = args.closeIndex
  }
}

const diagnoseRemovedCalls = (
  tokens: readonly Token[],
  bindings: ImportedBindings,
  diagnostics: MigrationDiagnostic[],
): void => {
  const seen = new Set<number>()
  const report = (token: Token, code: string, message: string): void => {
    if (seen.has(token.start)) return
    seen.add(token.start)
    diagnostics.push(diagnostic(token, code, 'error', message))
  }

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!
    const name = tokenName(token)
    if (name === undefined) continue
    const previous = tokens[index - 1]?.kind
    if (previous !== SyntaxKind.DotToken && previous !== SyntaxKind.QuestionDotToken) {
      if (
        bindings.asyncResultFunctions.has(name) &&
        tokens[index + 1]?.kind === SyntaxKind.OpenParenToken
      ) {
        report(
          token,
          'async-result-removed',
          'tryCatchAsync moved out of synchronous Result; migrate to Task.tryPromise.',
        )
      } else if (
        bindings.strictDefaultFunctions.has(name) &&
        tokens[index + 1]?.kind === SyntaxKind.OpenParenToken
      ) {
        report(
          token,
          'strict-default-migration',
          'getWithDefault requires a lazy getOrElse handler in FP 2.',
        )
      }
    }

    const namespaceKind = bindings.namespaces.get(name)
    if (
      namespaceKind === 'result' &&
      tokens[index + 1]?.kind === SyntaxKind.DotToken &&
      tokenName(tokens[index + 2]) === 'tryCatchAsync'
    ) {
      report(
        tokens[index + 2]!,
        'async-result-removed',
        'Result.tryCatchAsync moved to Task.tryPromise.',
      )
    } else if (
      namespaceKind === 'option' &&
      tokens[index + 1]?.kind === SyntaxKind.DotToken &&
      tokenName(tokens[index + 2]) === 'getWithDefault'
    ) {
      report(
        tokens[index + 2]!,
        'strict-default-migration',
        'Option.getWithDefault requires a lazy getOrElse handler in FP 2.',
      )
    }
  }
}

const isModuleLiteral = (tokens: readonly Token[], index: number): boolean => {
  const previous = tokens[index - 1]
  const beforePrevious = tokens[index - 2]
  if (
    previous?.kind === SyntaxKind.FromKeyword ||
    previous?.kind === SyntaxKind.ImportKeyword ||
    previous?.kind === SyntaxKind.ExportKeyword
  )
    return true
  return (
    previous?.kind === SyntaxKind.OpenParenToken &&
    beforePrevious?.kind === SyntaxKind.ImportKeyword
  )
}

const migrateLegacySubpaths = (
  tokens: readonly Token[],
  edits: TextEdit[],
  diagnostics: MigrationDiagnostic[],
): void => {
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!
    if (token.kind !== SyntaxKind.StringLiteral || !isModuleLiteral(tokens, index)) continue
    if (REMOVED_SUBPATHS.has(token.value)) {
      diagnostics.push(
        diagnostic(
          token,
          'manual-module-migration',
          'error',
          `${token.value} was removed and has no single FP 2 module equivalent.`,
        ),
      )
      continue
    }
    const manualReplacement = MANUAL_SUBPATHS[token.value]
    if (manualReplacement !== undefined) {
      diagnostics.push(
        diagnostic(
          token,
          'manual-optics-migration',
          'error',
          `${token.value} requires a manual migration to ${manualReplacement}.`,
        ),
      )
      continue
    }
    const replacement = LEGACY_SUBPATHS[token.value]
    if (replacement === undefined) continue
    edits.push({
      start: token.start,
      end: token.end,
      text: quoted(replacement, quoteOf(token)),
      reason: `Replace ${token.value} with ${replacement}`,
    })
    const semantic = token.value.endsWith('/stream') || token.value.endsWith('/dict')
    diagnostics.push(
      diagnostic(
        token,
        semantic ? 'semantic-migration' : 'subpath-migrated',
        semantic ? 'warning' : 'info',
        token.value.endsWith('/stream')
          ? 'Stream was replaced by Iter; rewrite method chains as pipe operations and review Option-returning partial terminals.'
          : token.value.endsWith('/dict')
            ? 'Dict was replaced by Record; review Option-returning partial operations.'
            : `${token.value} was replaced by ${replacement}.`,
      ),
    )
  }
}

const applyEdits = (source: string, edits: readonly TextEdit[]): string => {
  const ordered = [...edits].sort((left, right) => right.start - left.start)
  let previousStart = source.length
  let output = source
  for (const edit of ordered) {
    if (edit.end > previousStart) {
      throw new Error(`Overlapping codemod edits at ${edit.start}:${edit.end}`)
    }
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end)
    previousStart = edit.start
  }
  return output
}

export const transformSource = (
  code: string,
  fileName = 'source.ts',
  options: TransformOptions = {},
): TransformResult => {
  const tokens = scan(code, fileName)
  const edits: TextEdit[] = []
  const diagnostics: MigrationDiagnostic[] = []
  const bindings = importedBindings(tokens)
  migrateLegacySubpaths(tokens, edits, diagnostics)
  migrateNamedSubpathImports(tokens, edits, diagnostics)
  if (options.rewriteRootImports !== false) {
    migrateRootImports(code, tokens, edits, diagnostics)
    migrateMatchCalls(code, tokens, bindings, edits, diagnostics)
  }
  diagnoseRemovedCalls(tokens, bindings, diagnostics)

  const orderedEdits = edits.sort((left, right) => left.start - right.start)
  return {
    code: applyEdits(code, orderedEdits),
    changed: orderedEdits.length > 0,
    edits: orderedEdits,
    diagnostics: diagnostics.sort((left, right) => left.start - right.start),
  }
}
