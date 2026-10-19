---
status: resolved
file: apps/edicaptura/src/main/quick-video.ts
line: 261
severity: high
author: claude-code
provider_ref:
---

# Issue 001: Recheck cancellation after final destination validation

## Review Comment

The last abort and authority checks run at lines 259–260, but `await assertDestination()` then yields to `realpath` before `rename(staging, target)`. A cancellation or license revocation received during that await is recorded by `QuickVideo.cancel`/the IPC operation, yet the continuation still renames the output, replaces an existing destination and reports success. The caller awaiting cancellation does not prevent this publication. This violates 5b's cancellation/no-late-publication contract; an export may replace a previously saved file after the user canceled it. The immutable source remains intact.

Confirmed on the frozen source with real FFmpeg 9.0.2, real `QuickVideo`, `Library` and filesystem, using only a synthesized 64×48 WebM and owned temporary files. Command: `node .superpowers/sdd/2026-10-18-edicaptura-snagit/task-5b-review-cancel-boundary.cjs` (exit 0 confirms the defect). The probe holds the third destination-directory `realpath` response, which is the final validation after all encoding/probing/sync; requests `service.cancel(jobId)` and revokes the injected authority; then releases that response. Result in `task-5b-review-cancel-boundary.log`: `cancellationRequestedBeforeRelease:true`, `authorityRevokedBeforeRelease:true`, `success:true`, `bytes:2038`, `existingDestinationReplaced:true`, `sourceUnchanged:true`. No production hook or source edit was used. The wrapper returns the real canonical path, so the path guard itself succeeds normally.

Perform the abort and job/access/library authority checks after the last awaited validation and immediately before starting publication, with no intervening await. Preserve destination canonicalization and source identity protections; cancellation before the commit boundary must reject and clean only staging, leaving both the source and an existing destination unchanged. Add a deterministic regression for this final validation boundary (cancellation and access revocation), alongside the existing tests that cancel during encoding or the save picker. A later successful renderer/native run does not exercise this missing boundary.

This is a new export publication race. It does not reopen the resolved 007 recorder-drain or retry-capacity findings.

## Triage

- Decision: `VALID` — parent read the complete independent report and real reproduction.
- Notes: The final destination canonicalization yields after the last cancellation/access check, so cancellation/revocation can arrive before rename and still publish. Add synchronous checks after the final await immediately before publication; retain realpath/source guards and child-close/staging lifetime. Regressions must distinguish cancellation alone and authority revocation alone while preserving existing destination/original. No plan conflict or waiver; source fix and independent scoped re-review required.

## Fix round 1 — implementation verified, independent acceptance pending

Production change is limited to `apps/edicaptura/src/main/quick-video.ts`: immediately after the final awaited `assertDestination()`, synchronously call `controller.signal.throwIfAborted()` and `assertAuthority()` before `rename`, with no intervening await. Earlier checks, realpath/case/junction and source identity checks, process close and staging cleanup are retained. IPC is unchanged: its existing authority callback already composes job.check, access, canceled operation and current-library identity.

`quick-video-native.cjs` adds three deterministic real-files/real-FFmpeg tests holding only the actual third destination realpath response. Cancellation ALONE and revocation ALONE each require rejection, unchanged source bytes/SHA, unchanged existing destination marker bytes/SHA, no staging and released job; an authorized control must publish a real H26464×48 MP4. The production interface has no test hook. No sleeps, timeout increase, tolerance, skips or prior-probe edits.

Fresh verification on final source (18/10/2026):
- `pnpm --filter @informach/edicaptura test:video-native`: RED exit1, 2pass/2fail; both isolated cases published before the fix. GREEN exit0, 4pass/0fail/0skipped. Logs `task-5b-fix-1-red.log` and `task-5b-fix-1-green.log`.
- `pnpm --filter @informach/edicaptura test`: exit0,160pass/0fail/0skipped; typecheck/build exit0.
- `pnpm exec biome check apps/edicaptura/src/main/quick-video.ts apps/edicaptura/tests/quick-video-native.cjs`: exit0,2files,no fixes/diagnostics.
- `node apps/edicaptura/tests/quick-video-renderer.cjs`: exit0,metadata/trim/undo/preview/actualGIF/MP4/reopen.
- `pnpm edi:test:package --installer edicaptura`: exit0, final fix package0.0.0-beta.29880,192957603bytes. Executing `task-5b-final-package-media.mts 0.0.0-beta.29880`: exit0, ownResourcesExecuted:true,38file bundle9.0.2, notices/source,true; no cross-app fallback. Original beta40128 is historical and does not contain this fix.

Status resolved records completed implementation and verification only. Independent scoped re-review is pending. Full appended evidence/limits are in `task-5b-report.md`; NEW `task-5b-fix-1-freeze.json` identifies the fix snapshot. Unexplained resume/WGC concerns remain; this fix does not claim to resolve them. No Git mutation/publication/OCR/later phase.


Parent acceptance: independent scoped fix1 review returned SPEC ACCEPT and QUALITY/SECURITY ACCEPT;008/001 ADDRESSED, zero new findings. Parent read the FULL report, reconciled cannotverify as retained resume/WGC/physical qualification limits with no additional causally established software gap, and accepted5b. Integration/checkpoint fullreview/finalgates/authorizedMAIN publication remain pending. Original finding/probe preserved; previous freeze is historical pre-parent-document provenance.
