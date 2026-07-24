export interface ListNode<T> {
  readonly value: T
  readonly next: ListNode<T> | undefined
}

export const prepend = <T>(value: T, next: ListNode<T> | undefined): ListNode<T> => ({
  value,
  next,
})

export const reverseList = <T>(input: ListNode<T> | undefined): ListNode<T> | undefined => {
  let output: ListNode<T> | undefined
  let current = input
  while (current !== undefined) {
    output = prepend(current.value, output)
    current = current.next
  }
  return output
}

export const listFromArray = <T>(values: readonly T[]): ListNode<T> | undefined => {
  let output: ListNode<T> | undefined
  for (let index = values.length - 1; index >= 0; index -= 1) {
    output = prepend(values[index] as T, output)
  }
  return output
}

export function* iterateList<T>(input: ListNode<T> | undefined): Generator<T> {
  let current = input
  while (current !== undefined) {
    yield current.value
    current = current.next
  }
}
