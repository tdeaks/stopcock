import { dual } from './dual'

// Arity 1
export const inc: (n: number) => number = dual(1, (n: any) => {
  return n + 1.0;
}, { op: 'inc' })
export const dec: (n: number) => number = dual(1, (n: any) => {
  return n - 1.0;
}, { op: 'dec' })
export const negate: (n: number) => number = dual(1, (n: any) => {
  return - n;
}, { op: 'negate' })
export const product: (arr: number[]) => number = (arr: any) => {
  const len = arr.length
  let acc = 1.0
  for (let i = 0; i < len; i++) acc = acc * arr[i]
  return acc
}

// Arity 2
export const add: {
  (a: number, b: number): number
  (b: number): (a: number) => number
} = dual(2, (a: any, b: any) => {
  return a + b;
}, { op: 'add' })

export const subtract: {
  (a: number, b: number): number
  (b: number): (a: number) => number
} = dual(2, (a: any, b: any) => {
  return a - b;
}, { op: 'subtract' })

export const multiply: {
  (a: number, b: number): number
  (b: number): (a: number) => number
} = dual(2, (a: any, b: any) => {
  return a * b;
}, { op: 'multiply' })

export const divide: {
  (a: number, b: number): number
  (b: number): (a: number) => number
} = dual(2, (a: any, b: any) => {
  return a / b;
}, { op: 'divide' })

export const modulo: {
  (a: number, b: number): number
  (b: number): (a: number) => number
} = dual(2, (a: any, b: any) => {
  return a % b;
})
