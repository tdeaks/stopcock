/* TypeScript file generated from Lens.res by genType. */

/* eslint-disable */
/* tslint:disable */

import * as LensJS from './Lens.res.js';

export type t<a,b> = { readonly get: (_1:a) => b; readonly set: (_1:a, _2:b) => a };

export const lens: <a,b>(getter:((_1:a) => b), setter:((_1:a, _2:b) => a)) => t<a,b> = LensJS.lens as any;

export const lensIndex: <a>(n:number) => t<a[],a> = LensJS.lensIndex as any;

export const lensPath: <a,b>(path:string[]) => t<a,b> = LensJS.lensPath as any;

export const lensProp: <a,b>(key:string) => t<a,b> = LensJS.lensProp as any;

export const view: <a,b>(l:t<a,b>, obj:a) => b = LensJS.view as any;

export const set: <a,b>(l:t<a,b>, val:b, obj:a) => a = LensJS.set as any;

export const over: <a,b>(l:t<a,b>, fn:((_1:b) => b), obj:a) => a = LensJS.over as any;
