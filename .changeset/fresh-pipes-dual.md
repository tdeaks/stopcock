---
"@stopcock/fp": major
"@stopcock/fp-compiler": major
"@stopcock/fp-interop": major
"@stopcock/parser": major
"@stopcock/autodiff": minor
"@stopcock/color": minor
"@stopcock/diff": minor
"@stopcock/svg": minor
"@stopcock/eslint-plugin-fp": patch
"@stopcock/fp-codemod": patch
---

Restore data-first calls alongside the existing curried data-last forms across
the public FP surface.

**Breaking:** remove the `@stopcock/fp/dual` subpath. Public operations now
implement dual dispatch directly under their module exports.

Add matching dual call forms to Autodiff, Color, Diff, and SVG. Move FP
Compiler, FP Interop, and Parser to the V3 FP peer boundary, and update the
migration tooling for V3.
