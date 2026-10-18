import assert from "node:assert/strict";
import { test } from "node:test";
import type { CourseTemplate } from "../src/shared/courseTemplate.ts";
import {
  addLearning,
  draftLearning,
  emptyLearning,
  LEARNING_LIMIT,
  type Learning,
  type LearningEvent,
  learnedDefaults,
  learnedMinSilence,
  proposalLearning,
} from "../src/shared/learning.ts";
import type { DiffItem } from "../src/shared/projectDiff.ts";

const template = (extra: Partial<CourseTemplate> = {}): CourseTemplate => ({
  version: 2,
  course: "Sistema Zero",
  format: { width: 1920, height: 1080, fps: 30 },
  zoom: { auto: true, scale: 1.8 },
  cards: { opening: true, closing: true },
  cleanup: { minSilence: 1 },
  annotations: { maxPerMinute: 4, presets: [] },
  rules: [
    { when: { event: "click" }, do: { zoom: { scale: 1.8 } } },
    { when: { screenText: "botão Play" }, do: { annotation: { kind: "highlight" } } },
    { when: { screenText: "bloco repita" }, do: { annotation: { kind: "arrow" } } },
  ],
  ...extra,
});

const learning = (events: Omit<LearningEvent, "at">[]): Learning => ({
  version: 1,
  events: events.map((e) => ({ ...e, at: 1 })),
});

test("learnedMinSilence: the shortest cut pause that best agrees with the decisions", () => {
  // Pauses under 1.6 s were kept, longer ones cut.
  const decisions = [
    { seconds: 1.1, accepted: false },
    { seconds: 1.3, accepted: false },
    { seconds: 1.5, accepted: false },
    { seconds: 1.8, accepted: true },
    { seconds: 2.4, accepted: true },
    { seconds: 3, accepted: true },
  ];
  const t = learnedMinSilence(decisions, 1);
  assert.ok(t > 1.5 && t <= 1.8, `${t}`);
  // Nothing to learn when every pause was cut: the current value stays.
  assert.equal(
    learnedMinSilence(
      decisions.map((d) => ({ ...d, accepted: true })),
      1,
    ),
    1,
  );
});

test("learnedDefaults leaves the template alone without decisions", () => {
  const t = template();
  assert.deepEqual(learnedDefaults(null, t), { template: t, notes: [] });
  assert.deepEqual(learnedDefaults(emptyLearning(), t).notes, []);
});

test("learnedDefaults: pauses, hesitations said on purpose and kinds nearly always refused", () => {
  const events: Omit<LearningEvent, "at">[] = [
    ...[1.1, 1.2, 1.4].map((seconds) => ({ kind: "silence" as const, accepted: false, seconds })),
    ...[2, 2.5, 3].map((seconds) => ({ kind: "silence" as const, accepted: true, seconds })),
    // "né" refused four times and cut once: the teacher says it on purpose.
    ...Array.from({ length: 4 }, () => ({ kind: "filler" as const, accepted: false, word: "né" })),
    { kind: "filler", accepted: true, word: "né" },
    // "ahn" is cut every time.
    ...Array.from({ length: 3 }, () => ({ kind: "filler" as const, accepted: true, word: "ahn" })),
    // Repeats: refused ten times out of ten.
    ...Array.from({ length: 10 }, () => ({ kind: "repeat" as const, accepted: false })),
  ];
  const { template: t, notes } = learnedDefaults(learning(events), template());
  assert.ok((t.cleanup?.minSilence ?? 0) > 1.4 && (t.cleanup?.minSilence ?? 0) <= 2);
  assert.deepEqual(t.cleanup?.notFillers, ["ne"]);
  assert.equal(t.cleanup?.kinds?.repeat, false);
  assert.equal(t.cleanup?.kinds?.filler, undefined);
  assert.ok(notes.some((n) => /pausas a partir de/.test(n)));
  assert.ok(notes.some((n) => /não corta mais "ne"/.test(n)));
  assert.ok(notes.some((n) => /repetições ficam fora da limpeza/.test(n)));
});

