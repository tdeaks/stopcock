/* TypeScript file generated from Dict.res by genType. */
// @ts-nocheck

/* eslint-disable */
/* tslint:disable */

import * as DictJS from './Dict.res.js';

export type t<a> = {[id: string]: a};

/** Creates a dictionary from an array of `[key, value]` pairs. */
export const fromEntries: <a>(entries:Array<[string, a]>) => {[id: string]: a} = DictJS.fromEntries as any;

/** Returns an array of `[key, value]` pairs. */
export const toEntries: <a>(d:{[id: string]: a}) => Array<[string, a]> = DictJS.toEntries as any;

/** Returns an array of the dictionary's keys. */
export const keys: <a>(d:{[id: string]: a}) => string[] = DictJS.keys as any;

/** Returns an array of the dictionary's values. */
export const values: <a>(d:{[id: string]: a}) => a[] = DictJS.values as any;

/** Transforms each value using a function that receives the value and key. */
export const map: <a,b>(d:{[id: string]: a}, f:((_1:a, _2:string) => b)) => {[id: string]: b} = DictJS.map as any;

/** Returns a new dictionary with entries satisfying the predicate. */
export const filter: <a>(d:{[id: string]: a}, pred:((_1:a, _2:string) => boolean)) => {[id: string]: a} = DictJS.filter as any;

/** Merges two dictionaries; the second's values win on conflict. */
export const merge: <a>(a:{[id: string]: a}, b:{[id: string]: a}) => {[id: string]: a} = DictJS.merge as any;

/** Returns the value for a key, or `undefined` if missing. */
export const get: <a>(d:{[id: string]: a}, key:string) => (undefined | a) = DictJS.get as any;

/** Checks whether the dictionary has no entries. */
export const isEmpty: <a>(d:{[id: string]: a}) => boolean = DictJS.isEmpty as any;
