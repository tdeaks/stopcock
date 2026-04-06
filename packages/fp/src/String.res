/** Checks whether a string is empty. */
@genType
let isEmpty = (s: string): bool => s === ""

/** Returns the number of characters. */
@genType
let length = (s: string): int => String.length(s)

/** Removes whitespace from both ends. */
@genType
let trim = (s: string): string => String.trim(s)

/** Removes leading whitespace. */
@genType
let trimStart = (s: string): string => String.trimStart(s)

/** Removes trailing whitespace. */
@genType
let trimEnd = (s: string): string => String.trimEnd(s)

/** Checks whether the string starts with the given prefix. */
@genType
let startsWith = (s: string, search: string): bool => String.startsWith(s, search)

/** Checks whether the string ends with the given suffix. */
@genType
let endsWith = (s: string, search: string): bool => String.endsWith(s, search)

/** Checks whether the string contains the given substring. */
@genType
let includes = (s: string, search: string): bool => String.includes(s, search)

/** Splits by separator into an array. */
@genType
let split = (s: string, sep: string): array<string> => String.split(s, sep)

/** Converts to lowercase. */
@genType
let toLowerCase = (s: string): string => String.toLowerCase(s)

/** Converts to uppercase. */
@genType
let toUpperCase = (s: string): string => String.toUpperCase(s)

/** Extracts a section from `start` to `end` index. */
@genType
let slice = (s: string, start: int, end_: int): string => String.slice(s, ~start, ~end=end_)

/** Replaces all occurrences of a search string with a replacement. */
@genType
let replaceAll = (s: string, search: string, replacement: string): string =>
  String.replaceAll(s, search, replacement)

/** Repeats the string `n` times. */
@genType
let repeat = (s: string, n: int): string => String.repeat(s, n)

let matchRaw: (string, RegExp.t) => array<string> = %raw(`
  function(s, re) { return s.match(re) || []; }
`)
@genType let match_ = (s: string, regex: RegExp.t): array<string> => matchRaw(s, regex)

let replaceRaw: (string, RegExp.t, string) => string = %raw(`
  function(s, re, rep) { return s.replace(re, rep); }
`)
@genType let replaceRegex = (s: string, regex: RegExp.t, replacement: string): string => replaceRaw(s, regex, replacement)

@genType let test_ = (s: string, regex: RegExp.t): bool => RegExp.test(regex, s)

let toStringRaw: 'a => string = %raw(`function(x) { return String(x); }`)
@genType let toString_ = (x: 'a): string => toStringRaw(x)

@genType let capitalize = (s: string): string =>
  if s === "" { "" }
  else { String.toUpperCase(String.charAt(s, 0)) ++ String.sliceToEnd(s, ~start=1) }

@genType let uncapitalize = (s: string): string =>
  if s === "" { "" }
  else { String.toLowerCase(String.charAt(s, 0)) ++ String.sliceToEnd(s, ~start=1) }

let toCamelCaseRaw: string => string = %raw(`
  function(s) {
    return s.replace(/[-_\s]+(.)?/g, function(_, c) { return c ? c.toUpperCase() : ''; })
            .replace(/^[A-Z]/, function(c) { return c.toLowerCase(); });
  }
`)
@genType let toCamelCase = (s: string): string => toCamelCaseRaw(s)

let toKebabCaseRaw: string => string = %raw(`
  function(s) {
    return s.replace(/([a-z])([A-Z])/g, '$1-$2')
            .replace(/[\s_]+/g, '-')
            .toLowerCase();
  }
`)
@genType let toKebabCase = (s: string): string => toKebabCaseRaw(s)

let toSnakeCaseRaw: string => string = %raw(`
  function(s) {
    return s.replace(/([a-z])([A-Z])/g, '$1_$2')
            .replace(/[\s-]+/g, '_')
            .toLowerCase();
  }
`)
@genType let toSnakeCase = (s: string): string => toSnakeCaseRaw(s)

let toTitleCaseRaw: string => string = %raw(`
  function(s) {
    return s.replace(/\b\w/g, function(c) { return c.toUpperCase(); });
  }
`)
@genType let toTitleCase = (s: string): string => toTitleCaseRaw(s)

@genType let truncate = (s: string, maxLen: int, ellipsis: string): string =>
  if String.length(s) <= maxLen { s }
  else { String.slice(s, ~start=0, ~end=maxLen) ++ ellipsis }
