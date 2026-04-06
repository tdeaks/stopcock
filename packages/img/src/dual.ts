// Lightweight dual for img module. No fusion tags, just arity-based data-first/data-last dispatch.

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
  if (arity === 5) {
    return function () {
      if (arguments.length >= 5) return body(arguments[0], arguments[1], arguments[2], arguments[3], arguments[4])
      const a0 = arguments[0], a1 = arguments[1], a2 = arguments[2], a3 = arguments[3]
      return (data: any) => body(data, a0, a1, a2, a3)
    }
  }
  return body
}
