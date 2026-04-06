/* TypeScript file generated from Number.res by genType. */

/* eslint-disable */
/* tslint:disable */

import * as NumberJS from './Number.res.js';

/** Clamps a value between `min` and `max`. Swaps bounds if `min > max`. */
export const clamp: (value:number, min:number, max:number) => number = NumberJS.clamp as any;

/** Checks whether an integer is even. */
export const isEven: (n:number) => boolean = NumberJS.isEven as any;

/** Checks whether an integer is odd. */
export const isOdd: (n:number) => boolean = NumberJS.isOdd as any;

export const ceil: (n:number) => number = NumberJS.ceil as any;

export const floor: (n:number) => number = NumberJS.floor as any;

export const round: (n:number) => number = NumberJS.round as any;
