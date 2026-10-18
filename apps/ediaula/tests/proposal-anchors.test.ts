import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canApply,
  fromWordKeys,
  locateItem,
  PROPOSAL_ITEM_LIMIT,
  type Proposal,
  type ProposalItem,
  toSource,
  toTimeline,
} from "../src/shared/anchors.ts";
import { applyCuts, type TimelineWord } from "../src/shared/cleanup.ts";
import { restoreSnapshot } from "../src/shared/history.ts";
import { projectSchema } from "../src/shared/project-schema.ts";
import type { Asset, Clip, Project } from "../src/shared/types.ts";

const recording: Asset = {
  id: "rec",
  name: "Tela",
  path: "C:/aulas/tela.mp4",
  kind: "video",
  duration: 60,
  width: 1920,
  height: 1080,
  fps: 30,
  hasVideo: true,
  hasAudio: true,
  size: 10,
  proxyStatus: "none",
  transcript: "C:/cache/tela.json",
  transcriptStatus: "ready",
};

const clip = (id: string, start: number, inPoint: number, duration: number): Clip => ({
  id,
  assetId: "rec",
  trackId: "v1",
  start,
  in: inPoint,
  duration,
  volume: 1,
});

const project = (clips: Clip[], id = "p"): Project => ({
  version: 1,
  id,
  name: "Aula",
  createdAt: 0,
  updatedAt: 0,
  settings: { width: 1920, height: 1080, fps: 30 },
  assets: [recording],
  tracks: [{ id: "v1", kind: "video", name: "V1", muted: false, hidden: false, locked: false }],
  clips,
});

const cut = (p: Project, ranges: [number, number][]): Project => ({
  ...p,
  clips: applyCuts(p.clips, ranges, new Set(["v1"])),
});

const item = (p: Project, range: [number, number], extra: Partial<ProposalItem> = {}) => ({
  id: "i1",
  start: range[0],
  end: range[1],
  reason: "teste",
  anchors: toSource(p, range),
  status: "pending" as const,
  ...extra,
});

test("a cut earlier in the lesson does not move the item off its words", () => {
  const before = project([clip("c1", 0, 0, 60)]);
  const it = item(before, [30, 32]);
  assert.equal(it.anchors.length, 1);
  assert.deepEqual([it.anchors[0].start, it.anchors[0].end], [30, 32]);
  const after = cut(before, [[5, 7]]);
  assert.deepEqual(toTimeline(after, it.anchors, it.start), [28, 30]);
  // A time-only item is placed again after any edit instead of vanishing.
  const later = cut(after, [[40, 41]]);
  assert.deepEqual(locateItem(later, it), [28, 30]);
});

test("with the take copied twice, the item's own clip wins over the other copy", () => {
  const p = project([clip("c1", 0, 0, 30), clip("c2", 30, 0, 30)]);
  const it = item(p, [40, 42]);
  assert.equal(it.anchors[0].clipId, "c2");
  assert.deepEqual(toTimeline(p, it.anchors, it.start), [40, 42]);
  // The copy holding the item was cut before it: the piece nearest to where it was is chosen.
  const after = cut(p, [[32, 34]]);
  assert.deepEqual(toTimeline(after, it.anchors, it.start), [38, 40]);
  // Without knowing where it was, two copies at different places leave the choice open.
  const unplaced = it.anchors.map(({ at: _at, until: _until, ...span }) => span);
  assert.equal(toTimeline(after, unplaced), null);
});

test("an item whose media was cut away is not placed anywhere", () => {
  const p = project([clip("c1", 0, 0, 60)]);
  const it = item(p, [30, 32]);
  assert.equal(toTimeline(cut(p, [[29, 33]]), it.anchors, it.start), null);
  assert.equal(locateItem(cut(p, [[29, 33]]), it), null);
});

/** Ranges compared to the millisecond. */
const ms = (range: [number, number] | null): number[] | null =>
  range?.map((t) => Math.round(t * 1000) / 1000) ?? null;

