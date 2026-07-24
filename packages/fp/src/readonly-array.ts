/**
 * Readonly-array entrypoint.
 *
 * Array operations already accept readonly inputs and return new mutable
 * arrays. This explicit facade gives the package export its own declaration
 * artifact while keeping one implementation and one set of semantics.
 */
export * from './array'
