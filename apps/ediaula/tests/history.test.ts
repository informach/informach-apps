import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type AiTurn,
  aiUndoCount,
  closeTurn,
  emptyHistory,
  type History,
  type HistoryEntry,
  pushCommit,
  redoSpan,
  redoSteps,
  relinkIn,
  restoreSnapshot,
  undoSpan,
  undoSteps,
  withRuntimeOf,
} from "../src/shared/history.ts";
import type { Asset, Project, VoiceMaster } from "../src/shared/types.ts";

const avatar: Asset = {
  id: "avatar",
  name: "Avatar",
  path: "C:/aulas/avatar.mp4",
  kind: "video",
  duration: 30,
  width: 1080,
  height: 1920,
  fps: 30,
  hasVideo: true,
  hasAudio: true,
  size: 10,
  proxyStatus: "none",
  transcriptStatus: "pending",
};
const project = (assets: Asset[], extra: Partial<Project> = {}): Project => ({
  version: 1,
  id: "p",
  name: "Aula",
  createdAt: 0,
  updatedAt: 1,
  settings: { width: 1920, height: 1080, fps: 30 },
  assets,
  tracks: [],
  clips: [],
  ...extra,
});

test("undo takes the background removal back but keeps what the app learned about the media", () => {
  // Before: no removal. Now: removal on, its transparent video rendered, a proxy and a transcript.
  const before = project([avatar], { stats: { editSeconds: 30 } });
  const now = project(
    [
      {
        ...avatar,
        key: { color: "#00B140", threshold: 0.4, softness: 0.1, despill: 0.5, choke: 0 },
        keyed: "C:/cache/avatar-keyed.webm",
        keyedId: "k1",
        keyStatus: "ready",
        proxy: "C:/cache/avatar-proxy.mp4",
        proxyStatus: "ready",
        transcript: "C:/cache/avatar.json",
        transcriptStatus: undefined,
      },
    ],
    { stats: { editSeconds: 90 }, exportedAt: 5, updatedAt: 7 },
  );
  const undone = restoreSnapshot(before, now, 100);
  const a = undone.assets[0];
  assert.equal(a.key, undefined, "the removal is undone");
  assert.equal(a.keyed, "C:/cache/avatar-keyed.webm");
  assert.equal(a.keyStatus, "ready");
  assert.equal(a.proxyStatus, "ready");
  assert.equal(a.transcript, "C:/cache/avatar.json");
  assert.ok(!("transcriptStatus" in a), "a field cleared since then stays cleared");
  assert.deepEqual(undone.stats, { editSeconds: 90 }, "editing time is not undone");
  assert.equal(undone.exportedAt, 5);
  assert.equal(undone.updatedAt, 100);
  // Redo the other way: the removal comes back with the same rendered video.
  const redone = restoreSnapshot(now, undone, 200);
  assert.deepEqual(redone.assets[0].key, now.assets[0].key);
  assert.equal(redone.assets[0].keyed, now.assets[0].keyed);
});

test("history snapshots are shared when nothing about the media changed", () => {
  const a = project([avatar]);
  assert.equal(withRuntimeOf(a, a), a);
  assert.equal(withRuntimeOf(a, project([{ ...avatar }])), a);
  const b = project([{ ...avatar, name: "Outro nome" }]);
  assert.equal(withRuntimeOf(a, b), a, "an edited field is not runtime data");
  const gone = restoreSnapshot(project([avatar], { stats: { editSeconds: 1 } }), project([]), 3);
  assert.equal(gone.assets[0], avatar, "media removed since then keep the snapshot's data");
  assert.ok(!("stats" in gone));
});

test("relinking a media replaces the old path everywhere it is still used", () => {
  const missing = { ...avatar, missing: true };
  const p = project([missing, { ...avatar, id: "other" }]);
  const out = relinkIn(p, missing, { path: "D:/novo/avatar.mp4", size: 11 });
  assert.equal(out.assets[0].path, "D:/novo/avatar.mp4");
  assert.equal(out.assets[0].size, 11);
  assert.ok(!("missing" in out.assets[0]));
  assert.equal(out.assets[1], p.assets[1]);
  const redrawn = project([{ ...avatar, path: "C:/cache/other.png" }]);
  assert.equal(relinkIn(redrawn, missing, { path: "x", size: 1 }), redrawn);
});

test("a picture drawn again for another format keeps its new size", () => {
  // A balloon of a 1920 × 1080 lesson, drawn again after Mudar formato made it vertical.
  const balloon: Asset = {
    ...avatar,
    id: "b",
    kind: "image",
    width: 600,
    height: 300,
    missing: true,
  };
  const out = relinkIn(project([balloon]), balloon, {
    path: "C:/cache/b2.png",
    size: 5,
    width: 338,
    height: 169,
  });
  assert.deepEqual([out.assets[0].width, out.assets[0].height], [338, 169]);
  const kept = relinkIn(project([balloon]), balloon, { path: "C:/cache/b3.png", size: 5 });
  assert.deepEqual([kept.assets[0].width, kept.assets[0].height], [600, 300]);
});

