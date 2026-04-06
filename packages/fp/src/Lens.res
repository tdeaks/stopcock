type t<'a, 'b> = {get: 'a => 'b, set: ('a, 'b) => 'a}

@genType
let lens = (getter: 'a => 'b, setter: ('a, 'b) => 'a): t<'a, 'b> => {get: getter, set: setter}

let lensIndexRaw: int => t<array<'a>, 'a> = %raw(`
  function(n) {
    return {
      get: function(arr) { return arr[n]; },
      set: function(arr, val) { var out = arr.slice(); out[n] = val; return out; }
    };
  }
`)
@genType
let lensIndex = (n: int): t<array<'a>, 'a> => lensIndexRaw(n)

let lensPathRaw: array<string> => t<'a, 'b> = %raw(`
  function(path) {
    return {
      get: function(obj) {
        var cur = obj;
        for (var i = 0; i < path.length; i++) { if (cur == null) return undefined; cur = cur[path[i]]; }
        return cur;
      },
      set: function(obj, val) {
        if (path.length === 0) return val;
        function s(o, i) {
          var out = Array.isArray(o) ? o.slice() : Object.assign({}, o);
          if (i === path.length - 1) { out[path[i]] = val; return out; }
          out[path[i]] = s(out[path[i]] != null ? out[path[i]] : {}, i + 1);
          return out;
        }
        return s(obj, 0);
      }
    };
  }
`)
@genType
let lensPath = (path: array<string>): t<'a, 'b> => lensPathRaw(path)

let lensPropRaw: string => t<'a, 'b> = %raw(`
  function(k) {
    return {
      get: function(obj) { return obj[k]; },
      set: function(obj, val) { var out = Object.assign({}, obj); out[k] = val; return out; }
    };
  }
`)
@genType
let lensProp = (key: string): t<'a, 'b> => lensPropRaw(key)

@genType
let view = (l: t<'a, 'b>, obj: 'a): 'b => l.get(obj)

@genType
let set = (l: t<'a, 'b>, val: 'b, obj: 'a): 'a => l.set(obj, val)

@genType
let over = (l: t<'a, 'b>, fn: 'b => 'b, obj: 'a): 'a => l.set(obj, fn(l.get(obj)))
