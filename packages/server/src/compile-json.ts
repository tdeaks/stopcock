/**
 * Schema-driven JSON serializer compiler. Emits a single straight-line
 * function per schema with no closures or IIFEs — the generated body is just
 * `let __s = ''; __s += ...; return __s;` so V8/JSC can keep the string
 * builder in a hot register.
 *
 * Trade-off: the value must match the schema. There is no runtime validation;
 * wrong shape produces wrong JSON.
 */

export type JsonSchema =
  | { readonly type: 'string' }
  | { readonly type: 'number' }
  | { readonly type: 'integer' }
  | { readonly type: 'boolean' }
  | { readonly type: 'null' }
  | { readonly type: 'array'; readonly items: JsonSchema }
  | {
      readonly type: 'object'
      readonly properties: Readonly<Record<string, JsonSchema>>
      readonly required?: readonly string[]
    }

export type JsonSerializer = (value: unknown) => string

/**
 * Internal variant: returns the body string plus a byteLength when the
 * serializer can prove the output is ASCII-only. byteLength is null when any
 * string fell through to JSON.stringify (escape chars or quotes) OR contained
 * any char with codepoint >= 128. Adapter callers MUST fall back to
 * Buffer.byteLength when this is null.
 *
 * Powers the byteLength fast path on the value DispatchResult.
 */
export type JsonSerializerWithBytes = (value: unknown) => { body: string; byteLength: number | null }

let gensym = 0
const fresh = (prefix: string) => `${prefix}${gensym++}`

/**
 * Emit statements that append the serialization of `accessor` to `__s`.
 * Uses statement-style codegen instead of expressions to avoid intermediate
 * IIFEs around arrays / mixed-required objects.
 *
 * When `trackBytes` is true, also mutates `__bytesOk` (set to false on any
 * non-ASCII char or unsafe escape) so the wrapper can decide whether
 * body.length equals byteLength.
 */
const emitAppend = (schema: JsonSchema, accessor: string, lines: string[], trackBytes: boolean): void => {
  switch (schema.type) {
    case 'string': {
      // Fast path for ASCII strings with no escapes — skip JSON.stringify's
      // walk by checking the whole string with a tight loop, and concat the
      // quotes directly. Real-world response payloads are mostly this shape.
      // Null is emitted as JSON null so nullable string fields don't crash.
      const v = fresh('__v')
      const idx = fresh('__si')
      const safe = fresh('__ss')
      // When tracking bytes: same loop, but also flag non-ASCII (>=128) so a
      // safe-but-multibyte string still flips __bytesOk. Falling through to
      // JSON.stringify also flips it conservatively (we don't peek inside
      // the stringified output).
      if (trackBytes) {
        lines.push(`{const ${v}=${accessor};if(${v}===null){__s+='null'}else{let ${safe}=true;for(let ${idx}=0;${idx}<${v}.length;${idx}++){const __sc=${v}.charCodeAt(${idx});if(__sc>=128){__bytesOk=false}if(__sc<32||__sc===34||__sc===92){${safe}=false;break}}if(${safe}){__s+='"'+${v}+'"'}else{__s+=JSON.stringify(${v});__bytesOk=false}}}`)
      } else {
        lines.push(`{const ${v}=${accessor};if(${v}===null){__s+='null'}else{let ${safe}=true;for(let ${idx}=0;${idx}<${v}.length;${idx}++){const __sc=${v}.charCodeAt(${idx});if(__sc<32||__sc===34||__sc===92){${safe}=false;break}}__s+=${safe}?'"'+${v}+'"':JSON.stringify(${v})}}`)
      }
      return
    }
    case 'number':
    case 'integer':
      // Mirror JSON.stringify's behavior: NaN/Infinity become null.
      lines.push(`{const __n=${accessor};__s+=(__n===__n&&__n!==Infinity&&__n!==-Infinity)?String(__n):'null'}`)
      return
    case 'boolean':
      lines.push(`__s+=(${accessor}?'true':'false')`)
      return
    case 'null':
      lines.push(`__s+='null'`)
      return
    case 'array': {
      const idx = fresh('__i')
      const arr = fresh('__a')
      // Large-array fallback. V8's JSON.stringify is C++ and beats the
      // per-element compiled walk above ~64 items (measured in serializer.bench).
      // Below 256 we keep our walk (cheap to inline, byteLength tracking works).
      // Above, hand off and conservatively flag bytes as unknown.
      const fbBytes = trackBytes ? ';__bytesOk=false' : ''
      lines.push(`{const ${arr}=${accessor};if(${arr}.length>=256){__s+=JSON.stringify(${arr})${fbBytes}}else if(${arr}.length===0){__s+='[]'}else{__s+='[';for(let ${idx}=0;${idx}<${arr}.length;${idx}++){if(${idx}>0)__s+=',';`)
      emitAppend(schema.items, `${arr}[${idx}]`, lines, trackBytes)
      lines.push(`}__s+=']'}}`)
      return
    }
    case 'object': {
      const entries = Object.entries(schema.properties)
      if (entries.length === 0) {
        lines.push(`__s+='{}'`)
        return
      }
      const required = new Set(schema.required ?? [])
      const allRequired = entries.every(([k]) => required.has(k))

      if (allRequired) {
        // Fixed structure — emit commas inline, no flag.
        lines.push(`__s+='{'`)
        for (let i = 0; i < entries.length; i++) {
          const [key, sub] = entries[i]!
          if (i > 0) lines.push(`__s+=','`)
          lines.push(`__s+=${JSON.stringify(JSON.stringify(key) + ':')}`)
          emitAppend(sub, `${accessor}[${JSON.stringify(key)}]`, lines, trackBytes)
        }
        lines.push(`__s+='}'`)
        return
      }

      // Mixed required/optional — track first-key with a local flag.
      const flag = fresh('__f')
      lines.push(`__s+='{';let ${flag}=true`)
      for (const [key, sub] of entries) {
        const propAccessor = `${accessor}[${JSON.stringify(key)}]`
        const keyPart = JSON.stringify(JSON.stringify(key) + ':')
        const emitKey = `if(${flag}){__s+=${keyPart};${flag}=false}else{__s+=${JSON.stringify(',' + JSON.stringify(key) + ':')}}`
        if (required.has(key)) {
          lines.push(emitKey)
          emitAppend(sub, propAccessor, lines, trackBytes)
        } else {
          lines.push(`if(${propAccessor}!==undefined){${emitKey};`)
          emitAppend(sub, propAccessor, lines, trackBytes)
          lines.push(`}`)
        }
      }
      lines.push(`__s+='}'`)
      return
    }
  }
}

export const compileJsonSerializer = (schema: JsonSchema): JsonSerializer => {
  gensym = 0
  const lines: string[] = ['let __s=""']
  emitAppend(schema, 'v', lines, false)
  lines.push('return __s')
  const body = lines.join(';')
  // eslint-disable-next-line no-new-func
  return new Function('v', body) as JsonSerializer
}

export const compileJsonSerializerWithBytes = (schema: JsonSchema): JsonSerializerWithBytes => {
  gensym = 0
  // `__bytesOk` starts true; the string emit flips it on any non-ASCII char
  // or unsafe escape. Schemas with no string fields (all numbers/booleans/
  // nulls/arrays of same) keep __bytesOk true and pay nothing.
  const lines: string[] = ['let __s=""', 'let __bytesOk=true']
  emitAppend(schema, 'v', lines, true)
  lines.push('return {body:__s,byteLength:__bytesOk?__s.length:null}')
  const body = lines.join(';')
  // eslint-disable-next-line no-new-func
  return new Function('v', body) as JsonSerializerWithBytes
}
