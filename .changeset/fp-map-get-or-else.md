---
'@stopcock/fp': minor
---

Add `Map.getOrElse` in direct and data-last forms.

The fallback is lazy and runs at most once, and only when the key is genuinely
absent, so an expensive default costs nothing on a hit. The lookup calls `get`
first and consults `has` only when `get` came back `undefined`, so a stored
`undefined` is treated as present and returns `undefined` rather than the
fallback.

`get`, `getOrUndefined`, and the rest of the Map surface are unchanged.
