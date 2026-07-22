# Interim performance profile

Stand-in until the dedicated perf-linux-x64 and perf-macos-arm64 runners exist.

- All comparative runs happen on one machine (macos-arm64), sequentially, one worker, nothing else running. Close the lid apps, plug in, disable low power mode.
- Base and head are measured in the same session, interleaved ABBA, fresh process per round.
- Results from this profile guide investigation and PR review only. They do not satisfy release performance gates; those wait for the dedicated runners.
- Every report must come from the JSON pipeline (`report:*` scripts) so engine identity is asserted and failures propagate.
