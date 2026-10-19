---
status: resolved
file: apps/edicaptura/src/main/capture-pipeline.ts
line: 305
severity: high
author: claude-code
provider_ref:
---

# Issue 001: Valid pixel selections fail at fractional display scales

## Review Comment

`selected()` compares the JSON serialization of `intersectRect(rect, a.region)` with the original rectangle. Intersection recomputes width/height by subtracting endpoints, so normal floating-point rounding changes an otherwise fully contained fractional-DIP rectangle. The new numeric/pixel selection flow legitimately produces these coordinates on 125%, 150% and 175% displays. Confirmation throws `Região inválida.` before remembering or saving the capture.

Fresh reproduction used the actual selection renderer in isolated Chromium at 1366x768, a synthetic 160x80 DIP display with an actual bitmap of `160*scale` by `80*scale`, and the production PhotoCapture service using the existing injected bitmap fixture. Click Create region, set width/height to 2 pixels, X to `100/scale`, Y to `10/scale`, focus the surface and press Enter. The actual renderer request at scale1.25 was `{x:80,y:8,width:1.5999999999999999,height:1.5999999999999999}`; scale1.5 produced `{x:66.66666666666666,y:6.666666666666666,width:1.3333333333333333,height:1.3333333333333333}`; scale1.75 produced `{x:57.14285714285714,y:5.714285714285714,width:1.142857142857143,height:1.142857142857143}`. All three returned `Região inválida.` and saved zero images. Controls at scale1 and scale2 saved successfully. A separate direct service probe reproduced the same rejection without browser rounding.

This is a required M01/M11/N04 integration failure exposed by 4b3's precision work and the full4b coverage gate. It is not a request to redesign previously accepted geometry or reopen an unrelated resolved issue. Current precision/native-repeat tests use scale2 and miss the fractional-DIP path.

Validate containment without serialized numerical equality, using the authoritative selection/output-pixel geometry or a narrowly justified numerical tolerance. Preserve rejection of genuinely out-of-bounds selections; do not merely round every DIP value to an integer or broadly accept clipped rectangles. Add a renderer-to-service regression for fractional scales, negative origins, both fresh/frozen confirmation and the persisted repeat path, checking exact output dimensions/pixels. Keep explicit outside-topology, outside-selection, stale topology, cancellation and duplicate-confirmation rejection tests.

## Triage

- Decision: `VALID`
- Notes: Parent read the complete initial review and fix1 scoped re-review. Direct endpoint containment preserves the submitted rectangle and strict outside rejection. Independent 18-test service run, actual renderer-to-service matrix (90 cases, 180 exact pixel outputs) and the original five-scale reproduction passed. Issue ADDRESSED; SPEC, QUALITY/SECURITY and FULL4b COVERAGE accepted on 2026-10-18 within the documented synthetic/native limits.
