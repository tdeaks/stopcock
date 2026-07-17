export function dual(arity: number, body: Function): any {
  return function (...args: unknown[]) {
    if (args.length >= arity) return body(...args)
    return (data: unknown) => body(data, ...args)
  }
}
