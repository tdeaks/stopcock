---
'@stopcock/fp-compiler': minor
---

Add the `stopcock` bin and its `check` subcommand.

`stopcock check` reads `CompilerReceiptV1` records your build emitted plus the
evidence manifests you hand it, and renders what is actually known about each
site. It does not compile, profile, or benchmark your code, and it does not
load a fusion runtime to write a report.

Every site renders declared capability, static decision, corpus evidence,
runtime observation, qualified benchmark, and packed release evidence as
separate classes. A fallback cannot read as transformed, a statically selected
lowering cannot read as executed, and a stale source, config,
semantic-manifest, output, package, or runtime hash withdraws the claims in
the classes it invalidates.

The fail policy is explicit: `unsupported`, `stale-evidence`,
`coverage-threshold`, or a policy document of your own. Missing evidence is
never treated as a pass. Exit `0` means every requested policy passed, `1`
means a checked policy failed, `2` means the arguments, schema, or artifacts
were invalid. With `--json` the report goes to stdout byte-identically for
identical inputs and the prose goes to stderr.
