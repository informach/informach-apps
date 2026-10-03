import { describe, expect, it } from "vitest";
import { clearLocalLearningDrafts, flushPendingLabs, registerPendingLab } from "./pending-work";
import { labDocumentSchema } from "./schemas";

describe("laboratory persistence boundaries", () => {
  it("keeps the entire UTF-8 document below the action request limit", () => {
    const base = {
      stage: "prediction",
      free: false,
      state: {},
      transferState: {},
      comparison: null,
      prediction: "",
      observation: "",
      explanation: "",
      answer: "",
      transferAnswer: "",
      rubric: [],
    };
    expect(labDocumentSchema.safeParse(base).success).toBe(true);
    const payload = { value: "á".repeat(13000) };
    expect(
      labDocumentSchema.safeParse({ ...base, state: payload, transferState: payload }).success,
    ).toBe(false);
  });
  it("blocks context changes when a mounted investigation cannot be saved", async () => {
    let saved = false;
    const unregister = registerPendingLab({
      dirty: () => true,
      flush: async () => saved,
      endSession: () => {},
    });
    try {
      expect(await flushPendingLabs()).toBe(false);
      saved = true;
      expect(await flushPendingLabs()).toBe(true);
    } finally {
      unregister();
    }
    expect(await flushPendingLabs()).toBe(true);
  });
  it("clears only learning drafts on logout, including acknowledged drafts", () => {
    const values = new Map([
      ["missao-lab:v2:profile:run:draft:writer", "draft"],
      ["missao-lab:v2:profile:run:handled:hash", "1"],
      ["missao-answer:profile:session:item", "answer"],
      ["theme", "dark"],
    ]);
    clearLocalLearningDrafts({
      get length() {
        return values.size;
      },
      key: (index) => [...values.keys()][index] ?? null,
      removeItem: (key) => {
        values.delete(key);
      },
    });
    expect([...values]).toEqual([["theme", "dark"]]);
  });
});
