---
status: resolved
file: apps/edicaptura/src/main/recording-store.ts
line: 295
severity: high
author: claude-code
provider_ref:
---

# Issue 002: Account for retained copies before rebuilding a retry

## Review Comment

`capacity` budgets `(available - 256 MiB) / 3` (line 119) for raw parts, assembly and the published library file. After publication succeeds but `readBack` fails, all three complete copies correctly remain. On explicit retry, the journal is still finalized, so lines 295–319 unconditionally build another full `.assembling` file before replacing the already retained `recording.webm`. At that point **four** full copies exist on a same-filesystem installation. Neither this assembly nor publication performs a fresh space/reserve admission. The fourth copy is needed even though the library already contains the correct bytes and `importVideoFile` would reuse them.

Command: `node .superpowers/sdd/2026-10-18-edicaptura-snagit/task-5a-review-probes.cjs`. The `readBack-retry-copy-lifetimes` probe uses real RecordingStore, Library and files, injects only a readBack failure, then observes actual file sizes at the retry assembly sync. For a 1,048,576-byte recording it measures **4,194,304 bytes** across `0.chunk`, retained `recording.webm`, published `<id>.webm` and new `<uuid>.assembling`: `advertisedCopies:3`, `actualSimultaneousCopies:4`. It does not fill the host disk or claim physical ENOSPC. Its fs.open wrapper only observes the real handle's sync and restores the function afterward.

The impact scales with the recording: when the admitted recording exceeds the 256 MiB reserve, this can consume the reserve and, near the admitted capacity, fail every recovery attempt for lack of the extra full copy. The renderer's 32 MiB early-stop margin cannot cover an arbitrary extra copy. For example, a 1 GiB maxBytes allowance with the existing margin can produce about 992 MiB, whose four copies exceed the initial `3 GiB + 256 MiB` availability. Original raw is preserved, but the mandatory capacity-aware recovery/retry contract fails precisely when disk space is scarce. An earlier failed metadata publication has the same retained media lifetimes.

Reuse an existing verified assembly/publication where appropriate, or explicitly admit all actual simultaneous copies and journal overhead per filesystem before allocation, preserving raw through every failure. Avoid rebuilding an already verified full recording solely to retry reading its library document. Add real-file retry tests for publication/readBack failure, same versus distinct raw/library filesystems, remaining-space/reserve checks and successful recovery without an unnecessary full-sized duplicate. Align the documented three-copy estimate with the implemented lifetime.

## Triage

- Decision: `VALID` — parent triage,18/10/2026.
- Notes: The real-file probe measures four simultaneous complete media copies during retry while capacity admits three. Preserve raw and validate/reuse retained assembly/publication where appropriate, or account for the actual simultaneous lifetimes and reserve on source/destination filesystems before allocation. Do not delete the only valid recovery copy or hide ENOSPC. Cover readBack/publication failure, remaining-space/reserve and same/different filesystem models without filling the user's disk; distinguish model proof from physically distinct-volume testing. Align docs with the resulting behavior. No plan conflict or scope waiver; original owner fix round1 plus independent scoped re-review.

- Fix approach and necessary adjacent files: store verifies/reuses retained assembly; `library.cjs` must also reuse a matching media file when only metadata publication failed, otherwise that separate publisher would still allocate an unnecessary full copy. `video-files.ts` centralizes the real destination-filesystem reserve check at copy allocation, also counting both temporary and exclusive destination lifetimes. Store checks assembly/journal allocation and library checks publication/metadata allocation. Initial admission budgets three media lifetimes plus current/replacement journals; it remains conservative for distinct volumes. Real-file tests prove stable assembly/media identity and preserved raw through retry/corruption; controlled statfs availability models same/distinct volumes without physical ENOSPC or production hooks. Fresh verification is pending before changing status.


## Resolution — fix round 1, 2026-10-18

Resolved in implementation; independent scoped re-review remains pending. `recording-store.ts` verifies and reuses a retained assembly (or validates it against raw parts if its journal hash was not yet persisted). `library.cjs` reuses verified media when only metadata publication failed. The retry therefore avoids allocating a fourth full copy. Corruption rejects while retaining raw. `video-files.ts` supplies the destination-filesystem reserve check at copy allocation; store/library recheck assembly, journal and metadata allocations. The initial three-copy budget additionally accounts for current/replacement journals, and actual existing allocations are reflected in fresh statfs availability. Raw deletion still follows successful publication, readBack and durable committed journal.

`recording-store.test.cjs` observes real-file inode/mtime and zero new assembly allocations across publication/readBack retry, verifies integrity and one library entry, and checks source/destination/committed-journal reserve failures. Same and distinct filesystem availability are controlled statfs models over real files on one physical volume; no physical ENOSPC or second mounted volume is claimed. Before correction, `node --test --test-name-pattern="publication/readBack|fresh commit allocation" apps/edicaptura/src/main/recording-store.test.cjs` exited 1 with both regressions failing (changed assembly identity; missing space rejection); log `task-5a-fix-1-store-red.log` is preserved.

Final `pnpm --filter @informach/edicaptura test` exit 0, 158/158, includes all 23 focused store/recorder cases. Real Chromium recorder/library/recovery runner exit 0, real workspace recovery/root/edit race exit 0. App types/build and final serial `pnpm edi:test:native edicaptura` exit 0 with normal exit/cleanup. Changed-file Biome exit 0, zero errors/warnings and one preexisting info. Documentation README/lote-05 reflects reuse, reserve and actual copy lifetimes. Full report separates real small-file evidence from availability models; it does not claim 32 GiB, physical full disk or power-loss qualification.

## Independent acceptance — 2026-10-18

Same independent reviewer: ADDRESSED in task-5a-fix-1-review-report.md; scoped SPEC and QUALITY/SECURITY ACCEPT, zero new findings. Parent read the complete report and accepted this correction, retaining its physical/storage/native limitations. Original finding, triage and implementation evidence above remain historical; fullbatch5 and finalreview remain pending.
