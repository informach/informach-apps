import assert from "node:assert/strict";
import { test } from "node:test";
import type Anthropic from "@anthropic-ai/sdk";
import {
  type ApprovalAnswer,
  type CallMeta,
  type GuardDeps,
  guarded,
  PANEL_CLIENT,
} from "../src/main/mcpGuard.ts";
import { runToolRound, STOPPED } from "../src/main/toolRound.ts";
import { buildRequest, CLEAR_TOOL_USES } from "../src/shared/aiModels.ts";
import { parseStoredSettings, settingsChangesSchema } from "../src/shared/aiSettings.ts";
import { clipTargets } from "../src/shared/aiTargets.ts";
import { AI_TOOLS } from "../src/shared/aiTools.ts";
import { assFontName, CAPTION_FONT } from "../src/shared/captions.ts";
import {
  type CaptionTranslation,
  type SourceCue,
  translateCues,
} from "../src/shared/captionTranslate.ts";
import { applyCuts } from "../src/shared/cleanup.ts";
import { chaptersOf, hasChapterMarkers } from "../src/shared/markers.ts";
import { preflight } from "../src/shared/preflight.ts";
import { settle } from "../src/shared/settle.ts";
import type { Asset, Clip, Project, Track } from "../src/shared/types.ts";

/* ----- C1: old pictures are cleared on the server, the history is never edited ----- */

test("old tool results are cleared on the server, before compaction, with its beta", () => {
  for (const model of ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"]) {
    const r = buildRequest(model, "high");
    assert.deepEqual(r.context_management?.edits, [CLEAR_TOOL_USES, { type: "compact_20260112" }]);
    assert.ok(r.betas.includes("context-management-2025-06-27"));
    assert.ok(r.betas.includes("compact-2026-01-12"));
  }
  assert.equal(CLEAR_TOOL_USES.type, "clear_tool_uses_20250919");
  assert.equal(buildRequest("claude-futuro", "high").context_management, undefined);
});

/* ----- C2: after Parar, the calls still to come never run ----- */

const use = (id: string, name: string, input: unknown): Anthropic.Beta.BetaToolUseBlock => ({
  type: "tool_use",
  id,
  name,
  input,
});

test("a tool round stops at Parar: the calls left answer as stopped and never run", async () => {
  const abort = new AbortController();
  const ran: string[] = [];
  const queued: (() => boolean)[] = [];
  const results = await runToolRound(
    [
      use("t1", "seek", { time: 1 }),
      use("t2", "seek", { time: 2 }),
      use("t3", "seek", { time: 3 }),
    ],
    {
      signal: abort.signal,
      emit: () => {},
      call: async (name, input, allowed) => {
        ran.push(`${name}:${JSON.stringify(input)}`);
        queued.push(allowed);
        // The person presses Parar while the first call runs.
        abort.abort();
        return { ok: true, text: "feito" };
      },
    },
  );
  assert.deepEqual(ran, ['seek:{"time":1}']);
  assert.deepEqual(
    results.map((r) => [r.tool_use_id, r.is_error, r.content]),
    [
      ["t1", false, "feito"],
      ["t2", true, STOPPED],
      ["t3", true, STOPPED],
    ],
  );
  // A call still in the editor's queue asks again and is refused there.
  assert.equal(queued[0](), false);
});

/* ----- C10 and the MCP calls after Parar ----- */

function deps(answers: ApprovalAnswer[], live = () => true) {
  const asked: string[] = [];
  const calls: { name: string; meta: CallMeta; allowed: () => boolean }[] = [];
  const d: GuardDeps = {
    approve: async (q) => {
      asked.push(q.tool);
      return answers.shift() ?? { choice: "deny", projectId: null };
    },
    call: async (name, _args, meta, allowed) => {
      calls.push({ name, meta, allowed });
      return { ok: true, text: "feito" };
    },
    live: () => live(),
  };
  return { d, asked, calls };
}

test("importing media asks every time, also in the restricted window, never in the chat's own runs", async () => {
  const restricted = {
    id: "r1",
    client: "claude-restrito",
    scopes: ["read", "propose", "write"] as const,
  };
  const { d, asked, calls } = deps([
    { choice: "deny", projectId: "p1" },
    { choice: "once", projectId: "p1" },
  ]);
  const args = { paths: ["C:\\aulas\\x.mp4"] };
  assert.equal(
    (await guarded({ ...restricted, scopes: [...restricted.scopes] }, "import_media", args, d)).ok,
    false,
  );
  assert.equal(
    (await guarded({ ...restricted, scopes: [...restricted.scopes] }, "import_media", args, d)).ok,
    true,
  );
  assert.deepEqual(asked, ["import_media", "import_media"]);
  assert.equal(calls[0].meta.projectId, "p1");
  // Other writes of the restricted window run without asking (it has the write scope).
  assert.equal(
    (await guarded({ ...restricted, scopes: [...restricted.scopes] }, "seek", { time: 1 }, d)).ok,
    true,
  );
  assert.equal(asked.length, 2);
  const panel = {
    id: "p",
    client: PANEL_CLIENT,
    scopes: ["read", "propose", "write"] as ("read" | "propose" | "write")[],
    projectId: "p1",
  };
  assert.equal((await guarded(panel, "import_media", args, d)).ok, true);
  assert.equal(asked.length, 2, "the chat inside EdiAula does not ask");
});

