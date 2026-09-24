import { describe, expect, it } from "vitest";
import {
  ensureStoredActionIds,
  restoreDiscardedActions,
  visibleDraftActions,
  withActionIds,
} from "./drafts";
import {
  draftExtractionSchema,
  noticeGenerationSchema,
  type StoredExtraction,
  storedExtractionSchema,
} from "./schemas";

const action = {
  type: "task" as const,
  title: "Fazer páginas 20 e 21",
  description: null,
  dueAt: null,
  dateOrigin: "unspecified" as const,
  time: null,
  location: null,
  sourceExcerpt: "Fazer páginas 20 e 21",
};
const legacy = { actions: [action, { ...action, title: "Levar tesoura" }], warnings: [] };

describe("stored drafts", () => {
  it("reads rows saved before actions had ids", () => {
    const parsed = storedExtractionSchema.parse(legacy);
    expect(parsed.actions.map((a) => a.id)).toEqual([undefined, undefined]);
    expect(draftExtractionSchema.parse(legacy).actions).toHaveLength(2);
  });
  it("assigns an id to every action once, and keeps existing ones", () => {
    const stored = withActionIds(legacy);
    expect(new Set(stored.actions.map((a) => a.id)).size).toBe(2);
    const again = ensureStoredActionIds(stored);
    expect(again.changed).toBe(false);
    expect(again.extraction).toBe(stored);
    const first = stored.actions[0];
    if (!first) throw new Error("fixture");
    const partial: StoredExtraction = { ...stored, actions: [first, { ...action, id: undefined }] };
    const filled = ensureStoredActionIds(partial);
    expect(filled.changed).toBe(true);
    expect(filled.extraction.actions[0]?.id).toBe(first.id);
    expect(filled.extraction.actions[1]?.id).toMatch(/[0-9a-f-]{36}/);
  });
  it("hides discarded actions from the review and strips the mark", () => {
    const stored = withActionIds(legacy);
    const [keep, drop] = stored.actions;
    if (!keep || !drop) throw new Error("fixture");
    const marked: StoredExtraction = {
      ...stored,
      actions: [keep, { ...drop, discardedAt: "2026-09-24T12:00:00.000Z" }],
    };
    const visible = visibleDraftActions(marked);
    expect(visible.actions).toHaveLength(1);
    expect(visible.actions[0]?.id).toBe(keep.id);
    expect("discardedAt" in (visible.actions[0] ?? {})).toBe(false);
  });
  it("restores every discarded action on replay, reporting whether anything changed", () => {
    const stored = withActionIds(legacy);
    expect(restoreDiscardedActions(stored).changed).toBe(false);
    const marked: StoredExtraction = {
      ...stored,
      actions: stored.actions.map((a) => ({ ...a, discardedAt: "2026-09-24T12:00:00.000Z" })),
    };
    const restored = restoreDiscardedActions(marked);
    expect(restored.changed).toBe(true);
    expect(restored.extraction.actions.every((a) => !("discardedAt" in a))).toBe(true);
    expect(restored.extraction.actions.map((a) => a.id)).toEqual(stored.actions.map((a) => a.id));
  });
  it("keeps ids and marks out of the structured generation schema", () => {
    const shape = noticeGenerationSchema.shape.actions.element.shape;
    expect("id" in shape).toBe(false);
    expect("discardedAt" in shape).toBe(false);
  });
});
