---
status: resolved
file: apps/edicaptura/src/recording/recorder.js
line: 59
severity: critical
author: claude-code
provider_ref:
---

# Issue 001: Drain final chunks arriving while resume phase awaits IPC

## Review Comment

After the pending queue becomes empty, `drain` resumes MediaRecorder and awaits `recordPhase("recording")` while leaving `state.draining` set. If Stop is requested during this await, MediaRecorder emits its final `dataavailable` and `onstop`. The final blob is admitted to `state.pending`, but both its `drain` call and `persist`'s drain at line 81 merely await the old promise (line 32). That promise finishes without checking the queue again. `persist` then calls `recordSave` although the final blob has never been sent. Main commits the shortened file, deletes all acknowledged raw chunks, and the renderer discards the state and says the recording was saved. The final admitted bytes have no recovery copy.

Confirmed with the unchanged production recorder, actual Chromium MediaRecorder, an owned synthetic canvas and the real RecordingStore/Library filesystem. Hold the first append until backpressure pauses; release it; hold the resume-phase IPC; stop and wait for actual final `dataavailable`/`onstop`; then release the phase response. Command: `node .superpowers/sdd/2026-10-18-edicaptura-snagit/task-5a-review-renderer-race.cjs`. Frozen-source result: emittedBytes **4,318,708**, storedBytes **4,309,853**, **8,855 final bytes missing**, `reportedSaved:true`, `status:"committed"`, `rawChunksRemaining:0`, `tracksEnded:true`. Evidence: `task-5a-review-renderer-race-confirmed.log` in the same directory. A deterministic VM/real-filesystem probe independently loses 17 final bytes: `node .superpowers/sdd/2026-10-18-edicaptura-snagit/task-5a-review-probes.cjs`.

Make queue ownership and finalization wait for the queue to be truly empty after all final events, including chunks admitted across awaited phase transitions. Do not treat awaiting an earlier drain invocation as proof that current pending bytes were acknowledged. Preserve one-packet ordering, bounded memory, no resumption after stop, and explicit retry on append failure. Add a deterministic regression for this resume-phase boundary and an actual MediaRecorder regression asserting every emitted/admitted byte reaches the persisted file before success/raw cleanup. This is new silent final-data loss, distinct from resolved reviews-001's stopped clock and reviews-004's unrelated photo cancellation.

## Triage

- Decision: `VALID` — parent triage,18/10/2026.
- Notes: Independent actual MediaRecorder/canvas and real filesystem reproduce omitted final admitted bytes with committed/success and raw deletion. This violates unchanged5a durable-finalization acceptance. The older drain promise does not establish queue quiescence after final events. Fix queue/finalization ownership in the original recorder, preserving ordering/bounds/retry/no late resume; add deterministic and actual-recorder byte/hash regressions. No plan conflict or scope waiver. Original owner receives both007 issues in fix round1; independent scoped re-review remains required before approval.

- Fix approach: recorder drain owns its promise through a loop that revisits pending data after resume-phase IPC; ownership clears before the promise resolves. Final publication additionally requires final stop events, an empty queue and equality of admitted/acknowledged packet counts. Tests hold the real phase response, exercise ordinary stop, stop-event/expiry path and final append failure/retry, and compare emitted/admitted byte count and SHA-256 to the final library file. No main/UI lifecycle bypass or new production test hook is needed. Fresh verification is pending before changing status.


## Resolution — fix round 1, 2026-10-18

Resolved in implementation; independent scoped re-review remains pending. `recorder.js` now installs one shared drain owner before asynchronous work, loops over data admitted during resume-phase IPC, and clears ownership before resolving. Publication requires final stop events, no pending bytes and identical admitted/acknowledged packet counts. The renderer retains pending bytes on failure and retries through the same barrier; no late resume or success precedes final durable ACK.

Regression files: `src/main/recording-preservation.test.cjs` and `tests/recording-renderer.cjs`. Before the production correction, `node --test apps/edicaptura/src/main/recording-preservation.test.cjs` exited 1 (6 pass/2 fail) and `node tests/recording-renderer.cjs` from the app exited 1 (4,266,784 stored versus 4,303,175 emitted bytes). Red logs remain `task-5a-fix-1-recorder-red.log` and `task-5a-fix-1-renderer-red.log` beside the phase report. Reviewer probes/red logs are unchanged.

Final verification: `pnpm --filter @informach/edicaptura test` exit 0, 158/158, no skips; `node tests/recording-renderer.cjs` exit 0 across resume-stop, stop-event, final-append-error/retry, ordinary backpressure and disk-error. All five compare actual emitted/admitted bytes and SHA-256 to real library files, one packet in flight, tracks ended, decode 640x480. The held resume-stop case saved all 4,447,621 bytes; stop-event 4,268,084; final-error/retry 4,332,915. Deterministic cases also cover immediate stop and automatic/expiry callback. `node tests/editor-review-regressions.cjs` and `node tests/workspace-regressions.cjs` exit 0. `pnpm edi:test:native edicaptura` exit 0 on final sources: incremental disk ACK/controller ACK, licensed expiration/denial, normal child exit and cleanup/result 0. App types/build exit 0; changed-file Biome exit 0, zero errors/warnings, one unchanged style info. Full commands, outputs, limitations and new freeze are appended to `task-5a-report.md`.

## Independent acceptance — 2026-10-18

Same independent reviewer: ADDRESSED in task-5a-fix-1-review-report.md; scoped SPEC and QUALITY/SECURITY ACCEPT, zero new findings. Parent read the complete report and accepted this correction, retaining its physical/storage/native limitations. Original finding, triage and implementation evidence above remain historical; fullbatch5 and finalreview remain pending.
