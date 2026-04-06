/** Lightweight dual without opcode/fusion support. Used by lens and other modules that only need currying. */
export function dual(arity: number, body: Function): any {
  if (arity === 2) {
    return function () {
      if (arguments.length >= 2) return body(arguments[0], arguments[1])
      const a0 = arguments[0]
      return (data: any) => body(data, a0)
    }
  }
  if (arity === 3) {
    return function () {
      if (arguments.length >= 3) return body(arguments[0], arguments[1], arguments[2])
      const a0 = arguments[0], a1 = arguments[1]
      return (data: any) => body(data, a0, a1)
    }
  }
  if (arity === 4) {
    return function () {
      if (arguments.length >= 4) return body(arguments[0], arguments[1], arguments[2], arguments[3])
      const a0 = arguments[0], a1 = arguments[1], a2 = arguments[2]
      return (data: any) => body(data, a0, a1, a2)
    }
  }
  return function (...args: any[]) {
    if (args.length >= arity) return (body as any)(...args)
    return (data: any) => (body as any)(data, ...args)
  }
}
