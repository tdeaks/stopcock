/* TypeScript file generated from Relation.res by genType. */

/* eslint-disable */
/* tslint:disable */

import * as RelationJS from './Relation.res.js';

import type {t as Dict_t} from './Dict.gen.tsx';

export const gt: (a:number, b:number) => boolean = RelationJS.gt as any;

export const gte: (a:number, b:number) => boolean = RelationJS.gte as any;

export const lt: (a:number, b:number) => boolean = RelationJS.lt as any;

export const lte: (a:number, b:number) => boolean = RelationJS.lte as any;

export const min: (a:number, b:number) => number = RelationJS.min as any;

export const max: (a:number, b:number) => number = RelationJS.max as any;

export const minBy: <a>(f:((_1:a) => number), a:a, b:a) => a = RelationJS.minBy as any;

export const maxBy: <a>(f:((_1:a) => number), a:a, b:a) => a = RelationJS.maxBy as any;

export const identical: <a>(a:a, b:a) => boolean = RelationJS.identical as any;

export const eqBy: <a,b>(f:((_1:a) => b), a:a, b:a) => boolean = RelationJS.eqBy as any;

export const sortWith: <a>(arr:a[], comparators:Array<((_1:a, _2:a) => number)>) => a[] = RelationJS.sortWith as any;

export const countBy: <a>(arr:a[], f:((_1:a) => string)) => Dict_t<number> = RelationJS.countBy as any;

export const innerJoin: <a,b>(a:a[], b:b[], pred:((_1:a, _2:b) => boolean)) => a[] = RelationJS.innerJoin as any;

export const pathEq: <a,b>(path:string[], val:a, obj:b) => boolean = RelationJS.pathEq as any;

export const propEq: <a,b>(prop:string, val:a, obj:b) => boolean = RelationJS.propEq as any;