test("learnedDefaults: rules refused every time go (automatic zoom, cards, a direction's annotation)", () => {
  const events: Omit<LearningEvent, "at">[] = [
    ...Array.from({ length: 4 }, () => ({ kind: "zoom" as const, accepted: false })),
    { kind: "card", accepted: false },
    { kind: "card", accepted: false },
    { kind: "annotation", accepted: false, direction: "Clique no botão Play da tela inicial" },
    { kind: "annotation", accepted: false, direction: "Mostre o botão Play" },
    { kind: "annotation", accepted: true, direction: "Arraste o bloco repita" },
  ];
  const saved = template();
  const { template: t, notes } = learnedDefaults(learning(events), saved);
  assert.equal(t.zoom?.auto, false);
  assert.equal(t.cards?.opening, false);
  assert.equal(t.cards?.closing, false);
  const texts = (t.rules ?? []).map((r) => r.when.screenText ?? r.when.event);
  assert.deepEqual(texts, ["bloco repita"]);
  assert.ok(notes.some((n) => /sem zoom automático/.test(n)));
  assert.ok(notes.some((n) => /sem a anotação de "botão Play"/.test(n)));
  // The template saved is not changed in place.
  assert.equal(saved.zoom?.auto, true);
  assert.equal(saved.rules?.length, 3);
  assert.equal(saved.cards?.opening, true);
});

test("learnedDefaults: annotations mostly refused mean fewer per minute", () => {
  const events: Omit<LearningEvent, "at">[] = [
    ...Array.from({ length: 5 }, () => ({ kind: "annotation" as const, accepted: false })),
    { kind: "annotation", accepted: true },
  ];
  const { template: t } = learnedDefaults(learning(events), template());
  assert.equal(t.annotations?.maxPerMinute, 2);
});

test("addLearning keeps the newest decisions only", () => {
  let l = emptyLearning();
  const many = Array.from(
    { length: LEARNING_LIMIT + 10 },
    (_, i): LearningEvent => ({ kind: "zoom", accepted: true, at: i }),
  );
  l = addLearning(l, many);
  assert.equal(l.events.length, LEARNING_LIMIT);
  assert.equal(l.events[0].at, 10);
});

test("proposalLearning reads hesitations, pauses (with the pause kept) and other cuts", () => {
  const items = [
    { category: "filler" as const, status: "pending" as const, text: "Né,", start: 1, end: 1.3 },
    { category: "silence" as const, status: "rejected" as const, start: 4, end: 5.2 },
    { category: "off-script" as const, status: "pending" as const, start: 7, end: 9 },
    { status: "pending" as const, start: 10, end: 11 },
  ];
  const applied = proposalLearning(items, true, 0.4, 7);
  assert.deepEqual(applied, [
    { kind: "filler", accepted: true, at: 7, word: "ne" },
    { kind: "silence", accepted: false, at: 7, seconds: 1.6 },
    { kind: "off-script", accepted: true, at: 7 },
  ]);
  // A proposal thrown away is a no to its cleanup cuts only.
  assert.deepEqual(
    proposalLearning(items, false, 0.4, 7).map((e) => [e.kind, e.accepted]),
    [
      ["filler", false],
      ["silence", false],
    ],
  );
});

test("draftLearning reads cards, annotations of directions and zooms of a draft", () => {
  const item = (
    kind: DiffItem["kind"],
    after: Record<string, unknown> | null,
    status: DiffItem["status"],
  ) => ({
    kind,
    status,
    patches: after ? [{ entity: "clip" as const, id: "c", before: null, after }] : [],
  });
  const events = draftLearning(
    [
      item("structure", { annotation: { kind: "card" } }, "pending"),
      item(
        "annotation-created",
        { annotation: { kind: "arrow", direction: "2:5:Clique no botão Play" } },
        "rejected",
      ),
      item("zoom", null, "pending"),
      item("palette", null, "pending"),
    ],
    true,
    3,
  );
  assert.deepEqual(events, [
    { kind: "card", accepted: true, at: 3 },
    { kind: "annotation", accepted: false, at: 3, direction: "Clique no botão Play" },
    { kind: "zoom", accepted: true, at: 3 },
  ]);
});