test("a call whose grant ended is refused, before and after the question", async () => {
  let alive = true;
  const grant = {
    id: "g",
    client: "claude-code",
    scopes: ["read", "propose"] as ("read" | "propose" | "write")[],
  };
  const { d, calls } = deps([], () => alive);
  alive = false;
  const r = await guarded(grant, "get_overview", {}, d);
  assert.equal(r.ok, false);
  assert.match(r.text, /Este acesso terminou/);
  assert.equal(calls.length, 0);
  // Stopped while the person was still answering the question: nothing runs.
  alive = true;
  const late: GuardDeps = {
    ...d,
    approve: async () => {
      alive = false;
      return { choice: "once", projectId: "p1" };
    },
  };
  assert.equal((await guarded(grant, "cut_ranges", { ranges: [], revision: 1 }, late)).ok, false);
  assert.equal(calls.length, 0);
  // The check goes with the call, for the editor's queue.
  alive = true;
  await guarded(grant, "get_overview", {}, d);
  assert.equal(calls[0].allowed(), true);
  alive = false;
  assert.equal(calls[0].allowed(), false);
});

/* ----- C13: the settings file and the settings changes ----- */

test("the settings file is read field by field and the changes are checked", () => {
  const { settings, dropped } = parseStoredSettings({
    model: "claude-opus-5-5",
    engine: "codex",
    effort: "turbo",
    claudeModel: "opus; rm -rf",
    mcpPort: 80,
    mcpEnabled: true,
    future: { kept: 1 },
  });
  assert.deepEqual(dropped.sort(), ["claudeModel", "effort", "mcpPort"]);
  assert.equal(settings.engine, "codex");
  assert.equal(settings.mcpEnabled, true);
  assert.equal(settings.model, "claude-opus-5-5");
  assert.deepEqual(Reflect.get(settings, "future"), { kept: 1 }, "a newer field survives");
  assert.deepEqual(parseStoredSettings(null), { settings: {}, dropped: [] });

  assert.ok(settingsChangesSchema.safeParse({ claudeModel: "sonnet", effort: "low" }).success);
  assert.ok(!settingsChangesSchema.safeParse({ claudeModel: "--dangerously-skip" }).success);
  assert.ok(!settingsChangesSchema.safeParse({ model: "claude-qualquer" }).success);
  assert.ok(!settingsChangesSchema.safeParse({ mcpPort: 1 }).success, "unknown keys are refused");
  assert.ok(!settingsChangesSchema.safeParse({ engine: "shell" }).success);
  assert.equal(settingsChangesSchema.parse({ apiKey: "  sk-ant-x  " }).apiKey, "sk-ant-x");
  assert.equal(settingsChangesSchema.parse({ apiKey: null }).apiKey, null);
});

/* ----- C6, C7: groups and locked tracks ----- */

const asset = (id: string, kind: Asset["kind"], duration = 120): Asset => ({
  id,
  name: id,
  path: `C:/aulas/${id}`,
  kind,
  duration: kind === "image" ? 0 : duration,
  width: kind === "audio" ? 0 : 1920,
  height: kind === "audio" ? 0 : 1080,
  fps: kind === "video" ? 30 : 0,
  hasVideo: kind !== "audio",
  hasAudio: kind !== "image",
  size: 1,
  proxyStatus: "none",
});
const track = (id: string, kind: Track["kind"], extra: Partial<Track> = {}): Track => ({
  id,
  kind,
  name: id,
  muted: false,
  hidden: false,
  locked: false,
  ...extra,
});

function lesson(): Project {
  const clips: Clip[] = [
    { id: "s", assetId: "screen", trackId: "v", start: 0, in: 0, duration: 100, volume: 1 },
    { id: "m", assetId: "mic", trackId: "a", start: 0, in: 0, duration: 100, volume: 1 },
  ];
  return {
    version: 1,
    id: "p",
    name: "Aula",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 1920, height: 1080, fps: 30 },
    assets: [asset("screen", "video"), asset("mic", "audio")],
    tracks: [track("v", "video"), track("a", "audio")],
    clips,
  };
}

test("clip targets take the group along, leave locked tracks out and check every id", () => {
  const p = lesson();
  p.clips = p.clips.map((c) => ({ ...c, groupId: "g1" }));
  assert.deepEqual(clipTargets(p, ["s"]), { ids: ["s", "m"], missing: [], locked: [] });
  assert.deepEqual(clipTargets(p, ["s"], { groups: false }).ids, ["s"]);
  p.tracks = [track("v", "video"), track("a", "audio", { locked: true })];
  assert.deepEqual(clipTargets(p, ["s"]), { ids: ["s"], missing: [], locked: ["m"] });
  assert.deepEqual(clipTargets(p, ["s", "x"]).missing, ["x"]);
});

/* ----- C4, C5: one list of chapters, and they follow the cuts ----- */

