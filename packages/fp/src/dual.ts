import { OP_CODES, OP_NON_FUSEABLE } from './opcodes'

export function dual(arity: number, body: Function, tag?: { op: string }): any {
  const opcode = tag ? (OP_CODES[tag.op] ?? OP_NON_FUSEABLE) : 0

  if (tag) {
    if (arity <= 1) {
      // Arity-1 tagged: tag the body directly, skip wrapper
      (body as any)._op = opcode
      return body
    }
    if (arity === 2) {
      return function () {
        if (arguments.length >= 2) return body(arguments[0], arguments[1])
        const a0 = arguments[0]
        const dataLast = (data: any) => body(data, a0)
        dataLast._op = opcode
        dataLast._fn = a0
        // No _args allocation — fusion engine reads _fn directly
        return dataLast
      }
    }
    if (arity === 3) {
      return function () {
        if (arguments.length >= 3) return body(arguments[0], arguments[1], arguments[2])
        const a0 = arguments[0], a1 = arguments[1]
        const dataLast = (data: any) => body(data, a0, a1)
        dataLast._op = opcode
        dataLast._fn = a0
        dataLast._a1 = a1 // direct property, no array allocation
        return dataLast
      }
    }
    if (arity === 4) {
      return function () {
        if (arguments.length >= 4) return body(arguments[0], arguments[1], arguments[2], arguments[3])
        const a0 = arguments[0], a1 = arguments[1], a2 = arguments[2]
        const dataLast = (data: any) => body(data, a0, a1, a2)
        dataLast._op = opcode
        dataLast._fn = a0
        dataLast._a1 = a1
        dataLast._a2 = a2
        return dataLast
      }
    }
  }

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

  // Generic fallback (arity 5+)
  const wrapper = function (...args: any[]) {
    if (args.length >= arity) return (body as any)(...args)
    const dataLast = (data: any) => (body as any)(data, ...args)
    if (tag) {
      dataLast._op = opcode
      dataLast._fn = args[0]
      dataLast._a1 = args[1]
      dataLast._a2 = args[2]
    }
    return dataLast
  }
  if (tag && arity <= 1) {
    wrapper._op = opcode
  }
  return wrapper
}