test("relinking a recording moves its cursor data too, in every snapshot that had it", () => {
  const recording: Asset = {
    ...avatar,
    id: "screen",
    path: "C:/Gravações/1/tela.mp4",
    cursor: "C:/Gravações/1/cursor.json",
    missing: true,
    cursorMissing: true,
  };
  const p = project([recording]);
  const moved = relinkIn(p, recording, {
    path: "D:/Aulas/1/tela.mp4",
    size: 12,
    cursor: "D:/Aulas/1/cursor.json",
  });
  const a = moved.assets[0];
  assert.deepEqual(
    [a.path, a.size, a.cursor],
    ["D:/Aulas/1/tela.mp4", 12, "D:/Aulas/1/cursor.json"],
  );
  assert.ok(!("missing" in a) && !("cursorMissing" in a));
  // Only the cursor data was lost: the video stays where it is.
  const onlyCursor = relinkIn(project([{ ...recording, missing: false }]), recording, {
    cursor: "E:/cursor.json",
  }).assets[0];
  assert.deepEqual([onlyCursor.path, onlyCursor.cursor], [recording.path, "E:/cursor.json"]);
  assert.ok(!("cursorMissing" in onlyCursor));
});

/* ----- Steps of the person and of the AI ----- */

/** Versions of a project told apart by name, as a store would make them commit after commit. */
const state = (n: number): Project => project([], { name: `v${n}`, updatedAt: n });
const user: HistoryEntry = { origin: "user" };
const ai = (call: string, turn?: string): HistoryEntry => ({
  origin: "ai",
  key: `ai:${call}`,
  conversation: "p",
  ...(turn ? { turn } : {}),
});

/** Commits `entries` one after another from v0; returns the history and the last version. */
function run(entries: HistoryEntry[]): { history: History; current: Project } {
  let history = emptyHistory();
  let current = state(0);
  entries.forEach((entry, i) => {
    history = pushCommit(history, current, entry, 150);
    current = state(i + 1);
  });
  return { history, current };
}

test("commits of one AI call make one step; a manual edit in between is a step of its own", () => {
  const { history } = run([ai("c1", "t"), ai("c1", "t"), user, ai("c1", "t")]);
  // c1, c1 → one step; the person's edit; c1 again after it does not join the first.
  assert.equal(history.past.length, 3);
  assert.deepEqual(
    history.pastMeta.map((m) => m.origin),
    ["ai", "user", "ai"],
  );
  assert.equal(undoSpan(history), 1, "Ctrl+Z stops at the person's edit");
});

test("one Ctrl+Z takes back the whole turn of the chat, and redo brings it back whole", () => {
  const { history, current } = run([user, ai("c1", "t"), ai("c2", "t"), ai("c3", "t")]);
  assert.equal(undoSpan(history), 3);
  const undone = undoSteps(history, current, undoSpan(history), 10);
  assert.ok(undone);
  assert.equal(undone.project.name, "v1", "back to before the turn");
  assert.equal(undone.history.past.length, 1);
  assert.equal(redoSpan(undone.history), 3);
  const redone = redoSteps(undone.history, undone.project, redoSpan(undone.history), 11);
  assert.ok(redone);
  assert.equal(redone.project.name, "v4");
  assert.deepEqual(redone.history.pastMeta, history.pastMeta);
});

test("the AI's undo takes back only its own steps, never the person's", () => {
  const mine = (e: HistoryEntry): boolean => e.conversation === "p";
  const { history, current } = run([user, ai("c1", "t"), ai("c2", "t")]);
  assert.equal(aiUndoCount(history, mine, 1), 1, "one tool call at a time");
  assert.equal(aiUndoCount(history, mine, 5), 2, "never past the person's edit");
  const undone = undoSteps(history, current, 1, 1);
  assert.equal(undone?.project.name, "v2");
  // The person edited after the AI: the AI's undo has nothing it may take back.
  const edited = run([ai("c1", "t"), user]).history;
  assert.equal(aiUndoCount(edited, mine, 3), 0);
  // Another app's steps are not this chat's.
  const other = run([{ origin: "ai", key: "ai:x", client: "g2" }]).history;
  assert.equal(aiUndoCount(other, mine, 1), 0);
});

test("a turn that never ended leaves nothing open", () => {
  // Commits of a new call after a turn that never got its done are steps of their own.
  const { history } = run([ai("c1", "t1"), user, ai("c2", "t2")]);
  assert.equal(history.past.length, 3);
  assert.equal(undoSpan(history), 1);
  const t1: AiTurn = { id: "t1", projectId: "p" };
  const t2: AiTurn = { id: "t2", projectId: "p" };
  assert.equal(closeTurn(t1, t1), null);
  assert.equal(closeTurn(null, t1), null, "ending twice does nothing");
  assert.equal(closeTurn(t2, t1), t2, "ending an old turn leaves the new one open");
});

test("undo does not unsend the exported voice files", () => {
  const sent: VoiceMaster = {
    id: "m1",
    hash: "h",
    createdAt: 5,
    scope: "lesson",
    pieces: [
      {
        file: "C:/aulas/Voz exportada/a.wav",
        label: "aula inteira",
        start: 0,
        end: 9,
        sourceMap: [],
      },
    ],
  };
  const before = project([avatar]);
  const now = project([avatar], { voiceMasters: [sent] });
  assert.deepEqual(restoreSnapshot(before, now, 10).voiceMasters, [sent]);
  // Redo onto a state without any: none appear from the snapshot.
  const none = restoreSnapshot(now, before, 11);
  assert.ok(!("voiceMasters" in none));
});
