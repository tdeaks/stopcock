/** Returns the argument unchanged. */
@genType
let identity = (a: 'a): 'a => a

/** Returns a function that always returns the given value. */
@genType
let always = (a: 'a): (_ => 'a) => _ => a

/** Swaps the first two arguments of a binary function. */
@genType
let flip = (fn: ('a, 'b) => 'c): (('b, 'a) => 'c) => (b, a) => fn(a, b)

/** Negates a predicate function. */
@genType
let complement = (pred: 'a => bool): ('a => bool) => a => !pred(a)

/** Returns a function that invokes the given function once; subsequent calls return the first result. */
@genType
let once = (fn: 'a => 'b): ('a => 'b) => {
  let lastResult = ref(None)
  a => {
    switch lastResult.contents {
    | Some(result) => result
    | None =>
      let result = fn(a)
      lastResult := Some(result)
      result
    }
  }
}

/** Alias for `once`. */
@genType
let memoize = (fn: 'a => 'b): ('a => 'b) => once(fn)

/** Applies the input to each branching function, then passes the results to the converging function. */
@genType
let converge = (after: array<'b> => 'c, fns: array<'a => 'b>): ('a => 'c) =>
  a => after(fns->Array.map(f => f(a)))

/** Applies the input to each function and returns an array of results. */
@genType
let juxt = (fns: array<'a => 'b>): ('a => array<'b>) =>
  a => fns->Array.map(f => f(a))

@genType let t = (): bool => true
@genType let f = (): bool => false

@genType let tap = (value: 'a, fn: 'a => unit): 'a => { fn(value); value }

@genType let memoizeWith = (keyFn: 'a => string, fn: 'a => 'b): ('a => 'b) => {
  let cache: Dict.t<'b> = Dict.make()
  a => {
    let key = keyFn(a)
    switch Dict.get(cache, key) {
    | Some(result) => result
    | None =>
      let result = fn(a)
      Dict.set(cache, key, result)
      result
    }
  }
}

@genType let on = (f: ('b, 'b) => 'c, g: 'a => 'b): (('a, 'a) => 'c) =>
  (a1, a2) => f(g(a1), g(a2))

@genType let o = (f: 'b => 'c, g: 'a => 'b): ('a => 'c) => a => f(g(a))

@genType let applyTo = (value: 'a, fn: 'a => 'b): 'b => fn(value)

@genType let ascend = (fn: 'a => float): (('a, 'a) => int) =>
  (a, b) => {
    let aa = fn(a)
    let bb = fn(b)
    if aa < bb { -1 } else if aa > bb { 1 } else { 0 }
  }

@genType let descend = (fn: 'a => float): (('a, 'a) => int) =>
  (a, b) => {
    let aa = fn(a)
    let bb = fn(b)
    if aa > bb { -1 } else if aa < bb { 1 } else { 0 }
  }

@genType let comparator = (pred: ('a, 'a) => bool): (('a, 'a) => int) =>
  (a, b) => if pred(a, b) { -1 } else if pred(b, a) { 1 } else { 0 }

@genType let doNothing = (_: 'a): unit => ()

let tryCatchRaw: ('a => 'b, ('c, 'a) => 'b) => ('a => 'b) = %raw(`
  function(tryer, catcher) {
    return function(a) { try { return tryer(a); } catch(e) { return catcher(e, a); } };
  }
`)
@genType let tryCatch = (tryer: 'a => 'b, catcher: ('c, 'a) => 'b): ('a => 'b) =>
  tryCatchRaw(tryer, catcher)

let thunkifyRaw: ('a => 'b) => ('a => (() => 'b)) = %raw(`
  function(fn) { return function(a) { return function() { return fn(a); }; }; }
`)
@genType let thunkify = (fn: 'a => 'b): ('a => (() => 'b)) => thunkifyRaw(fn)

let nthArgRaw: int => 'a = %raw(`
  function(n) { return function() { return arguments[n < 0 ? arguments.length + n : n]; }; }
`)
@genType let nthArg = (n: int): 'a => nthArgRaw(n)

let nAryRaw: (int, 'a) => 'b = %raw(`
  function(n, fn) {
    switch (n) {
      case 0: return function() { return fn.apply(this, arguments); };
      case 1: return function(a) { return fn.apply(this, arguments); };
      case 2: return function(a, b) { return fn.apply(this, arguments); };
      case 3: return function(a, b, c) { return fn.apply(this, arguments); };
      default: return function() { return fn.apply(this, Array.prototype.slice.call(arguments, 0, n)); };
    }
  }
`)
@genType let nAry = (n: int, fn: 'a): 'b => nAryRaw(n, fn)

@genType let unary = (fn: 'a): 'b => nAryRaw(1, fn)
@genType let binary = (fn: 'a): 'b => nAryRaw(2, fn)

let partialRaw: ('a, array<'b>) => 'c = %raw(`
  function(fn, args) {
    return function() {
      return fn.apply(this, args.concat(Array.prototype.slice.call(arguments)));
    };
  }
`)
@genType let partial = (fn: 'a, args: array<'b>): 'c => partialRaw(fn, args)

let partialRightRaw: ('a, array<'b>) => 'c = %raw(`
  function(fn, args) {
    return function() {
      return fn.apply(this, Array.prototype.slice.call(arguments).concat(args));
    };
  }
`)
@genType let partialRight = (fn: 'a, args: array<'b>): 'c => partialRightRaw(fn, args)

let partialObjectRaw: ('a, 'b) => 'c = %raw(`
  function(fn, partial) {
    return function(obj) {
      return fn(Object.assign({}, partial, obj));
    };
  }
`)
@genType let partialObject = (fn: 'a, partial: 'b): 'c => partialObjectRaw(fn, partial)

let applySpecRaw: 'a => 'b = %raw(`
  function applySpec(spec) {
    return function() {
      var args = arguments;
      function apply(s) {
        if (typeof s === 'function') return s.apply(null, args);
        if (Array.isArray(s)) return s.map(apply);
        if (typeof s === 'object' && s !== null) {
          var out = {};
          var keys = Object.keys(s);
          for (var i = 0; i < keys.length; i++) out[keys[i]] = apply(s[keys[i]]);
          return out;
        }
        return s;
      }
      return apply(spec);
    };
  }
`)
@genType let applySpec = (spec: 'a): 'b => applySpecRaw(spec)

let useWithRaw: ('a, array<'b>) => 'c = %raw(`
  function(fn, transformers) {
    return function() {
      var args = [];
      for (var i = 0; i < transformers.length; i++) {
        args.push(transformers[i](arguments[i]));
      }
      return fn.apply(null, args);
    };
  }
`)
@genType let useWith = (fn: 'a, transformers: array<'b>): 'c => useWithRaw(fn, transformers)

let ascendNaturalRaw: ('a => string) => (('a, 'a) => int) = %raw(`
  function(fn) {
    return function(a, b) { return fn(a).localeCompare(fn(b)); };
  }
`)
@genType let ascendNatural = (fn: 'a => string): (('a, 'a) => int) => ascendNaturalRaw(fn)

let descendNaturalRaw: ('a => string) => (('a, 'a) => int) = %raw(`
  function(fn) {
    return function(a, b) { return fn(b).localeCompare(fn(a)); };
  }
`)
@genType let descendNatural = (fn: 'a => string): (('a, 'a) => int) => descendNaturalRaw(fn)

let andThenRaw: (promise<'a>, 'a => 'b) => promise<'b> = %raw(`
  function(p, fn) { return p.then(fn); }
`)
@genType let andThen = (p: promise<'a>, fn: 'a => 'b): promise<'b> => andThenRaw(p, fn)

let otherwiseRaw: (promise<'a>, 'b => 'a) => promise<'a> = %raw(`
  function(p, fn) { return p.catch(fn); }
`)
@genType let otherwise = (p: promise<'a>, fn: 'b => 'a): promise<'a> => otherwiseRaw(p, fn)

let unapplyRaw: (array<'a> => 'b) => 'c = %raw(`
  function(fn) { return function() { return fn(Array.prototype.slice.call(arguments)); }; }
`)
@genType let unapply = (fn: array<'a> => 'b): 'c => unapplyRaw(fn)