const words = (list: [string, string, number][]): TimelineWord[] =>
  list.map(([key, text, start]) => ({ key, clipId: "c1", text, start, end: start + 0.4, p: 1 }));

test("word keys find the words again, then the quoted text", () => {
  const p = project([clip("c1", 0, 0, 60)]);
  const spoken = words([
    ["rec:1", "clique", 10],
    ["rec:2", "aqui", 10.5],
    ["rec:3", "agora", 11],
  ]);
  assert.deepEqual(ms(fromWordKeys(spoken, ["rec:1", "rec:2"])), [9.94, 10.96]);
  assert.equal(fromWordKeys(spoken, ["rec:2", "rec:1"]), null, "words out of order");
  // Anchors no longer valid: keys, then text.
  const lost: ProposalItem = {
    id: "i",
    start: 10,
    end: 11,
    reason: "x",
    anchors: [{ clipId: "gone", assetId: "other", start: 0, end: 1 }],
    wordKeys: ["rec:1", "rec:2"],
    text: "clique aqui",
    status: "pending",
  };
  assert.deepEqual(ms(locateItem(p, lost, spoken)), [9.94, 10.96]);
  assert.deepEqual(ms(locateItem(p, { ...lost, wordKeys: ["rec:9"] }, spoken)), [9.94, 10.96]);
  assert.equal(locateItem(p, { ...lost, wordKeys: ["rec:9"], text: "outra" }, spoken), null);
  // The same key twice (a copied take): only the copy in the item's own clips counts.
  const twice = [
    ...spoken,
    ...words([["rec:1", "clique", 40]]).map((w) => ({ ...w, clipId: "c9" })),
  ].sort((a, b) => a.start - b.start);
  assert.equal(fromWordKeys(twice, ["rec:1"]), null);
  assert.deepEqual(ms(fromWordKeys(twice, ["rec:1"], new Set(["c9"]))), [39.94, 40.46]);
});

test("a proposal of another project is refused", () => {
  const p = project([clip("c1", 0, 0, 60)], "aula-1");
  const proposal: Proposal = {
    id: "prop",
    projectId: "aula-1",
    title: "Cortes",
    revision: 3,
    createdAt: 1,
    items: [item(p, [30, 32])],
  };
  assert.equal(canApply(proposal, p), true);
  assert.equal(canApply(proposal, { ...p, id: "aula-2" }), false);
  assert.equal(
    canApply({ ...proposal, items: [{ ...proposal.items[0], status: "rejected" }] }, p),
    false,
  );
  assert.equal(canApply(null, p), false);
});

test("pending proposals are saved with the project, survive undo and have a size limit", () => {
  const p = project([clip("c1", 0, 0, 60)]);
  const proposal: Proposal = {
    id: "prop",
    projectId: "p",
    title: "Cortes",
    revision: 1,
    createdAt: 1,
    items: [item(p, [30, 32], { text: "clique aqui", wordKeys: ["rec:1"] })],
  };
  const withProposal = { ...p, proposals: [proposal] };
  assert.deepEqual(projectSchema.parse(JSON.parse(JSON.stringify(withProposal))).proposals, [
    proposal,
  ]);
  const tooMany = {
    ...withProposal,
    proposals: [
      {
        ...proposal,
        items: Array.from({ length: PROPOSAL_ITEM_LIMIT + 1 }, (_, i) => ({
          ...proposal.items[0],
          id: `i${i}`,
        })),
      },
    ],
  };
  assert.equal(projectSchema.safeParse(tooMany).success, false);
  // Undoing an edit does not bring back an old proposal nor drop the pending one.
  const undone = restoreSnapshot(p, withProposal, 5);
  assert.deepEqual(undone.proposals, [proposal]);
  assert.equal(restoreSnapshot(withProposal, p, 5).proposals, undefined);
});
