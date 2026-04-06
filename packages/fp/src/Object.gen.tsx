/* TypeScript file generated from Object.res by genType. */

/* eslint-disable */
/* tslint:disable */

import * as ObjectJS from './Object.res.js';

import type {t as Dict_t} from './Dict.gen.tsx';

/** Returns a new object with only the specified keys. */
export const pick: <a,b>(obj:a, ks:string[]) => b = ObjectJS.pick as any;

/** Returns a new object without the specified keys. */
export const omit: <a,b>(_1:a, _2:string[]) => b = ObjectJS.omit as any;

/** Returns a new object with the given key set to the value. */
export const assoc: <a,b,c>(obj:a, key:string, value:b) => c = ObjectJS.assoc as any;

/** Returns a new object without the given key. */
export const dissoc: <a,b>(obj:a, key:string) => b = ObjectJS.dissoc as any;

/** Recursively merges two objects; the first object's values win on conflict. */
export const mergeDeepLeft: <a>(a:a, b:a) => a = ObjectJS.mergeDeepLeft as any;

/** Recursively merges two objects; the second object's values win on conflict. */
export const mergeDeepRight: <a>(a:a, b:a) => a = ObjectJS.mergeDeepRight as any;

/** Merges two objects using a resolver function for conflicting keys. */
export const mergeWith: <a,b>(a:a, b:a, resolver:((_1:b, _2:b) => b)) => a = ObjectJS.mergeWith as any;

/** Sets a value at a nested path, creating intermediate objects as needed. */
export const assocPath: <a,b,c>(obj:a, p:string[], value:b) => c = ObjectJS.assocPath as any;

/** Removes a key at a nested path. */
export const dissocPath: <a,b>(obj:a, p:string[]) => b = ObjectJS.dissocPath as any;

/** Deep clones an object using structuredClone. */
export const clone: <a>(obj:a) => a = ObjectJS.clone as any;

/** Checks if a property is equal in two objects. */
export const eqProps: <a,b>(key:string, a:a, b:b) => boolean = ObjectJS.eqProps as any;

/** Applies transformation functions to matching keys. */
export const evolve: <a,b,c>(transformations:a, obj:b) => c = ObjectJS.evolve as any;

/** Iterates over each key-value pair for side effects. */
export const forEachObjIndexed: <a,b>(obj:a, fn:((_1:b, _2:string) => void)) => void = ObjectJS.forEachObjIndexed as any;

/** Checks if the object has an own property. */
export const has: <a>(obj:a, key:string) => boolean = ObjectJS.has as any;

/** Checks if a nested path exists in the object. */
export const hasPath: <a>(obj:a, p:string[]) => boolean = ObjectJS.hasPath as any;

/** Inverts an object: values become keys, keys become arrays of original keys. */
export const invert: <a>(obj:a) => Dict_t<string[]> = ObjectJS.invert as any;

/** Inverts an object: values become keys, last key wins. */
export const invertObj: <a>(obj:a) => Dict_t<string> = ObjectJS.invertObj as any;

/** Transforms the keys of an object. */
export const mapKeys: <a,b>(obj:a, fn:((_1:string) => string)) => b = ObjectJS.mapKeys as any;

/** Transforms each value with access to its key. */
export const mapObjIndexed: <a,b,c,d>(obj:a, fn:((_1:b, _2:string) => c)) => d = ObjectJS.mapObjIndexed as any;

/** Recursively merges with a resolver function for conflicting leaf values. */
export const mergeDeepWith: <a,b>(a:a, b:a, fn:((_1:b, _2:b) => b)) => a = ObjectJS.mergeDeepWith as any;

/** Recursively merges with a resolver function that also receives the key. */
export const mergeDeepWithKey: <a,b>(a:a, b:a, fn:((_1:string, _2:b, _3:b) => b)) => a = ObjectJS.mergeDeepWithKey as any;

/** Merges two objects; the first wins on conflict. */
export const mergeLeft: <a>(a:a, b:a) => a = ObjectJS.mergeLeft as any;

/** Merges two objects; the second wins on conflict. */
export const mergeRight: <a>(a:a, b:a) => a = ObjectJS.mergeRight as any;

