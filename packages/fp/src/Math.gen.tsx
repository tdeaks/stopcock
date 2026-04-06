/* TypeScript file generated from Math.res by genType. */
// @ts-nocheck

/* eslint-disable */
/* tslint:disable */

import * as MathJS from './Math.res.js';

/** Adds two numbers. */
export const add: (a:number, b:number) => number = MathJS.add as any;

/** Subtracts the second number from the first. */
export const subtract: (a:number, b:number) => number = MathJS.subtract as any;

/** Multiplies two numbers. */
export const multiply: (a:number, b:number) => number = MathJS.multiply as any;

/** Divides the first number by the second. Division by zero returns `Infinity`. */
export const divide: (a:number, b:number) => number = MathJS.divide as any;

/** Returns the remainder of dividing the first number by the second. */
export const modulo: (a:number, b:number) => number = MathJS.modulo as any;

/** Increments by one. */
export const inc: (n:number) => number = MathJS.inc as any;

/** Decrements by one. */
export const dec: (n:number) => number = MathJS.dec as any;

/** Negates a number. */
export const negate: (n:number) => number = MathJS.negate as any;

/** Multiplies all elements. Returns `1` for an empty array. */
export const product: (arr:number[]) => number = MathJS.product as any;

export const sum: (arr:number[]) => number = MathJS.sum as any;

export const mean: (arr:number[]) => number = MathJS.mean as any;

export const median: (arr:number[]) => number = MathJS.median as any;

export const mathMod: (a:number, b:number) => number = MathJS.mathMod as any;
