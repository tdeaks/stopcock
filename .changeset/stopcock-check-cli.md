---
'@stopcock/fp-compiler': minor
---

Add the `stopcock` bin and its `check` subcommand.

`stopcock check` dry-runs the transform over your project's source files and
reports which pipeline sites compiled and which bailed, with a file, line,
column, and reason for each. It never writes transformed code back to disk.

Exit `0` unless `--strict` is given and at least one site bailed, in which
case it exits `1`. Exit `2` means the arguments were invalid.
