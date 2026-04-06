/* TypeScript file generated from Boolean.res by genType. */
// @ts-nocheck

/* eslint-disable */
/* tslint:disable */

import * as BooleanJS from './Boolean.res.js';

/** Evaluates `onTrue` or `onFalse` lazily based on the condition. */
export const ifElse: <a>(cond:boolean, onTrue:(() => a), onFalse:(() => a)) => a = BooleanJS.ifElse as any;

/** Logical AND of two booleans. */
export const and_: (a:boolean, b:boolean) => boolean = BooleanJS.and_ as any;

/** Logical OR of two booleans. */
export const or_: (a:boolean, b:boolean) => boolean = BooleanJS.or_ as any;

/** Logical negation. */
export const not_: (a:boolean) => boolean = BooleanJS.not_ as any;
