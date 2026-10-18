import assert from "node:assert/strict";
import { test } from "node:test";
import { sourceRoom } from "../src/shared/clipTime.ts";
import { trimGroup } from "../src/shared/groups.ts";
import {
  blankPausesArgs,
  enableExpression,
  pausedInMedia,
  transcriptWithoutPauses,
} from "../src/shared/pausedMedia.ts";
import { projectSchema } from "../src/shared/project-schema.ts";
import { packPlan } from "../src/shared/projectPackage.ts";
import type { RecordingResult } from "../src/shared/recording.ts";
import { layoutRecording } from "../src/shared/recordingImport.ts";
import { trimClip } from "../src/shared/timeline.ts";
import type { Asset, Clip, Project } from "../src/shared/types.ts";

/** A take of 20 s paused from 5 to 8 s: the screen whole, the camera from second 1 of the take. */
const result: RecordingResult = {
  version: 2,
  dir: "C:/take",
  screen: "C:/take/tela.mp4",
  microphone: "C:/take/microfone.m4a",
  cameraParts: [{ path: "C:/take/camera-0.mp4", at: 1, in: 0.5, duration: 19 }],
  duration: 20,
  pauses: [[5, 8]],
  markers: [],
};

const asset = (id: string, path: string, paused?: [number, number][]): Asset => ({
  id,
  name: id,
  path,
  kind: "video",
  duration: 20,
  width: 1920,
  height: 1080,
  fps: 30,
  hasVideo: true,
  hasAudio: true,
  size: 1,
  proxyStatus: "none",
  recording: { id: "take", role: "screen", ...(paused ? { paused } : {}) },
});

test("each file of a take knows the seconds it recorded during the pauses", () => {
  assert.deepEqual(pausedInMedia(result, "C:/take/tela.mp4"), [[5, 8]]);
  assert.deepEqual(pausedInMedia(result, "c:/TAKE/microfone.m4a"), [[5, 8]]);
  // The camera started at second 1 of the take, from its own second 0.5.
  assert.deepEqual(pausedInMedia(result, "C:/take/camera-0.mp4"), [[4.5, 7.5]]);
  assert.deepEqual(pausedInMedia(result, "C:/outra.mp4"), []);
  assert.deepEqual(pausedInMedia({ ...result, pauses: [] }, "C:/take/tela.mp4"), []);
  assert.equal(
    enableExpression([
      [8, 9],
      [1, 2],
      [1.5, 3],
    ]),
    "between(t,1,3)+between(t,8,9)",
  );
});

test("no trim of a take's clip reaches the seconds of its pauses", () => {
  const screen = asset("s", "C:/take/tela.mp4", [[5, 8]]);
  const { clips } = layoutRecording({ tracks: [], clips: [], assets: [screen] }, [screen], result);
  const [before, after] = clips.filter((c) => c.assetId === "s").sort((a, b) => a.start - b.start);
  assert.deepEqual([before.in, before.duration, after.in], [0, 5, 8]);
  // Pulling the end of the first piece out stops at the pause, so does the start of the second.
  assert.equal(trimClip(before, "end", before.start + 9, screen).duration, 5);
  const back = trimClip(after, "start", after.start - 4, screen);
  assert.equal(back.in, 8);
  assert.deepEqual(sourceRoom(after, screen), [8, 20]);
  // Without pauses the file's own ends are the limits.
  const plain = asset("p", "C:/a.mp4");
  assert.deepEqual(sourceRoom({ in: 2, duration: 3 }, plain), [0, 20]);
  // A group trims as far as each member may go.
  const group = { ...before, groupId: "g" };
  const other: Clip = { ...before, id: "o", trackId: "x", assetId: "p" };
  const grouped = trimGroup(
    [group, { ...other, groupId: "g" }],
    group,
    trimClip(group, "end", group.start + 9, screen),
    "end",
    trimClip,
    new Map([
      ["s", screen],
      ["p", plain],
    ]),
    1 / 30,
  );
  assert.ok(grouped.every((c) => c.duration <= 5 + 1e-9));
});

test("the media with pauses goes in the package blanked, and the project keeps the ranges", () => {
  const screen = asset("s", "C:/take/tela.mp4", [[5, 8]]);
  const project: Project = {
    version: 1,
    id: "p",
    name: "Aula",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 1920, height: 1080, fps: 30 },
    assets: [{ ...screen, transcript: "C:/take/tela.json" }, asset("o", "C:/outra.mp4")],
    tracks: [],
    clips: [],
  };
  const plan = packPlan(project);
  const blank = plan.files.map((f) => [f.name, f.blank?.kind ?? null]);
  assert.deepEqual(blank, [
    ["media/s-tela.mp4", "media"],
    ["media/s-transcricao.json", "transcript"],
    ["media/o-outra.mp4", null],
  ]);
  assert.deepEqual(projectSchema.parse(project).assets[0].recording?.paused, [[5, 8]]);
  const args = blankPausesArgs("in.m4a", "out.m4a", [[5, 8]], { video: false, audio: true });
  assert.ok(args.includes("volume=0:enable='between(t,5,8)'"));
  assert.ok(!args.includes("-vf"));
  assert.deepEqual(args.slice(args.indexOf("-c:a"), args.indexOf("-c:a") + 2), ["-c:a", "aac"]);
  assert.throws(() => blankPausesArgs("a", "b", [], { video: true, audio: true }));
});

test("the packed transcript has no word said in a pause, and the pause is silence", () => {
  const out = transcriptWithoutPauses(
    {
      version: 1,
      model: "m",
      language: "pt",
      duration: 20,
      words: [
        { text: "antes", start: 4, end: 4.5, p: 1 },
        { text: "na", start: 4.8, end: 5.2, p: 1 },
        { text: "pausa", start: 6, end: 6.5, p: 1 },
        { text: "depois", start: 9, end: 9.5, p: 1 },
      ],
      silences: [[7.5, 8.5]],
      speech: [[3, 10]],
    },
    [[5, 8]],
  );
  assert.deepEqual(
    out.words.map((w) => w.text),
    ["antes", "depois"],
  );
  assert.deepEqual(out.silences, [[5, 8.5]]);
  assert.deepEqual(out.speech, [
    [3, 5],
    [8, 10],
  ]);
});
