# EdiCaptura Snagit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execution is already authorized by the user; reviews occur between batches and at the end.

**Goal:** Complete the Windows EdiCaptura capture, editing, documentation and sharing workflows identified in the approved diagnosis, preserving projects and existing suite integration.

**Architecture:** Keep main/preload/renderer boundaries and the existing UI while evolving document, capture and media operations behind explicit typed contracts. Reuse suite licensing, files and billing; isolate workers/native helpers and preserve originals. Each subsystem receives a focused implementation record before code and an independent review after verification.

**Tech Stack:** Node 24.15.0, pnpm 9.15.0, Electron 44.8.0, electron-vite 6, TypeScript, existing renderer JavaScript, Playwright and Node tests; approved suite packages.

**Spec:** `docs/propostas/edi-suite-2026-10-16/analise-edicaptura-snagit.md`.

**Scope update approved18/10:** the user chose a lean Captura with quick video after comparing EdiAula/EdiPDF. The binding [suite focus decision](../../propostas/edi-suite-2026-10-16/edicaptura-lotes/foco-na-suite.md) supersedes conflicting future requirements below. Already delivered features and phase5a remain intact. Advanced video belongs to EdiAula; general PDF work belongs to EdiPDF. Historical requirements must be marked transferred/removed, never implemented by association.

The user subsequently excluded direct app handoffs for now. Export common files and let the person choose/open each tool; no launch buttons, installation discovery or receiving contracts in this delivery.

**Closure approved 18/10:** the user ends this delivery after accepted 5b because EdiPDF/OCR is improving in another session. Defer 5c and batches 6–8; document the [common OCR continuation](../../propostas/edi-suite-2026-10-16/edicaptura-lotes/continuidade-edicaptura-edipdf.md). Review the entire delivered checkpoint after current remote integration, then perform explicitly authorized commit/push/normal merge into main respecting checks. No OCR/PDF source implementation or desktop release now. The original full eight-batch goal is not complete.

## Global Constraints

- Preserve unrelated `.claude/settings.local.json` and existing analysis documentation.
- No app-to-app imports; shared services belong in packages with explicit exports.
- New domain/IPC/infrastructure modules use TypeScript; existing renderer remains compatible.
- Sandbox, context isolation and suite authorization remain enabled.
- No production data or personal profiles in tests. No publishing, remote resource mutation or commercial change inferred from implementation authorization.
- Optional remote AI uses only the user's Claude Code or Codex subscription, following EdiAula's existing official-client/local-MCP integration. Reuse shared suite contracts; extract reusable infrastructure to packages rather than importing EdiAula. No Edi AI credits, provider API-key option or automatic paid fallback. Local processing remains usable without either client. See the binding [18/10 decision](../../propostas/edi-suite-2026-10-16/edicaptura-lotes/decisao-ia-assinatura.md).
- Windows is the approved platform. N21 requires platform investigation and honest availability, not an untested macOS promise.
- Review every batch, resolve confirmed issues and reverify before the next batch. Full review follows the delivered checkpoint revised by the explicit closure decision.
- User condition18/10: before any push, fetch and integrate remote updates while preserving local/unrelated work; final review and affected checks must cover the integrated result. Current fetched27ac84cf was integrated locally with source preservation and independent009/fix1 acceptance. Re-fetch near push and reconcile any newer main before publication. The later explicit closure request authorizes source commit/push/main after integration and final gates; no desktop release is inferred.

## Batches and requirement coverage

| Batch | Deliverable | Requirements | Depends on |
| --- | --- | --- | --- |
| 1 | Document identity, save/recovery, steps/properties/history, current tooling/docs | A01–A10; M12 foundation | Baseline |
| 2 | Rich annotations, contextual workspace, composition, sanitized export | M03–M04, M07–M10; N07–N09 | 1 |
| 3 | Library management, portable project/backup, fast import/export | M05; N16–N17, N19 | 1–2 |
| 4 | Capture modes/presets, precision, monitors and scroll review/automation | M01–M02, M11, M12 processing; N01–N04; A10 capture integration | 1–3 |
| 5 | Incremental recording, optional audio, pause, MP4/GIF and start/end trim | M05 video metadata, M06; N10, narrowed N11–N12; N13 transferred; A10 recording integration | 1–4 |
| 6 | Local OCR, assisted masks, numbering and bounded task commands | A04 explicit renumber/labels; N05, N07 assisted detection, N20 local operations; N06 removed | 1–5 |
| 7 | Simple process guides and HTML/PDF files | N14; narrowed N15 without DOCX/general document editor or direct app handoff | 1–6 |
| 8 | Controlled sharing and optional cloud assistance, platform audit and benchmarks | N18, N20 optional models, N21 | 1–7 |

## Batch 1: integrity

**Files:** modify `apps/edicaptura/src/editor/{canvas,editor}.js`, `src/main/{main,library,preload}.cjs`, `src/recording/{control,recorder}.js`; add typed `src/domain/document.ts`, `src/domain/saving.ts`, browser regressions in `tests/`; extend main tests; update README/PLANO.

**Interfaces:** document version and annotation validation at persistence; metadata update preserves kind/assets; staged image preparation then synchronous activation; save revisions are immutable snapshots; failures retain pending work.

