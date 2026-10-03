# Missão Saber Laboratory Implementation Plan

> **For agentic workers:** Execute this plan task by task with separate ownership for the three tool groups; the primary worker integrates and reviews all changes. The writing-plans skill recommends subagent-driven execution. Its optional superpowers execution packages are not installed; the available collaboration tools provide the execution mechanism.

**Goal:** Implement the approved laboratory proposal across the 58 skills, 291 missions and 116 recovery lessons, with exact school-year/course eligibility and durable experiments.

**Architecture:** Keep reviewed question snapshots unchanged and attach the laboratory through a separate versioned activity catalog. Mathematical tool modules validate their own serialized state; the server controls ownership, eligibility, assessment and persistence. A shared runner provides prediction, investigation, explanation, transfer, autosave and notebook linkage.

**Tech Stack:** Existing Next.js/React/TypeScript/Zod/PostgreSQL/Drizzle/Vitest/Playwright stack; accessible HTML/SVG and existing design components.

**Spec:** `docs/propostas/missao-saber-laboratorio-2026-10-03/proposta.md` and `notas-tecnicas.md`, with the three coverage CSVs.

## Global constraints

- Keep all 19 tool families and their authored modes in scope; no generic fallback pretending a mode is implemented.
- Preserve exact course/grade relationships, original experiments, reviewed item versions, reserved assessments and the current independence engine.
- Valid configurations must be mathematically meaningful and input promises must match actual controls.
- Root owns catalog, shared contracts, persistence, runner, mission/notebook integration and migrations. Tool workers own disjoint folders only.
- The subsequent user request authorizes commit, merge, push and production deployment after staged reviews and complete verification. Do not touch `.claude/settings.local.json` or reference cookies.

## Task 1: Contracts and curriculum catalog

Files: `features/labs/runtime/types.ts`, `curriculum.ts`, `catalog.ts`, `catalog.test.ts`.

```ts
type ToolLaunch = { family: ToolFamilyId; mode: string; grade: number; variant: 0 | 1 };
type ToolState = Record<string, unknown>;
type ToolAssessment = { correct: boolean | null; message: string; summary: string };
type ToolActivity = { title: string; prompt: string; prediction: string; observation: string;
  explanation: string; rubric: string[]; initialState: ToolState;
  answerLabel: string; answerHint?: string; choices?: string[] };
type ToolModule = { family: ToolFamilyId; modes: readonly string[];
  activity: (launch: ToolLaunch) => ToolActivity;
  parse: (launch: ToolLaunch, raw: unknown) => ToolState;
  assess: (launch: ToolLaunch, state: ToolState, answer: string) => ToolAssessment;
  summarize: (launch: ToolLaunch, state: ToolState) => string };
```

- [x] Define these contracts and the 19 stable family IDs L01–L19.
- [x] Convert the approved mode mapping into a versioned sidecar catalog; retain exact mission paths and family relationships.
- [x] Test `eligibleExperiences({grade:5,courseId:'canguru-e'})` excludes `fracoes-5`, covers the eligible path, excludes reserved items and includes no missing mode.
- [x] Test every proposed mission/recovery relationship and all tool mode references.
- [x] Run focused catalog tests, then review the diff against the CSVs.

## Task 2: Elementary and spatial tools

Files: `runtime/elementary/` only. Produce `elementaryTools: ToolModule[]` and `ElementaryTool(props: LabToolProps)` in `components.tsx`.

- [x] Implement L01, L02, L03, L04, L05, L06, L07 and L19 with all mapped modes.
- [x] Use validated states, action controls with keyboard alternatives and textual summaries.
- [x] Add independent mathematical examples: equal fractions with different partitions, area 20/perimeter 18, corner removal, unit conversion, scale squared, coordinates, hidden cube faces and valid nets.
- [x] Verify invalid states fail and valid alternative constructions are accepted.
- [x] Run the group's tests and TypeScript checks; report actual mode coverage.

## Task 3: Algebra and advanced geometry tools

Files: `runtime/algebra/` only. Produce `algebraTools: ToolModule[]` and `AlgebraTool(props: LabToolProps)`.

- [x] Implement L08, L09, L10, L11 and L18 with the mapped modes and age-specific controls.
- [x] Implement bounded expression grammar and exact arithmetic where needed; do not evaluate JavaScript expressions.
- [x] Verify equations preserve equivalence, modulus cycles, recurrence values, graph domains, Pythagoras and trigonometric conditions using independent expected values.
- [x] Test malformed expressions and impossible configurations, including division by zero and degenerate geometry.
- [x] Run group tests and TypeScript checks; report actual coverage.

## Task 4: Reasoning, data and finance tools

Files: `runtime/reasoning/` only. Produce `reasoningTools: ToolModule[]` and `ReasoningTool(props: LabToolProps)`.

- [x] Implement L12, L13, L14, L15, L16 and L17 with the mapped modes.
- [x] Distinguish open proofs from closed predicates; show authored rubrics and never treat finite samples as universal proof.
- [x] Verify combinations versus arrangements, replacement, conditional probability, budget constraints, nominal/real growth and present value using independent examples.
- [x] Test table dimensions, random simulation bounds and finance period/rounding assumptions.
- [x] Run group tests and TypeScript checks; report actual coverage.

## Task 5: Durable executions and notebook snapshots

Files: DB schema/migrations, `runtime/schemas.ts`, `runtime/repository.ts`, `runtime/actions.ts`, integration tests and notebook rendering.

- [x] Add an execution table with UUID, profile FK, experience/version, grade snapshot, state, stage, annotations, revision, notebook snapshot and timestamps. Keep the original table intact.
- [x] Generate the schema migration with `pnpm --filter @informach/db db:generate`; inspect only intended SQL changes.
- [x] Implement server-side ownership/eligibility and tool validation, idempotent create/save and optimistic revision conflicts.
- [x] Preserve legacy montages through explicitly versioned import paths with exact original state retained.
- [x] Save an immutable notebook attachment and reopen/duplicate the saved execution.
- [x] Integration tests: another user/profile cannot read/write; wrong grade/course cannot launch; retry cannot duplicate; two tabs conflict; notebook state remains frozen; old experiments remain readable.

## Task 6: Library, runner and mission integration

Files: lab page, runtime components, learning player/service and notebook page/components.

- [x] Render relevant recommendations, eligible library filters and resumable experiments.
- [x] Lazy-load only the selected tool group; provide prediction, tool interaction, observation, explanation and new transfer variant.
- [x] Implement serialized autosave, pending/error state, retry, conflict recovery, before-unload protection and isolated local drafts.
- [x] Link mission context without changing frozen item definitions; keep current answer mounted while exploring and record assistance before the answer can submit.
- [x] Transfer assessment runs on the server and is separate from mastery. Existing mission evidence remains authoritative.
- [x] Browser checks: fractions accept `1/2` and `0,5`, no repeated unit required; keyboard-only construction; mobile layout; profile switching; save/reload; notebook round trip.

## Task 7: Full verification and delivery review

- [x] Check every proposal acceptance criterion against concrete code and evidence. Document that live learner research requires participants and is not replaced by automated tests.
- [x] Run Biome on changed files, app/DB TypeScript checks, complete app unit suite, isolated integration suite, Playwright desktop/mobile flows and app build.
- [x] Revisit failures at their cause; rerun affected checks after fixes and the final verification gate after the last change.
- [x] Write a verification report with exact commands, counts, warnings and remaining empirical validation needs. No completeness claim based on registry counts alone.
