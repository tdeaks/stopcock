/**
 * Fast-path response helpers. Returning one of these from a handler lets the
 * adapter skip `new Response()` / `new Blob()` / stream pumping and write the
 * JSON body directly. Use these where you'd otherwise reach for
 * `Response.json(value, { status })`.
 *
 *   route.post('/orders').handler(async (ctx) =>
 *     json(201, await ctx.request.json()),
 *   )
 *
 * `Response.json(...)` still works — it just goes through the slow path.
 */

export const STOPCOCK_FAST_JSON = Symbol.for('stopcock.fastJson')

export type FastJson = {
  readonly [STOPCOCK_FAST_JSON]: true
  readonly status: number
  readonly value: unknown
  readonly headers?: Readonly<Record<string, string>>
}

export const json = (
  status: number,
  value: unknown,
  headers?: Readonly<Record<string, string>>,
): FastJson => ({ [STOPCOCK_FAST_JSON]: true, status, value, headers })

export const isFastJson = (v: unknown): v is FastJson =>
  v != null && typeof v === 'object' && (v as { [STOPCOCK_FAST_JSON]?: unknown })[STOPCOCK_FAST_JSON] === true
