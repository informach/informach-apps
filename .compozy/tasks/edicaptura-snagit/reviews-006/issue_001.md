---
status: resolved
file: apps/edicaptura/src/main/main.cjs
line: 607
severity: high
author: claude-code
provider_ref:
---

# Issue 001: Budget every screen thumbnail before scroll acquisition

## Review Comment

The new acquisition admission charges only `active.display`, but the called `getScreen` (lines 285–301) requests `types: ["screen"]` and receives a thumbnail for every screen. It retains that complete array while encoding the selected thumbnail and creating its normalized NativeImage. Neither the known screen count nor the actual returned dimensions/aggregate bytes are checked. The accepted 4b source adapter already treats eager thumbnails as aggregate allocations; the scrolling path bypasses that contract.

Independent reproduction uses the actual `nextSegment`/`getScreen` functions with an Electron-shaped synthetic adapter: a 100×100 collected region on a selected 7680×4320 display, four returned 7680×4320 screen thumbnails, and a distinct cropped image. The request reaches selected-image normalization and completes without budget rejection. The four known native source thumbnails plus the normalized selected image alone represent `5 * 7680 * 4320 * 4 = 663552000` bytes, above `536870912` (512 MiB), before PNG, crop, retained work or worker copies. This probe does not allocate those large images or claim measured RSS; it establishes the missing admission at the actual integration boundary. Reproduce with `node .superpowers/sdd/2026-10-18-edicaptura-snagit/task-4c-review-probes.cjs` (`all-screen-acquisition` record).

Preflight the complete known screen set/request size together with retained scroll work, then validate all returned source dimensions/bytes and selected-source identity before normalization/crop. Include the actual known normalization/encoding lifetimes in the acquisition model and preserve the collected session on rejection. Reuse the typed acquisition boundary where appropriate without widening photo/video authority. Keep the documented external source-creation race distinct: it does not justify omitting sources already known or actually returned. Add a multi-screen main/adapter regression that asserts no normalization/publication after rejection and successful retry with an admissible set.

## Triage

- Decision: `VALID`
- Notes: Parent read the full independent report and exact synthetic real-main adapter reproduction. VALID high known all-screen/normalization admission gap, distinct from external Electron allocation uncertainty. Required fix1 with complete preflight/returned-source validation, retained-work preservation and admissible retry. Pending scoped re-review.


## Resolution — 18/10/2026

Parent read the complete scoped fix1 re-review report. ADDRESSED; SPEC and QUALITY/SECURITY ACCEPT for4c within documented limits, zero new findings. Independent55 focused tests, actual controller mid-worker remove/configure/cut, corrected original probes and Biome passed;10 reviewed and33 frozen paths matched. Original finding/VALID triage and red evidence preserved. Full licensed/physical4d and historical native diagnostics remain separate pending boundaries.
