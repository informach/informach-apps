import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildItems,
  canApply,
  fromWordKeys,
  locateItem,
  MAX_ANCHORS,
  PROPOSAL_ITEM_LIMIT,
  type Proposal,
  type ProposalItem,
  toSource,
  toTimeline,
  withProposal,
} from "../src/shared/anchors.ts";
import { applyCuts, type TimelineWord } from "../src/shared/cleanup.ts";
import { restoreSnapshot } from "../src/shared/history.ts";
import { projectSchema, proposalListSchema } from "../src/shared/project-schema.ts";
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

test("word keys find the words again, only in the item's own media", () => {
  const p = project([clip("c1", 0, 0, 60)]);
  const spoken = words([
    ["rec:1", "clique", 10],
    ["rec:2", "aqui", 10.5],
    ["rec:3", "agora", 11],
  ]);
  assert.deepEqual(ms(fromWordKeys(spoken, ["rec:1", "rec:2"])), [9.94, 10.96]);
  assert.equal(fromWordKeys(spoken, ["rec:2", "rec:1"]), null, "words out of order");
  assert.equal(
    fromWordKeys(spoken, ["rec:1", "rec:2"], new Set(), new Set(["outra"])),
    null,
    "keys of another media",
  );
  // Anchors no longer valid (the stretch is outside every clip): keys.
  const lost: ProposalItem = {
    id: "i",
    start: 10,
    end: 11,
    reason: "x",
    anchors: [{ clipId: "gone", assetId: "rec", start: 100, end: 101 }],
    wordKeys: ["rec:1", "rec:2"],
    text: "clique aqui",
    status: "pending",
  };
  assert.deepEqual(ms(locateItem(p, lost, spoken)), [9.94, 10.96]);
  // Keys gone too: the text only counts near where the anchors were, so here it is not found.
  assert.equal(locateItem(p, { ...lost, wordKeys: ["rec:9"] }, spoken), null);
  // The same key twice (a copied take): only the copy in the item's own clips counts.
  const twice = [
    ...spoken,
    ...words([["rec:1", "clique", 40]]).map((w) => ({ ...w, clipId: "c9" })),
  ].sort((a, b) => a.start - b.start);
  assert.equal(fromWordKeys(twice, ["rec:1"]), null);
  assert.deepEqual(ms(fromWordKeys(twice, ["rec:1"], new Set(["c9"]))), [39.94, 40.46]);
});

test("the quoted text is found again only where it was, never in the other take", () => {
  // Take 1 at source 10 s, take 2 (the same words, said again) at source 30 s.
  const item: ProposalItem = {
    id: "i",
    start: 9.94,
    end: 11.46,
    reason: "repetição",
    anchors: [
      {
        clipId: "c1",
        assetId: "rec",
        trackId: "v1",
        start: 9.94,
        end: 11.46,
        at: 9.94,
        until: 11.46,
      },
    ],
    wordKeys: ["rec:1", "rec:2", "rec:3"],
    text: "clique aqui agora",
    status: "pending",
  };
  const take = (clipId: string, at: number, first: number): TimelineWord[] =>
    words([
      [`rec:${first}`, "clique", at],
      [`rec:${first + 1}`, "aqui", at + 0.5],
      [`rec:${first + 2}`, "agora", at + 1],
    ]).map((w) => ({ ...w, clipId }));
  // Take 1 trimmed a little: its head now starts at 10.0 s, the words are all still there
  // (with new keys, after the transcript was redone): found by the text, near the anchors.
  const trimmed = project([clip("c1", 0, 10, 20), clip("c2", 20, 30, 10)]);
  const redone = [...take("c1", 0, 101), ...take("c2", 20, 201)];
  assert.ok(locateItem(trimmed, item, redone));
  // Take 1 trimmed past its first word: the text only exists whole in take 2, which is another
  // passage. The item is left out instead of cutting take 2.
  const cutHead = project([clip("c1", 0, 10.3, 20), clip("c2", 20, 30, 10)]);
  const after = [
    ...take("c1", 0, 101)
      .slice(1)
      .map((w) => ({ ...w, start: w.start - 0.3, end: w.end - 0.3 })),
    ...take("c2", 20, 201),
  ];
  assert.equal(locateItem(cutHead, item, after), null);
});

test("a stretch over hundreds of clips becomes several items that always fit in the save", () => {
  // 300 pieces of the recording side by side on the timeline, each from a different moment.
  const many = project(Array.from({ length: 300 }, (_, i) => clip(`k${i}`, i * 0.1, i * 0.2, 0.1)));
  const items = buildItems(
    many,
    [0, 30],
    undefined,
    { reason: "longo" },
    (() => {
      let n = 0;
      return () => `it${n++}`;
    })(),
  );
  assert.equal(items.length, 2);
  assert.ok(items.every((i) => i.anchors.length <= MAX_ANCHORS));
  assert.deepEqual(
    items.map((i) => i.anchors.length),
    [MAX_ANCHORS, 300 - MAX_ANCHORS],
  );
  const proposal: Proposal = {
    id: "p",
    projectId: "p",
    title: "t",
    revision: 1,
    createdAt: 1,
    items,
  };
  assert.ok(proposalListSchema.safeParse([proposal]).success);
  for (const i of items) assert.ok(locateItem(many, i), "each piece is placed again");
  // A clip split with nothing removed is one stretch, placed across both pieces.
  const split = project([clip("a", 0, 0, 5), clip("b", 5, 5, 5)]);
  const one = buildItems(split, [3, 7], undefined, { reason: "x" }, () => "one")[0];
  assert.equal(one.anchors.length, 1);
  assert.deepEqual(locateItem(split, one), [3, 7]);
});

test("a proposal replaces only an earlier one of the same author", () => {
  const p = project([clip("c1", 0, 0, 60)]);
  const make = (id: string, by: string): Proposal => ({
    id,
    projectId: "p",
    title: id,
    revision: 1,
    createdAt: 1,
    by,
    items: [item(p, [1, 2])],
  });
  let list = withProposal([], make("chat-1", "assistente"));
  list = withProposal(list, make("app-1", "cliente:g1"));
  list = withProposal(list, make("chat-2", "assistente"));
  assert.deepEqual(
    list.map((x) => x.id),
    ["app-1", "chat-2"],
    "the app connected from outside does not wipe the chat's proposal, nor the other way round",
  );
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
