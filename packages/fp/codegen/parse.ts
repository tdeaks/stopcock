// Minimal parser combinators for the dual inliner. Absolute-position model:
// every Parser reads the full input from `pos` and returns the advanced position.

export type ParseResult<T> =
  | { success: true; value: T; remaining: string; position: number }
  | { success: false; expected: string; position: number }

export type Parser<T> = (input: string, pos: number) => ParseResult<T>

export const char =
  (c: string): Parser<string> =>
  (input, pos) =>
    input[pos] === c
      ? { success: true, value: c, remaining: input.slice(pos + 1), position: pos + 1 }
      : { success: false, expected: `'${c}'`, position: pos }

export const string =
  (s: string): Parser<string> =>
  (input, pos) =>
    input.startsWith(s, pos)
      ? {
          success: true,
          value: s,
          remaining: input.slice(pos + s.length),
          position: pos + s.length,
        }
      : { success: false, expected: `'${s}'`, position: pos }

export const seq =
  (...parsers: Parser<any>[]): Parser<any[]> =>
  (input, pos) => {
    const values: any[] = []
    let cursor = pos
    for (const p of parsers) {
      const r = p(input, cursor)
      if (!r.success) return r
      values.push(r.value)
      cursor = r.position
    }
    return { success: true, value: values, remaining: input.slice(cursor), position: cursor }
  }

export const map =
  <A, B>(parser: Parser<A>, fn: (a: A) => B): Parser<B> =>
  (input, pos) => {
    const r = parser(input, pos)
    return r.success ? { ...r, value: fn(r.value) } : r
  }

export const run = <T>(parser: Parser<T>, input: string): ParseResult<T> => parser(input, 0)
