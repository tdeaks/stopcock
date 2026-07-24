export type Ordering = -1 | 0 | 1

export const fromNumber = (value: number): Ordering =>
  value < 0 ? -1 : value > 0 ? 1 : 0

export const reverse = (ordering: Ordering): Ordering =>
  ordering === 0 ? 0 : ordering === -1 ? 1 : -1

export const combine = (first: Ordering, second: Ordering): Ordering =>
  first === 0 ? second : first

export const match = <A>(
  ordering: Ordering,
  handlers: {
    readonly less: () => A
    readonly equal: () => A
    readonly greater: () => A
  },
): A =>
  ordering === -1
    ? handlers.less()
    : ordering === 1
      ? handlers.greater()
      : handlers.equal()