- [x] Add regression scenarios for invalid/concurrent opening, image/video saves, selection properties, step deletion/reinsert, bounded history and library corruption.
- [x] Run regressions red. For steps assert `new Set(numbers).size === numbers.length`; for failed load assert saved document ID remains the previous ID; for video rename reload `Library.read(id)` and assert kind/bytes unchanged.
- [x] Implement prepare/commit loading, serialized activation, revisioned save state, metadata-only video update, corruption reporting and repair from existing originals.
- [x] Preserve scroll on monitor changes; use effective recording start/stop events and expose recovery state.
- [x] Run app tests, renderer regressions, Biome on scope, build and native licensed integration.
- [x] Independent review in `.compozy/tasks/edicaptura-snagit/reviews-001/`; fix confirmed findings and repeat affected gates.

## Subsequent batch task cycle

Each batch gets a focused plan under `docs/propostas/edi-suite-2026-10-16/edicaptura-lotes/` defining exact files, interfaces and acceptance scenarios before implementation. The following cycle applies to each independently reviewable deliverable:

1. Add a behavioral regression using synthetic fixtures and the actual subsystem; record failure output.
2. Implement the domain operation, validated IPC and usable interface together.
3. Test success, cancellation, invalid input, stale completion, permission and disk failure as applicable.
4. Verify targeted tests/types/lint/build and the affected suite consumers.
5. Review the complete batch diff against its acceptance scenarios; fix and rerun affected gates.
6. Update requirement coverage and evidence; start the next batch only after the review gate.

No commits/pushes are required to keep local reviewable batches; authorization for publication remains separate.

Batch 4 is divided into serial reviewable parts without removing scope: 4a immutable large raster assets/history and metadata-only saving; 4b capture modes, precision, presets and monitors; 4c scroll workers, review and automation; 4d licensed functional native tests and stage diagnostics. Each part receives an independent review before the next; batch 5 starts after all four parts pass their gates.

Part 4b has three serial review boundaries: 4b1 typed geometry/native Windows infrastructure; 4b2 main/IPC/UI modes, fresh timing and multi-monitor composition; 4b3 selection precision/presets/shortcuts and complete4b acceptance. They preserve the original capture scope; 4c begins after all three pass.

## Tracking

Execution currently comprises eight main batches and fifteen implementation phases: batches 1, 2 and 3; phases 4a, 4b1, 4b2, 4b3, 4c and 4d; phases 5a, 5b and 5c; then batches 6, 7 and 8. Each phase has its own review gate, followed by the final whole-change review. Fix rounds do not count as new batches. The prior sixteen-phase plan is superseded by the approved suite focus decision; eleven phases are accepted: 1–4 plus 5a/5b, including resolved independent reviews 007/008. User closure defers 5c/6–8; the final review covers this delivered checkpoint.

- [x] Batch 1 integrity implemented and reviewed (A10 licensed functional capture coverage continues in batches 4/5)
- [x] Batch 2 implemented and reviewed
- [x] Batch 3 implemented and reviewed (M05 video duration/thumbnail continues in batch 5)
- [x] Batch 4 implemented and reviewed (independent4d/full4 spec-quality-coverage ACCEPT within controlled verification; hardware/active/clipboard limits explicit)
- [x] 4a large raster/history and metadata-only saving (independent review accepted, zero findings)
- [x] 4b capture modes/precision/presets/monitors (full4b spec/quality/coverage accepted after review005 fix1)
- [x] 4b1 typed geometry/native Windows infrastructure (independent spec/quality accepted, zero findings)
- [x] 4b2 mode/pipeline/UI/timing/multi-monitor pixels (review004 findings resolved after fix1 and scoped re-review)
- [x] 4b3 precision/presets/shortcuts/full4b acceptance (fractional selection issue resolved by independent scoped re-review)
- [x] 4c scrolling/worker/review/automation (review006 issues resolved after fix1; independent spec/quality/security accepted)
- [x] 4d licensed functional native tests/diagnostics/physical matrix (zero new findings; unavailable/unsafe native and physical cells remain unverified)
- [ ] Batch 5 implemented and reviewed
- [x] 5a durable recording journal/chunks/recovery/authorized range playback (review007 critical/high resolved and independently accepted after fix1; physical limits retained)
- [x] 5b minimal shared native media/packaging/probe/MP4/GIF/frame/start-end trim (008 fixed and accepted in scoped independent re-review)
- [ ] 5c DEFERRED by user: optional audio/pause/simple controls/native integration/full5 coverage
- 5d withdrawn from Captura by approved suite focus decision; no execution/acceptance claimed
- [ ] Batch 6 DEFERRED: inspect updated EdiPDF before planning a common OCR base
- [ ] Batch 7 DEFERRED: simple guides and HTML/PDF
- [ ] Batch 8 DEFERRED: sharing, own-subscription assistance, platform audit and benchmarks
- [ ] Full delivered-checkpoint requirements/security/concurrency/performance review after remote integration
- [ ] Final regression evidence and accurate remaining limitations


Original batch5 boundaries had four phases. The later approved suite focus decision narrows future work:5a produces durable recording/session and streaming contracts;5b builds minimal native-media, metadata and quick output;5c adds optional audio/pause and complete revised5 integration. No Whisper/caption/webcam/composition editor or direct app handoff is added to Captura. This historical dependency is subject to replanning with the actual updated EdiPDF; do not automatically dispatch 5c/6–8 after this user-requested checkpoint closure.