test("saved chapters and the thumbnail follow a cut like markers", () => {
  const p: Project = {
    ...lesson(),
    publish: {
      title: "Aula",
      chapters: [
        { time: 0, title: "Abertura" },
        { time: 40, title: "Blocos" },
        { time: 70, title: "Desafio" },
      ],
      thumbnail: { time: 50 },
    },
  };
  const cut = settle(p, { ...p, clips: applyCuts(p.clips, [[10, 30]], new Set(["v", "a"])) });
  assert.deepEqual(
    cut.publish?.chapters?.map((c) => c.time),
    [0, 20, 50],
  );
  assert.equal(cut.publish?.thumbnail?.time, 30);
  assert.equal(cut.publish?.title, "Aula");
  // A change that sets the publishing data itself keeps it.
  const own = settle(p, {
    ...p,
    clips: applyCuts(p.clips, [[10, 30]], new Set(["v", "a"])),
    publish: { thumbnail: { time: 5 } },
  });
  assert.equal(own.publish?.thumbnail?.time, 5);
});

test("the check before export reads the chapters the MP4 has: the markers first", () => {
  const p: Project = {
    ...lesson(),
    markers: [
      { id: "m1", t: 0, label: "Abertura", chapter: true },
      { id: "m2", t: 40, label: "Blocos", chapter: true },
    ],
    // Valid on their own, but the markers win: those are the ones checked.
    publish: {
      chapters: [
        { time: 0, title: "A" },
        { time: 20, title: "B" },
        { time: 50, title: "C" },
      ],
    },
  };
  assert.ok(hasChapterMarkers(p));
  assert.deepEqual(
    chaptersOf(p).map((c) => c.title),
    ["Abertura", "Blocos"],
  );
  const finding = preflight(p, {}).find((f) => f.kind === "chapters");
  assert.ok(finding, "two chapter markers are fewer than YouTube's three");
  assert.match(finding.message, /marcadores-capítulo/);
  assert.equal(finding.fix, undefined, "the fix would only rewrite publish.chapters");
  const saved = { ...p, markers: [] };
  assert.equal(
    preflight(saved, {}).find((f) => f.kind === "chapters"),
    undefined,
  );
});

/* ----- C11: only the captions out of date go to the engine, batches are kept ----- */

const cues = (n: number, prefix = "Legenda"): SourceCue[] =>
  Array.from({ length: n }, (_, i) => ({
    key: `voz:${i * 3}`,
    start: i * 2,
    end: i * 2 + 1.5,
    text: `${prefix} ${i}`,
  }));

function engine(fail?: (call: number) => boolean) {
  const sent: number[] = [];
  const run = async (prompt: string): Promise<string> => {
    const body = JSON.parse(prompt.slice(prompt.lastIndexOf('{"cues"')).split("\n")[0]) as {
      cues: { i: number; text: string }[];
    };
    sent.push(body.cues.length);
    if (fail?.(sent.length)) return "sem json";
    return JSON.stringify({ cues: body.cues.map((c) => ({ i: c.i, text: `EN ${c.text}` })) });
  };
  return { run, sent };
}

test("translating again sends only the captions that changed", async () => {
  const now = cues(10);
  const known: CaptionTranslation = {
    lang: "en",
    createdAt: 0,
    cues: now.map((c) => ({ key: c.key, source: c.text, text: `EN ${c.text}` })),
  };
  // Two captions were edited after the translation.
  now[3] = { ...now[3], text: "Legenda mudada" };
  now[7] = { ...now[7], text: "Outra mudada" };
  const fake = engine();
  const out = await translateCues(now, "en", fake.run, { known });
  assert.deepEqual(fake.sent, [2]);
  assert.equal(out.length, 10);
  assert.equal(out[3].text, "EN Legenda mudada");
  assert.equal(out[0].text, "EN Legenda 0");
  // Nothing out of date: the engine is not called.
  const none = engine();
  assert.equal(
    (await translateCues(now, "en", none.run, { known: { ...known, cues: out } })).length,
    10,
  );
  assert.deepEqual(none.sent, []);
});

test("a batch that fails keeps the batches done before it", async () => {
  const fake = engine((call) => call > 1);
  const kept: number[] = [];
  await assert.rejects(
    translateCues(cues(200), "es", fake.run, { onTranslated: (list) => kept.push(list.length) }),
    /lote 2 de 2/,
  );
  assert.deepEqual(kept, [150]);
});

/* ----- C12: the caption font cannot break the .ass file ----- */

test("the caption font cannot add lines or tags to the subtitles file", () => {
  assert.equal(assFontName("Arial\n[Events]\nDialogue: 0"), "Arial [Events] Dialogue: 0");
  assert.equal(assFontName("Fonte{\\fs99},X"), "Fonte fs99 X");
  assert.equal(assFontName("  "), CAPTION_FONT);
  assert.equal(assFontName(undefined), CAPTION_FONT);
  const font = AI_TOOLS.set_captions.input.shape.font;
  assert.ok(font.safeParse("Nunito").success);
  assert.ok(!font.safeParse("Arial\nDialogue").success);
  assert.ok(!font.safeParse("A,B").success);
  assert.ok(!font.safeParse("A{B}").success);
});
