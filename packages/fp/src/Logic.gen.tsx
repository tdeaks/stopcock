/* TypeScript file generated from Logic.res by genType. */

/* eslint-disable */
/* tslint:disable */

import * as LogicJS from './Logic.res.js';

/** Checks deep structural equality of two values. */
export const equals: <a>(a:a, b:a) => boolean = LogicJS.equals as any;

/** Returns the value if defined, otherwise returns the fallback. */
export const defaultTo: <a>(fallback:a, opt:(undefined | a)) => a = LogicJS.defaultTo as any;

/** Applies the transform if the predicate is true, otherwise returns the value unchanged. */
export const when_: <a>(value:a, pred:((_1:a) => boolean), f:((_1:a) => a)) => a = LogicJS.when_ as any;

/** Applies the transform if the predicate is false, otherwise returns the value unchanged. */
export const unless: <a>(value:a, pred:((_1:a) => boolean), f:((_1:a) => a)) => a = LogicJS.unless as any;

/** Returns the result of the first matching condition's transform, or `undefined` if none match. */
export const cond: <a,b>(conditions:Array<[((_1:a) => boolean), ((_1:a) => b)]>, value:a) => (undefined | b) = LogicJS.cond as any;

/** Combines two predicates with AND. */
export const both: <a>(p1:((_1:a) => boolean), p2:((_1:a) => boolean)) => (_1:a) => boolean = LogicJS.both as any;

/** Combines two predicates with OR. */
export const either: <a>(p1:((_1:a) => boolean), p2:((_1:a) => boolean)) => (_1:a) => boolean = LogicJS.either as any;

/** Returns a predicate that is true when all given predicates pass. Empty array → always true. */
export const allPass: <a>(preds:Array<((_1:a) => boolean)>) => (_1:a) => boolean = LogicJS.allPass as any;

/** Returns a predicate that is true when any given predicate passes. Empty array → always false. */
export const anyPass: <a>(preds:Array<((_1:a) => boolean)>) => (_1:a) => boolean = LogicJS.anyPass as any;

export const logicIsEmpty: <a>(x:a) => boolean = LogicJS.logicIsEmpty as any;

export const isNotEmpty: <a>(x:a) => boolean = LogicJS.isNotEmpty as any;

export const pathSatisfies: <a,b>(path:string[], pred:((_1:a) => boolean), obj:b) => boolean = LogicJS.pathSatisfies as any;

export const propSatisfies: <a,b>(prop:string, pred:((_1:a) => boolean), obj:b) => boolean = LogicJS.propSatisfies as any;

export const until: <a>(value:a, pred:((_1:a) => boolean), f:((_1:a) => a)) => a = LogicJS.until as any;

export const xor: (a:boolean, b:boolean) => boolean = LogicJS.xor as any;