/** Merges with a key-aware resolver for conflicts. */
export const mergeWithKey: <a,b>(a:a, b:a, fn:((_1:string, _2:b, _3:b) => b)) => a = ObjectJS.mergeWithKey as any;

/** Transforms a value at a key. */
export const modify: <a,b,c>(obj:a, key:string, fn:((_1:b) => b)) => c = ObjectJS.modify as any;

/** Transforms a value at a nested path. */
export const modifyPath: <a,b,c>(obj:a, p:string[], fn:((_1:b) => b)) => c = ObjectJS.modifyPath as any;

/** Creates a singleton object. */
export const objOf: <a,b>(key:string, value:a) => b = ObjectJS.objOf as any;

/** Traverses a nested path, returning the value or None. */
export const path: <a,b>(obj:a, p:string[]) => (undefined | b) = ObjectJS.path as any;

/** Traverses a nested path, returning a fallback if missing. */
export const pathOr: <a,b>(obj:a, fallback:b, p:string[]) => b = ObjectJS.pathOr as any;

/** Traverses multiple nested paths. */
export const paths: <a,b>(obj:a, ps:Array<string[]>) => b[] = ObjectJS.paths as any;

/** Like pick, but includes undefined for missing keys. */
export const pickAll: <a,b>(obj:a, ks:string[]) => b = ObjectJS.pickAll as any;

/** Picks keys where the predicate returns true. */
export const pickBy: <a,b,c>(obj:a, pred:((_1:b, _2:string) => boolean)) => c = ObjectJS.pickBy as any;

/** Projects specific keys from an array of objects. */
export const project: <a,b>(arr:a[], ks:string[]) => b[] = ObjectJS.project as any;

/** Returns the value at a key (unsafe). */
export const prop: <a,b>(obj:a, key:string) => b = ObjectJS.prop as any;

/** Returns the value at a key, or a fallback. */
export const propOr: <a,b>(obj:a, fallback:b, key:string) => b = ObjectJS.propOr as any;

/** Returns values at multiple keys. */
export const props: <a,b>(obj:a, ks:string[]) => b[] = ObjectJS.props as any;

/** Renames keys according to a mapping. */
export const renameKeys: <a,b>(obj:a, mapping:Dict_t<string>) => b = ObjectJS.renameKeys as any;

/** Converts an object to an array of [key, value] pairs. */
export const toPairs: <a,b>(obj:a) => Array<[string, b]> = ObjectJS.toPairs as any;

/** Expands an array-valued key into multiple objects. */
export const unwind: <a,b>(obj:a, key:string) => b[] = ObjectJS.unwind as any;

/** Returns the keys of an object. */
export const keys: <a>(obj:a) => string[] = ObjectJS.keys as any;

/** Returns the values of an object. */
export const values: <a,b>(obj:a) => b[] = ObjectJS.values as any;

/** Checks if all predicate specs pass for the object. */
export const where: <a,b>(spec:a, obj:b) => boolean = ObjectJS.where as any;

/** Checks if any predicate spec passes for the object. */
export const whereAny: <a,b>(spec:a, obj:b) => boolean = ObjectJS.whereAny as any;

/** Checks if all spec values equal the object's values. */
export const whereEq: <a,b>(spec:a, obj:b) => boolean = ObjectJS.whereEq as any;

/** Creates an object from keys with a constant value. */
export const fromKeys: <a,b>(ks:string[], value:a) => b = ObjectJS.fromKeys as any;

/** Omits keys where the predicate returns true. */
export const omitBy: <a,b,c>(obj:a, pred:((_1:b, _2:string) => boolean)) => c = ObjectJS.omitBy as any;

/** Indexes an array into a dict by key and value extractors. */
export const pullObject: <a,b>(arr:a[], keyFn:((_1:a) => string), valFn:((_1:a) => b)) => Dict_t<b> = ObjectJS.pullObject as any;

/** Swaps the values of two keys. */
export const swapProps: <a,b>(obj:a, k1:string, k2:string) => b = ObjectJS.swapProps as any;
