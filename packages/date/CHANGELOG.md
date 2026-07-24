# @stopcock/date

## Unreleased

### Patch Changes

- Correct `range` and `rangeBy` data-last declarations to require the end
  timestamp before returning their unary start-timestamp function.
- Keep timezone composition length-dispatched: direct `Tz.startOf`, `Tz.endOf`,
  `Tz.add`, and `Tz.subtract` calls accept optional disambiguation, while their
  data-last forms accept only the required arguments and use the compatible
  default.

## 0.0.3

### Patch Changes

- Updated dependencies []:
  - @stopcock/fp@0.0.3
