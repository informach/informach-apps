---
status: resolved
file: apps/edicaptura/src/recording/recorder.js
line: 106
severity: high
author: claude-code
provider_ref:
---

# Issue 003: Stop the recording clock on automatic recorder termination

## Review Comment

The new clock follows `capture.recordingState`, but main changes that state to `finalizing` only inside `stopRecording`. The renderer calls `MediaRecorder.stop` directly on the five-minute limit, size limit and ended source track. Its `onstop` saves without announcing this effective stop, so main/control still report recording until the controller disappears. If saving fails, the clock keeps accumulating and the status remains recording indefinitely, despite there being no new video frames. Retry also lacks an explicit failed/finalizing transition. This leaves A07's actual-stop and failure states incomplete.

Send a validated recorder lifecycle event from the real stop/persist boundaries to main, including automatic stop, failed save and retry. Keep the clock paused from the effective stop onward. Preserve the existing final-dataavailable and license recovery semantics. Cover automatic termination plus delayed/failing persistence, then verify duration remains constant while finalizing or failed.

## Triage

- Decision: `VALID`
- Notes: Implementer acknowledged the gap and is adding lifecycle IPC and regressions during this review.

## Resolution

Correção conferida pelo revisor na versão atual; suíte Node 49/49 e renderer passaram em 18/10/2026. Inclui regressão de parada automática, fotos tardias e troca/reabertura concorrente. Evidências em docs/propostas/edi-suite-2026-10-16/edicaptura-lotes/lote-01.md.
