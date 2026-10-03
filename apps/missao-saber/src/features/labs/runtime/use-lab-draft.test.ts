import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { equationsTool } from "./algebra/equations";
import { clearLocalLearningDrafts } from "./pending-work";
import type { LabDocument } from "./schemas";
import { LabDraftStorage } from "./use-lab-draft";

// Browser persistence is tested independently of Next's server-action transport.
vi.mock("./actions", () => ({ saveLabAction: vi.fn() }));

class MemoryStorage {
  private values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}
function fixture() {
  const scope = {
    id: randomUUID(),
    profileId: randomUUID(),
    grade: 6,
    experience: {
      id: "equacoes-1~L08.traduzir-e-resolver",
      version: 1,
      family: equationsTool.family,
      mode: "traduzir-e-resolver",
    },
  };
  const launch = {
    family: equationsTool.family,
    mode: scope.experience.mode,
    grade: scope.grade,
    variant: 0 as const,
  };
  const document: LabDocument = {
    stage: "investigate",
    free: false,
    state: equationsTool.activity(launch).initialState,
    transferState: equationsTool.activity({ ...launch, variant: 1 }).initialState,
    comparison: null,
    prediction: "",
    observation: "",
    explanation: "",
    answer: "",
    transferAnswer: "",
    rubric: [],
  };
  const storage = new MemoryStorage();
  const writer = () => new LabDraftStorage(storage, scope, randomUUID());
  return { scope, document, storage, writer };
}

describe("independent laboratory draft writers", () => {
  it("logout prevents a pending acknowledgment or old editor from recreating local data", async () => {
    const { scope, writer, document, storage } = fixture();
    const source = writer();
    source.write(1, { ...document, answer: "4" });
    let active = true;
    const editor = new LabDraftStorage(storage, scope, randomUUID(), () => active);
    const [draft] = (await editor.discover(JSON.stringify(document), equationsTool)).drafts;
    if (!draft) throw new Error("Missing fixture");
    const pendingAcknowledgment = editor.acknowledge(draft);
    const pendingDiscovery = editor.discover(JSON.stringify(draft.document), equationsTool);
    active = false;
    clearLocalLearningDrafts(storage);
    await pendingAcknowledgment;
    expect(await pendingDiscovery).toEqual({ drafts: [], incompatible: 0 });
    editor.write(2, document);
    expect(storage.length).toBe(0);
  });
  it("saving or cleaning one tab never overwrites or deletes another tab's pending montage", async () => {
    const { writer, document, storage } = fixture();
    const first = writer(),
      second = writer(),
      cleanTab = writer();
    first.write(1, { ...document, answer: "rascunho da aba A" }, 10);
    const preserved = storage.getItem(first.ownKey);
    second.write(1, { ...document, answer: "rascunho da aba B" }, 20);
    cleanTab.clearOwn();
    second.clearOwn();
    expect(storage.getItem(first.ownKey)).toBe(preserved);
    expect(storage.getItem(second.ownKey)).toBeNull();
    expect(
      (await writer().discover(JSON.stringify(document), equationsTool)).drafts[0]?.document.answer,
    ).toBe("rascunho da aba A");
  });
  it("discovers all previous writers on reload and offers the latest first", async () => {
    const { writer, document } = fixture();
    const a = writer(),
      b = writer(),
      reload = writer();
    a.write(2, { ...document, prediction: "Primeira hipótese" }, 100);
    b.write(3, { ...document, prediction: "Outra hipótese" }, 200);
    const found = await reload.discover(JSON.stringify(document), equationsTool);
    expect(found.incompatible).toBe(0);
    expect(found.drafts.map((draft) => [draft.revision, draft.document.prediction])).toEqual([
      [3, "Outra hipótese"],
      [2, "Primeira hipótese"],
    ]);
    expect(
      await reload.revalidate(
        found.drafts[0] ??
          (() => {
            throw new Error("Missing fixture");
          })(),
        equationsTool,
      ),
    ).toEqual(found.drafts[0]);
  });
  it("acknowledges a snapshot without deleting the source or hiding a later edit by that tab", async () => {
    const { writer, document, storage } = fixture();
    const source = writer(),
      consumer = writer();
    source.write(1, { ...document, answer: "4" }, 1);
    const [draft] = (await consumer.discover(JSON.stringify(document), equationsTool)).drafts;
    if (!draft) throw new Error("Missing fixture");
    await consumer.acknowledge(draft);
    expect(storage.getItem(source.ownKey)).toBe(draft.raw);
    expect((await writer().discover(JSON.stringify(document), equationsTool)).drafts).toEqual([]);
    source.write(1, { ...document, answer: "8/2" }, 2);
    expect(
      (await writer().discover(JSON.stringify(document), equationsTool)).drafts[0]?.document.answer,
    ).toBe("8/2");
    await expect(consumer.revalidate(draft, equationsTool)).rejects.toThrow(/Outra aba/);
  });
  it("preserves a draft's original base revision when another writer adopts it", async () => {
    const { writer, document } = fixture();
    const source = writer();
    source.write(2, { ...document, answer: "4" }, 1);
    const [draft] = (await writer().discover(JSON.stringify(document), equationsTool)).drafts;
    if (!draft) throw new Error("Missing fixture");
    const restoredWriter = writer();
    restoredWriter.write(draft.revision, draft.document, 2);
    const all = await writer().discover(JSON.stringify(document), equationsTool);
    expect(all.drafts).toHaveLength(2);
    expect(all.drafts.every((value) => value.revision === 2)).toBe(true);
  });
  it("does not rediscover an acknowledged account snapshot after the account changes", async () => {
    const { writer, document, storage } = fixture();
    const source = writer();
    const saved = { ...document, answer: "4" };
    source.write(1, saved);
    expect((await writer().discover(JSON.stringify(saved), equationsTool)).drafts).toEqual([]);
    expect(
      (await writer().discover(JSON.stringify({ ...saved, answer: "5" }), equationsTool)).drafts,
    ).toEqual([]);
    expect(storage.getItem(source.ownKey)).not.toBeNull();
  });
});

