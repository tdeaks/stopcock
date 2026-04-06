/* TypeScript file generated from String.res by genType. */

/* eslint-disable */
/* tslint:disable */

import * as StringJS from './String.res.js';

import type {t as RegExp_t} from './RegExp.gen.tsx';

/** Checks whether a string is empty. */
export const isEmpty: (s:string) => boolean = StringJS.isEmpty as any;

/** Returns the number of characters. */
export const length: (s:string) => number = StringJS.length as any;

/** Removes whitespace from both ends. */
export const trim: (s:string) => string = StringJS.trim as any;

/** Removes leading whitespace. */
export const trimStart: (s:string) => string = StringJS.trimStart as any;

/** Removes trailing whitespace. */
export const trimEnd: (s:string) => string = StringJS.trimEnd as any;

/** Checks whether the string starts with the given prefix. */
export const startsWith: (s:string, search:string) => boolean = StringJS.startsWith as any;

/** Checks whether the string ends with the given suffix. */
export const endsWith: (s:string, search:string) => boolean = StringJS.endsWith as any;

/** Checks whether the string contains the given substring. */
export const includes: (s:string, search:string) => boolean = StringJS.includes as any;

/** Splits by separator into an array. */
export const split: (s:string, sep:string) => string[] = StringJS.split as any;

/** Converts to lowercase. */
export const toLowerCase: (s:string) => string = StringJS.toLowerCase as any;

/** Converts to uppercase. */
export const toUpperCase: (s:string) => string = StringJS.toUpperCase as any;

/** Extracts a section from `start` to `end` index. */
export const slice: (s:string, start:number, end_:number) => string = StringJS.slice as any;

/** Replaces all occurrences of a search string with a replacement. */
export const replaceAll: (s:string, search:string, replacement:string) => string = StringJS.replaceAll as any;

/** Repeats the string `n` times. */
export const repeat: (s:string, n:number) => string = StringJS.repeat as any;

export const match_: (s:string, regex:RegExp_t) => string[] = StringJS.match_ as any;

export const replaceRegex: (s:string, regex:RegExp_t, replacement:string) => string = StringJS.replaceRegex as any;

export const test_: (s:string, regex:RegExp_t) => boolean = StringJS.test_ as any;

export const toString_: <a>(x:a) => string = StringJS.toString_ as any;

export const capitalize: (s:string) => string = StringJS.capitalize as any;

export const uncapitalize: (s:string) => string = StringJS.uncapitalize as any;

export const toCamelCase: (s:string) => string = StringJS.toCamelCase as any;

export const toKebabCase: (s:string) => string = StringJS.toKebabCase as any;

export const toSnakeCase: (s:string) => string = StringJS.toSnakeCase as any;

export const toTitleCase: (s:string) => string = StringJS.toTitleCase as any;

export const truncate: (s:string, maxLen:number, ellipsis:string) => string = StringJS.truncate as any;
