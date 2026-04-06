let typeRaw: 'a => string = %raw(`
  function(x) {
    if (x === null) return "Null";
    if (x === undefined) return "Undefined";
    return Object.prototype.toString.call(x).slice(8, -1);
  }
`)

@genType
let type_ = (x: 'a): string => typeRaw(x)

let stringToPathRaw: string => array<string> = %raw(`
  function(s) {
    return s.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  }
`)

@genType
let stringToPath = (s: string): array<string> => stringToPathRaw(s)
