import assert from "node:assert/strict";
import { test } from "node:test";
import {
  authorStep,
  decide,
  isPrepareAuthor,
  liveVoices,
  markDone,
  nextStep,
  PREPARE_LABEL,
  PREPARE_STEPS,
  prepareAuthor,
  prepareFinished,
  presenterInLesson,
  reopen,
  resolveReview,
  resumeStep,
  skipReason,
  startPrepare,
  voiceAlreadyCleaned,
  voiceLinkedMedia,
} from "../src/shared/prepare.ts";
import { normalizeProject } from "../src/shared/project-normalize.ts";
import { projectSchema } from "../src/shared/project-schema.ts";
import type { Asset, Clip, Project, Track } from "../src/shared/types.ts";

const project = (extra: Partial<Project> = {}): Project => ({
  version: 1,
  id: "p",
  name: "Aula",
  createdAt: 0,
  updatedAt: 0,
  settings: { width: 1920, height: 1080, fps: 30 },
  assets: [],
  tracks: [],
  clips: [],
  ...extra,
});

test("the steps run in a fixed order: cuts before inserts, overlays after, the check last", () => {
  assert.deepEqual(PREPARE_STEPS, [
    "recording",
    "transcribe",
    "section",
    "cuts",
    "inserts",
    "template",
    "zoom",
    "annotations",
    "captions",
    "cards",
    "check",
  ]);
  const at = (s: (typeof PREPARE_STEPS)[number]): number => PREPARE_STEPS.indexOf(s);
  assert.ok(at("cuts") < at("inserts"));
  for (const overlay of ["zoom", "annotations", "captions", "cards"] as const)
    assert.ok(at(overlay) > at("cuts") && at(overlay) > at("inserts"));
  for (const s of PREPARE_STEPS) assert.ok(!/—|\(s\)/.test(PREPARE_LABEL[s]));
});

test("only the waiting step can be decided, and each decision moves on to the next", () => {
  let state = startPrepare();
  assert.equal(resumeStep(state), "recording");
  // Deciding a later step out of turn changes nothing.
  assert.equal(decide(state, "zoom", "done"), state);
  state = decide(state, "recording", "skipped");
  state = decide(state, "transcribe", "done");
  assert.equal(state.step, "section");
  state = decide(state, "section", "skipped", "A aula não tem roteiro colado.");
  assert.equal(state.step, "cuts");
  assert.equal(state.notes?.section, "A aula não tem roteiro colado.");
  for (const s of PREPARE_STEPS.slice(3)) state = decide(state, s, "done");
  assert.ok(prepareFinished(state));
  assert.equal(nextStep(state), null);
  assert.equal(resumeStep(state), null);
});

test('a lesson saved with mutedFor "heygen" opens with "presenter"', () => {
  const stored = JSON.parse(
    JSON.stringify(project({ clips: [clip("c", "voz", "a1", { mutedFor: "presenter" })] })),
  );
  stored.clips[0].mutedFor = "heygen";
  const opened = normalizeProject(projectSchema.parse(stored));
  assert.equal(opened.clips[0].mutedFor, "presenter");
  assert.ok(voiceAlreadyCleaned(opened));
});

test("the state is kept in the project and the pipeline goes on where it stopped", () => {
  let state = startPrepare();
  state = decide(state, "recording", "skipped");
  state = decide(state, "transcribe", "done");
  state = decide(state, "section", "done");
  state = decide(state, "cuts", "skipped", "voz já limpa");
  const saved = projectSchema.parse(JSON.parse(JSON.stringify(project({ prepare: state }))));
  assert.deepEqual(saved.prepare, state);
  assert.equal(resumeStep(saved.prepare), "inserts");
  // A saved step that is not the first open one (an older file) resumes at the first open one.
  assert.equal(
    resumeStep({ step: "zoom", decisions: { recording: "skipped", transcribe: "done" } }),
    "section",
  );
  assert.ok(
    !projectSchema.safeParse(project({ prepare: { step: "nada" as "zoom", decisions: {} } }))
      .success,
  );
});

test("opening a step again clears it and every step after it", () => {
  let state = startPrepare();
  for (const s of PREPARE_STEPS.slice(0, 7)) state = decide(state, s, "done", `nota ${s}`);
  const again = reopen(state, "inserts");
  assert.equal(again.step, "inserts");
  assert.deepEqual(Object.keys(again.decisions), ["recording", "transcribe", "section", "cuts"]);
  assert.deepEqual(Object.keys(again.notes ?? {}), ["recording", "transcribe", "section", "cuts"]);
  assert.equal(resumeStep(again), "inserts");
});

const media = (id: string, extra: Partial<Asset> = {}): Asset => ({
  id,
  name: id,
  path: `C:/aulas/${id}`,
  kind: "audio",
  duration: 60,
  width: 0,
  height: 0,
  fps: 0,
  hasVideo: false,
  hasAudio: true,
  size: 1,
  proxyStatus: "none",
  ...extra,
});
const track = (id: string, extra: Partial<Track> = {}): Track => ({
  id,
  kind: "audio",
  name: id,
  muted: false,
  hidden: false,
  locked: false,
  ...extra,
});
const clip = (id: string, assetId: string, trackId: string, extra: Partial<Clip> = {}): Clip => ({
  id,
  assetId,
  trackId,
  start: 0,
  in: 0,
  duration: 30,
  volume: 1,
  ...extra,
});

