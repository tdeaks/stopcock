const STALE_DUAL_ONLY_PATTERN =
  /\b(?:curried[- ]only|data[- ]last[- ]only|pipe[- ]only|only\s+(?:supports?|offers?|exposes?)\s+(?:the\s+)?(?:curried|data[- ]last)(?:\s+(?:form|calls?|api))?)\b/giu

const STALE_CURRENT_VERSION_PATTERN = /\b(?:@stopcock\/fp|FP)\s+(?:v?2\.0|2\.x)\b/giu

const DATA_FIRST_REFERENCE_PATTERN =
  /\b(?:data[- ]first|direct(?:ly)?|full[- ]arity|complete argument(?: list)?s?)\b/iu
const DATA_LAST_REFERENCE_PATTERN =
  /\b(?:data[- ]last|curried?|curries|curry|partial(?:ly)? appl(?:y|ied|ication))\b|pipe\s*\(/iu
const UNICODE_EM_DASH_PATTERN = /\u2014/gu

const HISTORICAL_VERSION_REFERENCE_FILES = new Set([
  'apps/docs/src/content/docs/api/dict.mdx',
  'apps/docs/src/content/docs/api/lenses.mdx',
  'apps/docs/src/content/docs/api/logic.mdx',
  'apps/docs/src/content/docs/blog/how-pipe-fuses-your-loops.mdx',
  'apps/docs/src/content/docs/blog/zustand-without-the-spread.mdx',
  'apps/docs/src/content/docs/concepts/explain.mdx',
  'apps/docs/src/content/docs/libraries/stream.mdx',
  'packages/fp/README.md',
])

export const DUAL_REFERENCE_DOCUMENTS = Object.freeze([
  'apps/docs/src/content/docs/api/modules.mdx',
  'apps/docs/src/content/docs/getting-started.mdx',
  'apps/docs/src/content/docs/cookbook.mdx',
  'apps/docs/src/content/docs/libraries/fp.mdx',
  'apps/docs/src/content/docs/libraries/autodiff.mdx',
  'apps/docs/src/content/docs/libraries/color.mdx',
  'apps/docs/src/content/docs/libraries/diff.mdx',
  'apps/docs/src/content/docs/libraries/svg.mdx',
  'packages/fp/README.md',
  'packages/autodiff/README.md',
  'packages/color/README.md',
  'packages/diff/README.md',
  'packages/svg/README.md',
])

export const NON_DUAL_OVERLOAD_EXCLUSIONS = Object.freeze(new Set(['./result:liftThrowable']))
export const EXPECTED_DUAL_MODULE_COUNT = 29
export const EXPECTED_DUAL_EXPORT_COUNT = 491
export const EXPECTED_COMPANION_DUAL_EXPORT_COUNT = 148

export const COMPANION_DUAL_REFERENCE_MANIFEST = Object.freeze({
  autodiff: {
    page: 'apps/docs/src/content/docs/libraries/autodiff.mdx',
    entries: ['src/index.ts', 'src/tape.ts'],
    namespaces: [],
    operations: [
      'add',
      'sub',
      'mul',
      'div',
      'pow',
      'leakyRelu',
      'vecAdd',
      'vecSub',
      'vecScale',
      'vecDot',
      'matAdd',
      'matSub',
      'matMul',
      'matScale',
      'accumulate',
      'record',
      'backward',
      'gradOf',
    ],
  },
  diff: {
    page: 'apps/docs/src/content/docs/libraries/diff.mdx',
    entries: ['src/index.ts'],
    namespaces: [],
    operations: [
      'diff',
      'diffWith',
      'apply',
      'applyUnsafe',
      'compose',
      'rebase',
      'fromLens',
      'fromTraversal',
    ],
  },
  svg: {
    page: 'apps/docs/src/content/docs/libraries/svg.mdx',
    entries: ['src/index.ts', 'src/la/index.ts'],
    namespaces: ['path'],
    operations: [
      'toClip',
      'toMask',
      'fill',
      'stroke',
      'opacity',
      'translate',
      'rotate',
      'scale',
      'skewX',
      'skewY',
      'clip',
      'mask',
      'filter',
      'viewBox',
      'path.lineTo',
      'path.curveTo',
      'path.quadTo',
      'path.arcTo',
      'path.close',
      'path.toNode',
      'mul',
      'render',
      'lerpTransform',
      'toQuad',
      'hitTest',
      'fitBezier',
      'alignToPrincipalAxis',
      'symmetry',
    ],
  },
  color: {
    page: 'apps/docs/src/content/docs/libraries/color.mdx',
    entries: ['src/index.ts'],
    namespaces: [],
    operations: [
      'convert',
      'lighten',
      'darken',
      'saturate',
      'desaturate',
      'adjustHue',
      'adjustAlpha',
      'mix',
      'mixIn',
      'hueInterpolate',
      'contrastRatio',
      'meetsAA',
      'meetsAAA',
      'meetsAALarge',
      'deltaE',
      'deltaEOK',
      'inGamut',
      'toGamut',
      'analogous',
      'simulate',
      'minDistinguishableDistance',
      'convertBuffer',
      'simulateBuffer',
      'toGamutBuffer',
    ],
  },
  img: {
    page: 'apps/docs/src/content/docs/libraries/img.mdx',
    entries: ['src/index.ts'],
    namespaces: [],
    operations: [
      'brightness',
      'contrast',
      'threshold',
      'saturate',
      'colorize',
      'duotone',
      'simulateCVD',
      'tonemapToGamut',
      'convolve',
      'blur',
      'gaussianBlur',
      'sharpen',
      'resize',
      'crop',
      'houghLines',
    ],
  },
  date: {
    page: 'apps/docs/src/content/docs/libraries/date.mdx',
    entries: ['src/index.ts'],
    namespaces: ['Tz'],
    operations: [
      'clamp',
      'isBefore',
      'isAfter',
      'isEqual',
      'isSameDay',
      'isSameMonth',
      'isSameYear',
      'isBetween',
      'add',
      'subtract',
      'startOf',
      'endOf',
      'setYear',
      'setMonth',
      'setDay',
      'setHours',
      'setMinutes',
      'setSeconds',
      'diff',
      'diffInDays',
      'diffInHours',
      'diffInMinutes',
      'diffInSeconds',
      'diffInMonths',
      'diffInYears',
      'roundTo',
      'ceilTo',
      'floorTo',
      'snapTo',
      'addDuration',
      'subtractDuration',
      'durationToUnit',
      'range',
      'rangeBy',
      'sequence',
      'addBusinessDays',
      'subtractBusinessDays',
      'businessDaysBetween',
      'addBusinessDaysWithHolidays',
      'format',
      'parse',
      'tryParse',
      'Tz.getYear',
      'Tz.getMonth',
      'Tz.getDay',
      'Tz.getHours',
      'Tz.getMinutes',
      'Tz.getSeconds',
      'Tz.isSameDay',
      'Tz.startOf',
      'Tz.endOf',
      'Tz.add',
      'Tz.subtract',
      'Tz.format',
      'Tz.diff',
    ],
  },
})

const matchesWithLineNumbers = (source, pattern) => {
  const matches = []
  for (const match of source.matchAll(pattern)) {
    const index = match.index ?? 0
    matches.push({
      line: source.slice(0, index).split('\n').length,
      text: match[0],
    })
  }
  return matches
}

export const findStaleDualOnlyClaims = (source) =>
  matchesWithLineNumbers(source, STALE_DUAL_ONLY_PATTERN)

export const findStaleCurrentVersionClaims = (document, source) =>
  HISTORICAL_VERSION_REFERENCE_FILES.has(document)
    ? []
    : matchesWithLineNumbers(source, STALE_CURRENT_VERSION_PATTERN)

export const findUnicodeEmDashes = (source) =>
  matchesWithLineNumbers(source, UNICODE_EM_DASH_PATTERN)

export const missingDualReferenceLanes = (source) => {
  const missing = []
  if (!DATA_FIRST_REFERENCE_PATTERN.test(source)) missing.push('data-first')
  if (!DATA_LAST_REFERENCE_PATTERN.test(source)) missing.push('data-last')
  return missing
}

export const parseFpDualCatalogue = (source) => {
  const sections = new Map()
  const headingPattern = /^### `@stopcock\/fp\/([^`]+)` \((\d+)\)$/gmu
  const headings = [...source.matchAll(headingPattern)]
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index]
    const moduleName = heading[1]
    const expectedCount = Number(heading[2])
    const start = (heading.index ?? 0) + heading[0].length
    const end = headings[index + 1]?.index ?? source.length
    const body = source.slice(start, end)
    const operations = [...body.matchAll(/^\|[ \t]+`([^`]+)`[ \t]+\|/gmu)].map((match) => match[1])
    sections.set(`./${moduleName}`, { expectedCount, operations })
  }
  return sections
}

export const hasOperationReference = (source, operation) => {
  const escaped = operation.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  return new RegExp(`(?:^|[^\\w.])${escaped}\\s*\\(`, 'mu').test(source)
}
