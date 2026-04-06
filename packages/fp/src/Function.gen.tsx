/* TypeScript file generated from Function.res by genType. */

/* eslint-disable */
/* tslint:disable */

import * as FunctionJS from './Function.res.js';

/** Returns the argument unchanged. */
export const identity: <a>(a:a) => a = FunctionJS.identity as any;

/** Returns a function that always returns the given value. */
export const always: <T1,a>(a:a) => (_1:T1) => a = FunctionJS.always as any;

/** Swaps the first two arguments of a binary function. */
export const flip: <a,b,c>(fn:((_1:a, _2:b) => c)) => (_1:b, _2:a) => c = FunctionJS.flip as any;

/** Negates a predicate function. */
export const complement: <a>(pred:((_1:a) => boolean)) => (_1:a) => boolean = FunctionJS.complement as any;

/** Returns a function that invokes the given function once; subsequent calls return the first result. */
export const once: <a,b>(fn:((_1:a) => b)) => (_1:a) => b = FunctionJS.once as any;

/** Alias for `once`. */
export const memoize: <a,b>(fn:((_1:a) => b)) => (_1:a) => b = FunctionJS.memoize as any;

/** Applies the input to each branching function, then passes the results to the converging function. */
export const converge: <a,b,c>(after:((_1:b[]) => c), fns:Array<((_1:a) => b)>) => (_1:a) => c = FunctionJS.converge as any;

/** Applies the input to each function and returns an array of results. */
export const juxt: <a,b>(fns:Array<((_1:a) => b)>) => (_1:a) => b[] = FunctionJS.juxt as any;

export const t: () => boolean = FunctionJS.t as any;

export const f: () => boolean = FunctionJS.f as any;

export const tap: <a>(value:a, fn:((_1:a) => void)) => a = FunctionJS.tap as any;

export const memoizeWith: <a,b>(keyFn:((_1:a) => string), fn:((_1:a) => b)) => (_1:a) => b = FunctionJS.memoizeWith as any;

export const on: <a,b,c>(f:((_1:b, _2:b) => c), g:((_1:a) => b)) => (_1:a, _2:a) => c = FunctionJS.on as any;

export const o: <a,b,c>(f:((_1:b) => c), g:((_1:a) => b)) => (_1:a) => c = FunctionJS.o as any;

export const applyTo: <a,b>(value:a, fn:((_1:a) => b)) => b = FunctionJS.applyTo as any;

export const ascend: <a>(fn:((_1:a) => number)) => (_1:a, _2:a) => number = FunctionJS.ascend as any;

export const descend: <a>(fn:((_1:a) => number)) => (_1:a, _2:a) => number = FunctionJS.descend as any;

export const comparator: <a>(pred:((_1:a, _2:a) => boolean)) => (_1:a, _2:a) => number = FunctionJS.comparator as any;

export const doNothing: <a>(param:a) => void = FunctionJS.doNothing as any;

export const tryCatch: <a,b,c>(tryer:((_1:a) => b), catcher:((_1:c, _2:a) => b)) => (_1:a) => b = FunctionJS.tryCatch as any;

export const thunkify: <a,b>(fn:((_1:a) => b)) => (_1:a) => () => b = FunctionJS.thunkify as any;

export const nthArg: <a>(n:number) => a = FunctionJS.nthArg as any;

export const nAry: <a,b>(n:number, fn:a) => b = FunctionJS.nAry as any;

export const unary: <a,b>(fn:a) => b = FunctionJS.unary as any;

export const binary: <a,b>(fn:a) => b = FunctionJS.binary as any;

export const partial: <a,b,c>(fn:a, args:b[]) => c = FunctionJS.partial as any;

export const partialRight: <a,b,c>(fn:a, args:b[]) => c = FunctionJS.partialRight as any;

export const partialObject: <a,b,c>(fn:a, partial:b) => c = FunctionJS.partialObject as any;

export const applySpec: <a,b>(spec:a) => b = FunctionJS.applySpec as any;

export const useWith: <a,b,c>(fn:a, transformers:b[]) => c = FunctionJS.useWith as any;

export const ascendNatural: <a>(fn:((_1:a) => string)) => (_1:a, _2:a) => number = FunctionJS.ascendNatural as any;

export const descendNatural: <a>(fn:((_1:a) => string)) => (_1:a, _2:a) => number = FunctionJS.descendNatural as any;

export const andThen: <a,b>(p:Promise<a>, fn:((_1:a) => b)) => Promise<b> = FunctionJS.andThen as any;

export const otherwise: <a,b>(p:Promise<a>, fn:((_1:b) => a)) => Promise<a> = FunctionJS.otherwise as any;

export const unapply: <a,b,c>(fn:((_1:a[]) => b)) => c = FunctionJS.unapply as any;
