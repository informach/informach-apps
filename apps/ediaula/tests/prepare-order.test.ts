import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decide,
  nextStep,
  PREPARE_LABEL,
  PREPARE_STEPS,
  prepareFinished,
  reopen,
  resumeStep,
  skipReason,
  startPrepare,
  voiceAlreadyCleaned,
} from "../src/shared/prepare.ts";
import { projectSchema } from "../src/shared/project-schema.ts";
import type { Project } from "../src/shared/types.ts";

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
  assert.equal(resumeStep(state), "transcribe");
  // Deciding a later step out of turn changes nothing.
  assert.equal(decide(state, "zoom", "done"), state);
  state = decide(state, "transcribe", "done");
  assert.equal(state.step, "section");
  state = decide(state, "section", "skipped", "A aula não tem roteiro colado.");
  assert.equal(state.step, "cuts");
  assert.equal(state.notes?.section, "A aula não tem roteiro colado.");
  for (const s of PREPARE_STEPS.slice(2)) state = decide(state, s, "done");
  assert.ok(prepareFinished(state));
  assert.equal(nextStep(state), null);
  assert.equal(resumeStep(state), null);
});

test("the state is kept in the project and the pipeline goes on where it stopped", () => {
  let state = startPrepare();
  state = decide(state, "transcribe", "done");
  state = decide(state, "section", "done");
  state = decide(state, "cuts", "skipped", "voz já limpa");
  const saved = projectSchema.parse(JSON.parse(JSON.stringify(project({ prepare: state }))));
  assert.deepEqual(saved.prepare, state);
  assert.equal(resumeStep(saved.prepare), "inserts");
  // A saved step that is not the first open one (an older file) resumes at the first open one.
  assert.equal(resumeStep({ step: "zoom", decisions: { transcribe: "done" } }), "section");
  assert.ok(
    !projectSchema.safeParse(project({ prepare: { step: "nada" as "zoom", decisions: {} } }))
      .success,
  );
});

test("opening a step again clears it and every step after it", () => {
  let state = startPrepare();
  for (const s of PREPARE_STEPS.slice(0, 6)) state = decide(state, s, "done", `nota ${s}`);
  const again = reopen(state, "inserts");
  assert.equal(again.step, "inserts");
  assert.deepEqual(Object.keys(again.decisions), ["transcribe", "section", "cuts"]);
  assert.deepEqual(Object.keys(again.notes ?? {}), ["transcribe", "section", "cuts"]);
  assert.equal(resumeStep(again), "inserts");
});

test("the cuts are skipped when the voice was cleaned before making the presenter's video", () => {
  const plain = project();
  assert.ok(!voiceAlreadyCleaned(plain));
  assert.equal(skipReason(plain, "cuts"), null);
  const sent = project({
    voiceMasters: [{ id: "m", hash: "h", createdAt: 1, scope: "lesson", pieces: [] }],
  });
  assert.ok(voiceAlreadyCleaned(sent));
  assert.match(
    skipReason(sent, "cuts") ?? "",
    /já foi limpa antes de gerar o vídeo do apresentador/,
  );
  // The presenter's video placed by the voice, or the older marker of its own sound, say the same.
  const video = {
    id: "v",
    name: "Apresentador",
    path: "C:/a.mp4",
    kind: "video" as const,
    duration: 9,
    width: 1280,
    height: 720,
    fps: 25,
    hasVideo: true,
    hasAudio: true,
    size: 1,
    proxyStatus: "none" as const,
    origin: "presenter" as const,
  };
  const clip = { id: "c", assetId: "v", trackId: "t", start: 0, in: 0, duration: 9, volume: 1 };
  assert.ok(voiceAlreadyCleaned(project({ assets: [video], clips: [clip] })));
  assert.ok(!voiceAlreadyCleaned(project({ assets: [video], clips: [] })));
  assert.ok(
    voiceAlreadyCleaned(project({ clips: [{ ...clip, assetId: "voz", mutedFor: "heygen" }] })),
  );
  assert.ok(!/HeyGen/i.test(skipReason(sent, "cuts") ?? ""));
  assert.match(skipReason(plain, "section") ?? "", /roteiro/);
  assert.match(skipReason(plain, "zoom") ?? "", /cliques/);
  assert.equal(skipReason(project({ script: { text: "# Roteiro" } }), "inserts"), null);
});