const presenter = media("apresentador", {
  kind: "video",
  hasVideo: true,
  width: 1280,
  height: 720,
  fps: 25,
  origin: "presenter",
});
const voice = media("voz");
const sent = {
  id: "m",
  hash: "h",
  createdAt: 1,
  scope: "lesson" as const,
  pieces: [
    {
      file: "C:/voz.wav",
      label: "Aula",
      start: 0,
      end: 30,
      sourceMap: [{ at: 0, duration: 30, start: 0, assetId: "voz", in: 0 }],
    },
  ],
};
/** The voice flow: the voice sent to make the presenter's video, the video placed by it. */
const voiceFlow = (extra: Partial<Project> = {}): Project =>
  project({
    voiceMasters: [sent],
    assets: [voice, presenter],
    tracks: [track("v2", { kind: "video" }), track("a1")],
    clips: [clip("pv", "apresentador", "v2", { volume: 0 }), clip("vz", "voz", "a1")],
    ...extra,
  });

test("the cuts are skipped when the voice was cleaned before making the presenter's video", () => {
  const plain = project();
  assert.ok(!voiceAlreadyCleaned(plain));
  assert.equal(skipReason(plain, "cuts"), null);
  const flow = voiceFlow();
  assert.ok(voiceAlreadyCleaned(flow));
  assert.deepEqual([...voiceLinkedMedia(flow)].sort(), ["apresentador", "voz"]);
  assert.match(
    skipReason(flow, "cuts") ?? "",
    /foi exportada e limpa antes de gerar o vídeo do apresentador, e o vídeo foi encaixado por ela/,
  );
  // Sent but not back yet: the voice stays as it was sent.
  const waiting = voiceFlow({ clips: [clip("vz", "voz", "a1")] });
  assert.match(skipReason(waiting, "cuts") ?? "", /seção Voz do painel Áudio/);
  // A voice sent whose media is no longer in the lesson says nothing.
  assert.ok(!voiceAlreadyCleaned(voiceFlow({ clips: [] })));
  // The older marker of the presenter's own sound, and a voice recorded alone, say the same.
  assert.ok(
    voiceAlreadyCleaned(project({ clips: [clip("c", "voz", "a1", { mutedFor: "presenter" })] })),
  );
  const alone = media("so-voz", { voiceTakes: [] });
  assert.ok(voiceAlreadyCleaned(project({ assets: [alone], clips: [clip("c", "so-voz", "a1")] })));
  for (const reason of [skipReason(flow, "cuts"), skipReason(waiting, "cuts")]) {
    assert.ok(!/HeyGen|—|Revisar cortes/i.test(reason ?? ""), reason ?? "");
  }
  assert.match(skipReason(plain, "section") ?? "", /roteiro/);
  assert.match(skipReason(plain, "zoom") ?? "", /cliques/);
  assert.equal(skipReason(project({ script: { text: "# Roteiro" } }), "inserts"), null);
});

test("a lesson with the presenter's video and a live microphone still has its cuts", () => {
  // A screen recorded live with its microphone, and the presenter's video placed by a voice.
  const flow = voiceFlow();
  const mixed: Project = {
    ...flow,
    assets: [
      ...flow.assets,
      media("tela", {
        kind: "video",
        hasVideo: true,
        width: 1920,
        height: 1080,
        fps: 30,
        cursor: "C:/cursor.json",
        recording: { id: "t", role: "screen" },
      }),
      media("mic", { recording: { id: "t", role: "mic" } }),
      media("pc", { recording: { id: "t", role: "system" } }),
    ],
    tracks: [...flow.tracks, track("v1", { kind: "video" }), track("a2"), track("a3")],
    clips: [
      ...flow.clips,
      clip("s", "tela", "v1", { start: 30 }),
      clip("m", "mic", "a2", { start: 30 }),
      clip("p", "pc", "a3", { start: 30 }),
    ],
  };
  // The microphone is a voice heard live; the screen's own sound and the computer's are not.
  assert.deepEqual([...liveVoices(mixed)], ["mic"]);
  assert.equal(skipReason(mixed, "cuts"), null);
  // Muted, or on a music track, it is not heard.
  const muted = {
    ...mixed,
    tracks: mixed.tracks.map((t) => (t.id === "a2" ? { ...t, muted: true } : t)),
  };
  assert.deepEqual([...liveVoices(muted)], []);
  assert.match(skipReason(muted, "cuts") ?? "", /foi exportada e limpa/);
});

