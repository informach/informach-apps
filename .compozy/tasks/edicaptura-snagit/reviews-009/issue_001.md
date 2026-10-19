---
status: resolved
file: scripts/edi/test-native.mts
line: 291
severity: medium
author: claude-code
provider_ref:
---

# Issue 001: Close the launched child when Pictures setup rejects

## Review Comment

The new `await application.evaluate(... app.setPath("pictures", pictures))` runs after Electron launch and `knownChildren.push(childLifetime)`, but before the per-app `try/finally`. If that post-launch setup rejects while the child remains alive, execution jumps directly to the outer catch/finally. No code calls `application.close()`. The outer `knownChildren.every(child => child.isClosed())` correctly rejects and retains the fixture directory, but it only observes lifetime; it cannot close the still-running application. This leaves the GUI/process alive after a failed setup and breaks the required owned-child shutdown/serial-runner lifecycle. It does not turn the failure green or delete the live child's profile.

Confirmed by `node .superpowers/sdd/2026-10-18-edicaptura-snagit/task-remote-integration-review-startup-probe.mjs` (exit 0 means the defect was reproduced). The probe transpiles and executes the **actual unchanged outer lifecycle block** from this runner, injecting only a rejected Pictures setup and inert application/filesystem doubles. It records `trackedChildren:1`, `applicationCloseCalls:0`, `rootRemovalCalls:0`, `originalFailurePreserved:true`, `liveChildRetained:true`. No real process, GUI, filesystem fixture, media, credentials or environment is used. This proves the control-flow gap; it does not claim that the successful six-app run experienced it.

The Pictures operation comes from fetched upstream `27ac84cf`, and the merged runner retains its placement before the per-app try. It was absent from the accepted local 5b runner. This is a shared-harness integration finding, not a regression in EdiFoto product code or a re-opening of 004/002's false-zero fixture issue. The post-launch boundary was checked for other new awaits: Pictures is the only added await before that try; the Foto journey and longer lease are already inside it.

Put the post-launch asynchronous setup under the same failure collection and normal-close verification that owns the launched application, preserving immediate child tracking, own Pictures isolation before dialogs, original-error propagation, Captura's no-page-access STOP guard and root retention if a child cannot close normally. Add a deterministic setup-rejection regression that exercises the actual lifecycle and requires one normal close attempt, the original failure to remain a failure, and cleanup only after verified child closure. Cover close rejection/live child separately rather than forcing termination or allowing cleanup to pass.

## Triage

- Decision: `VALID` — parent read FULL review/probe and source-real lifecycle finding.
- Notes: Pictures setup awaits after launch/tracking but outside per-app try/finally, so rejection bypasses the only normal-close attempt. Move setup into the existing owned application lifecycle, retaining immediate child tracking, error collection, STOP containment and root retention when close fails. Add actual lifecycle setup rejection and close-failure regressions. No plan conflict or waiver; same-owner fix and scoped independent re-review required.

## Resolution — fix round 1, 18/10/2026

Moved the Pictures await into the existing per-app try, before any runtime/UI/dialog inspection. Immediate child tracking and the close observer remain in place before setup. Rejection now reaches the same catch/finally: one normal close request, verified child exit, and original failure propagation. A rejected close with a live child still retains the root and reports both failures; no forced termination was introduced.

The permanent regression executes the actual runner lifecycle and `raiseFailures`, with the real tracking, close verifier, diagnostic stage and observer. Only external process/application/filesystem operations use inert doubles. Before the source fix: two new tests failed because closeCalls was zero; ten existing tests passed. After the fix: both lifecycle cases and all diagnostics/containment tests passed. The final tooling suite passed 62 tests, tooling types and Biome passed, and all six native consumers rebuilt and ran serially with exit 0, normal child closure and final cleanup. New evidence is under `.cache/edi-native-results/run-i310VM`; previous evidence remains in place.

An initial type check rejected writes to readonly properties of the inert ChildProcess fixture. The fixture now declares its modeled mutable exit state in a typed subclass, with no cast or suppression; the final type check passed. This is a modeled rejection regression, not a claim to reproduce an actual Electron Pictures failure. Independent scoped re-review is pending; this owner disposition does not grant final integration or publication acceptance.


Parent acceptance: same independent reviewer returned009/001 ADDRESSED, SPEC ACCEPT and QUALITY/SECURITY ACCEPT for integration/fix1, zero new findings. Parent read FULL review, confirmed modeled failure-boundary proof and owner-attributed six normal native closures, and reconciled cannotverify as physical-frequency/remoteCI/historical qualification limits, no additional confirmed software gap. Integration accepted; whole-checkpoint review/final gates/near-push remote reconciliation remain pending. Old freeze retains pre-parent-document provenance.
