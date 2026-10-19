---
status: resolved
file: apps/edicaptura/src/main/main.cjs
line: 564
severity: medium
author: claude-code
provider_ref:
---

# Issue 002: Publish restored scroll state after cancelled review

## Review Comment

`ScrollSession.edit` mutates its images/cuts/margins before awaiting the worker, then restores its snapshot and clears `busy` on rejection. If the user pauses while that worker is processing, `pauseScroll` immediately synchronizes those tentative values into `active.segments`/`active.overlaps` and publishes them with `busy: true`. The rejected await here has no reconciliation/final state publication. The session rolls back, but its main mirrors and the controller remain stale.

A fresh actual-main/real-worker probe collects two segments, starts `{op:"remove", index:1}`, waits until the worker is busy, then calls pause and awaits the rejected review. It obtains `controlState().count === 1` and `seams.length === 2`, while `ScrollSession.images.length === 2`. The last `control-update` still has `busy: true` although the real session is idle. Reproduce with `node .superpowers/sdd/2026-10-18-edicaptura-snagit/task-4c-review-probes.cjs` (`cancel-review` record).

The renderer disables preview, capture, finish and several editing controls from this stale busy state; its cancelled-review generation guard discards the late response, so it cannot repair the main publication. Retained pixels were not lost in the reproduction, but the count is wrong and ordinary review/save remains disabled until another state-producing action. The existing controller test pauses after `session.edit` has already completed, so it misses this earlier cancellation window.

Make review state publication transactional or reconcile the session's restored state in a guarded failure/finalization path after the edit settles. Ensure mirrors and the final idle/paused controller update agree, without publishing to a replaced session or reactivating cancelled automation. Cover actual main plus worker cancellation during remove/configure/cut, then assert restored count/cuts/geometry, `busy: false`, available review/save controls and no stale preview.

## Triage

- Decision: `VALID`
- Notes: Parent read the full independent report and actual main/real-worker cancellation reproduction. VALID medium rollback/mirror/final busy publication defect. Required fix1 for guarded transactional/reconciled state and actual mid-worker remove/configure/cut cancellation plus usable idle/paused controls. Pending scoped re-review.


## Resolution — 18/10/2026

Parent read the complete scoped fix1 re-review report. ADDRESSED; SPEC and QUALITY/SECURITY ACCEPT for4c within documented limits, zero new findings. Independent55 focused tests, actual controller mid-worker remove/configure/cut, corrected original probes and Biome passed;10 reviewed and33 frozen paths matched. Original finding/VALID triage and red evidence preserved. Full licensed/physical4d and historical native diagnostics remain separate pending boundaries.