test("what a step made is resolved for that step only, also after a Refazer", () => {
  assert.equal(prepareAuthor("zoom"), "preparar:zoom");
  assert.equal(authorStep("preparar:zoom"), "zoom");
  assert.equal(authorStep("preparar"), null);
  assert.ok(isPrepareAuthor("preparar") && isPrepareAuthor("preparar:cards"));
  assert.ok(!isPrepareAuthor("modelo") && !isPrepareAuthor("prepararx"));
  let state = startPrepare();
  for (const s of PREPARE_STEPS.slice(0, 7)) state = decide(state, s, "done");
  assert.equal(resumeStep(state), "annotations");
  // The draft of the annotations is applied: the step is done, the next one waits.
  const applied = resolveReview(state, prepareAuthor("annotations"), "applied", "2 anotações");
  assert.equal(applied?.decisions.annotations, "done");
  assert.equal(applied?.notes?.annotations, "2 anotações");
  assert.equal(resumeStep(applied), "captions");
  // "Refazer" on the zoom while the annotations' draft waited: that draft, resolved later,
  // decides nothing (the zoom is waiting now).
  const again = reopen(state, "zoom");
  assert.equal(resolveReview(again, prepareAuthor("annotations"), "applied"), again);
  const zoom = resolveReview(again, prepareAuthor("zoom"), "discarded");
  assert.equal(zoom?.decisions.zoom, "skipped");
  assert.equal(zoom?.notes?.zoom, "Descartada na revisão.");
  // One of an older lesson ("preparar" alone) decides the step waiting; others nothing.
  assert.equal(resolveReview(again, "preparar", "applied")?.decisions.zoom, "done");
  assert.equal(resolveReview(again, "assistente", "applied"), again);
});

test("the course template applied from its offer marks the steps it covered", () => {
  const steps = ["template", "zoom", "annotations", "captions", "cards"] as const;
  const fresh = markDone(undefined, steps, "Feita pelo modelo do curso.");
  assert.equal(resumeStep(fresh), "recording");
  for (const s of steps) assert.equal(fresh.decisions[s], "done");
  assert.ok(projectSchema.safeParse(project({ prepare: fresh })).success);
  // Then the pipeline runs the first steps and goes from the cuts to the inserts to the check.
  let state = fresh;
  for (const s of ["recording", "transcribe", "section", "cuts"] as const)
    state = decide(state, s, "done");
  assert.equal(resumeStep(state), "inserts");
  state = decide(state, "inserts", "done");
  assert.equal(resumeStep(state), "check");
  // A step already decided keeps its own note.
  const recorded = decide(startPrepare(), "recording", "skipped");
  const kept = markDone(decide(recorded, "transcribe", "done", "ok"), ["transcribe"], "x");
  assert.equal(kept.notes?.transcribe, "ok");
});

test('"Voz e câmera": the voice and the camera were recorded together, so the cuts run', () => {
  const take = { id: "2026-10-18 10-00-00-vc" };
  const voice = media("voz", {
    voiceTakes: [{ line: 0, start: 0, end: 5 }],
    recording: { ...take, role: "mic" },
  });
  const camera = media("camera", {
    kind: "video",
    hasVideo: true,
    hasAudio: false,
    width: 1280,
    height: 720,
    origin: "presenter",
    recording: { ...take, role: "camera" },
  });
  const tracks = [track("v", { kind: "video", name: "Apresentador" }), track("a", { name: "Voz" })];
  const filmed = project({
    assets: [voice, camera],
    tracks,
    clips: [clip("c1", "camera", "v", { volume: 0 }), clip("c2", "voz", "a")],
  });
  assert.equal(skipReason(filmed, "cuts"), null);
  assert.ok(!presenterInLesson(filmed));
  // Only once that voice was exported to make a presenter's video does the voice flow keep it.
  const exported = {
    ...filmed,
    voiceMasters: [
      {
        id: "vm",
        hash: "h",
        createdAt: 0,
        scope: "lesson" as const,
        pieces: [
          {
            file: "C:/aulas/Voz exportada/a.wav",
            label: "aula inteira",
            start: 0,
            end: 30,
            sourceMap: [{ at: 0, duration: 30, start: 0, assetId: "voz", in: 0 }],
          },
        ],
      },
    ],
  };
  assert.notEqual(skipReason(exported, "cuts"), null);
});

test("revisar a gravação só aparece quando a gravação deixou algo para decidir", () => {
  assert.match(skipReason(project(), "recording") ?? "", /não deixou nada/);
  const lapse = project({
    clips: [{ ...clip("c", "tela", "v1"), speed: 30, timelapse: { under: 5, source: 150 } }],
  });
  assert.equal(skipReason(lapse, "recording"), null);
  const noted = project({ markers: [{ id: "m", t: 3, label: "Lembrete: zoom", note: true }] });
  assert.equal(skipReason(noted, "recording"), null);
});

test("uma aula que já passou do começo do Preparar aula segue de onde estava, sem a etapa nova", () => {
  const before = {
    step: "cuts" as const,
    decisions: { transcribe: "done" as const, section: "done" as const },
  };
  const opened = normalizeProject(projectSchema.parse(project({ prepare: before })));
  assert.equal(opened.prepare?.decisions.recording, "skipped");
  assert.equal(resumeStep(opened.prepare), "cuts");
  // A lesson that never started it goes through the new step as any other.
  const fresh = normalizeProject(projectSchema.parse(project()));
  assert.equal(fresh.prepare, undefined);
});
