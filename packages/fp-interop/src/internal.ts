export const hasOwn = (
  value: object,
  key: PropertyKey,
): boolean => Object.prototype.hasOwnProperty.call(value, key)

export const isObject = (value: unknown): value is object =>
  typeof value === 'object' && value !== null

export const closeIterator = (iterator: Iterator<unknown>): void => {
  if (typeof iterator.return === 'function') iterator.return()
}

export const closeAsyncIterator = async (
  iterator: AsyncIterator<unknown>,
): Promise<void> => {
  if (typeof iterator.return === 'function') await iterator.return()
}