describe("recovery validates mathematical state before rendering", () => {
  for (const field of ["state", "transferState", "comparison"] satisfies (keyof LabDocument)[]) {
    it(`preserves but refuses an invalid ${field}`, async () => {
      const { writer, document, storage } = fixture();
      const source = writer();
      source.write(1, { ...document, [field]: {} });
      const raw = storage.getItem(source.ownKey);
      const result = await writer().discover(JSON.stringify(document), equationsTool);
      expect(result.drafts).toEqual([]);
      expect(result.incompatible).toBe(1);
      expect(storage.getItem(source.ownKey)).toBe(raw);
    });
  }
  it("does not cross profiles, execution identities, versions or grades", async () => {
    const { scope, writer, document, storage } = fixture();
    const source = writer();
    source.write(1, { ...document, answer: "4" });
    const otherProfile = new LabDraftStorage(
      storage,
      { ...scope, profileId: randomUUID() },
      randomUUID(),
    );
    expect((await otherProfile.discover(JSON.stringify(document), equationsTool)).drafts).toEqual(
      [],
    );
    const otherExecution = new LabDraftStorage(
      storage,
      { ...scope, id: randomUUID() },
      randomUUID(),
    );
    expect((await otherExecution.discover(JSON.stringify(document), equationsTool)).drafts).toEqual(
      [],
    );
    const anotherVersion = new LabDraftStorage(
      storage,
      { ...scope, experience: { ...scope.experience, version: 2 } },
      randomUUID(),
    );
    expect(
      (await anotherVersion.discover(JSON.stringify(document), equationsTool)).incompatible,
    ).toBe(1);
    const anotherGrade = new LabDraftStorage(storage, { ...scope, grade: 5 }, randomUUID());
    expect(
      (await anotherGrade.discover(JSON.stringify(document), equationsTool)).incompatible,
    ).toBe(1);
  });
  it("reads the earlier single-key format only after real state validation and never deletes it", async () => {
    const { scope, writer, document, storage } = fixture();
    const editor = writer();
    storage.setItem(
      editor.legacyKey,
      JSON.stringify({ revision: 2, document: { ...document, answer: "4" } }),
    );
    const legacy = (await editor.discover(JSON.stringify(document), equationsTool)).drafts;
    expect(legacy).toHaveLength(1);
    expect(legacy[0]?.revision).toBe(2);
    editor.clearOwn();
    expect(storage.getItem(editor.legacyKey)).not.toBeNull();
    const upgraded = new LabDraftStorage(
      storage,
      { ...scope, experience: { ...scope.experience, version: 2 } },
      randomUUID(),
    );
    expect((await upgraded.discover(JSON.stringify(document), equationsTool)).incompatible).toBe(1);
    storage.setItem(
      editor.legacyKey,
      JSON.stringify({ revision: 2, document: { ...document, transferState: {} } }),
    );
    expect((await editor.discover(JSON.stringify(document), equationsTool)).drafts).toEqual([]);
  });
  it("reports malformed JSON without erasing the stored value", async () => {
    const { writer, storage, document } = fixture();
    const source = writer();
    storage.setItem(source.ownKey, "not-json");
    expect((await writer().discover(JSON.stringify(document), equationsTool)).incompatible).toBe(1);
    expect(storage.getItem(source.ownKey)).toBe("not-json");
  });
});
