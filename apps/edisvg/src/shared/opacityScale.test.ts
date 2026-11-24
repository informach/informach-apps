import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateAnimation } from "@informach/edi-motion";
import { firstScene } from "../../tests/fixtures";
import { executeDocumentTransaction } from "./documentCommands";
import { newProject, PROJECT_VERSION, parseProject } from "./project";
import { editScene } from "./scene.js";

// Opacity is 0–100. On 20/11/2026 the editor guide showed the `keys` command with
// opacity:[[0,0],[12,1]], the assistant wrote whole lessons that way, and every object that
// faded in stopped at 1%: only the background and the presenter's video showed.

function lesson() {
  const project = newProject();
  const scene = firstScene(project);
  if (!scene) throw new Error("Missing scene");
  const group = editScene(scene, null, "add", "rect");
  const card = editScene(scene, null, "add", "rect");
  const glow = editScene(scene, null, "add", "rect");
  if (!group || !card || !glow) throw new Error("Missing objects");
  return { project, ids: { group, card, glow } };
}

test("opacity: a fade-in sent through edit_document on 0–1 ends fully visible", () => {
  const { project, ids } = lesson();
  const context = { project, sessionId: crypto.randomUUID(), revision: 0 };
  const done = executeDocumentTransaction(context, {
    projectId: project.id,
    sessionId: context.sessionId,
    revision: 0,
    commands: [
      {
        type: "motion",
        command: {
          type: "create-animation",
          animation: {
            id: "animation-lesson",
            name: "Aula",
            fps: 30,
            frames: 120,
            mode: "once",
            tracks: [],
          },
        },
      },
      {
        type: "motion",
        command: {
          type: "keys",
          animationId: "animation-lesson",
          targetId: ids.card,
          tracks: {
            opacity: [
              [46, 0],
              [54, 1, "ease-out"],
            ],
            y: [
              [46, 20],
              [54, 0],
            ],
          },
        },
      },
    ],
  });
  const clip = done.project.motion.animations[0];
  assert.ok(clip);
  assert.deepEqual(
    clip.tracks.find((track) => track.property === "opacity")?.keys.map((key) => key.value),
    [0, 100],
  );
  assert.equal(evaluateAnimation(clip, 46).get(ids.card)?.opacity, 0);
  assert.equal(evaluateAnimation(clip, 60).get(ids.card)?.opacity, 100);
});

test("opacity: a v27 lesson written on 0–1 opens on 0–100, once, and percent tracks stay", () => {
  const { project, ids } = lesson();
  const key = (frame: number, value: number) => ({
    id: `key-${crypto.randomUUID()}`,
    frame,
    value,
    easing: "linear" as const,
  });
  const track = (targetId: string, values: [number, number][]) => ({
    id: `track-${crypto.randomUUID()}`,
    targetId,
    property: "opacity" as const,
    keys: values.map(([frame, value]) => key(frame, value)),
  });
  const saved = {
    ...JSON.parse(JSON.stringify(project)),
    version: 27,
    motion: {
      version: project.motion.version,
      animations: [
        {
          id: "animation-lesson",
          name: "Aula",
          fps: 30,
          frames: 200,
          mode: "once",
          tracks: [
            // The group leaves at 144–152 and its card enters at 46–54, both on 0–1.
            track(ids.group, [
              [144, 1],
              [152, 0],
            ]),
            track(ids.card, [
              [46, 0],
              [54, 1],
            ]),
            // A glow pulsing between 30% and 75%, written as 0.3 and 0.75.
            track(ids.glow, [
              [0, 0.3],
              [90, 0.75],
            ]),
          ],
        },
        {
          id: "animation-other",
          name: "Outra",
          fps: 30,
          frames: 60,
          mode: "once",
          tracks: [
            // On 0–100 already, and one that only hides: both stay as they are.
            track(ids.card, [
              [0, 0],
              [12, 100],
              [24, 1],
            ]),
            track(ids.glow, [[0, 0]]),
          ],
        },
      ],
    },
  };
  const opened = parseProject(saved);
  assert.equal(opened.version, PROJECT_VERSION);
  const values = (clip: number) =>
    opened.motion.animations[clip]?.tracks.map((t) => t.keys.map((k) => k.value));
  assert.deepEqual(values(0), [
    [100, 0],
    [0, 100],
    [30, 75],
  ]);
  assert.deepEqual(values(1), [[0, 100, 1], [0]]);
  const clip = opened.motion.animations[0];
  assert.ok(clip);
  assert.equal(evaluateAnimation(clip, 60).get(ids.card)?.opacity, 100);
  assert.equal(evaluateAnimation(clip, 60).get(ids.group)?.opacity, 100);
  // Saved again it is v28, and opening it again changes nothing: a v28 track on 0–1 (an object
  // a person faded to 1%) is theirs.
  const again = parseProject(JSON.parse(JSON.stringify(opened)));
  assert.deepEqual(again.motion, opened.motion);
  const faint = JSON.parse(JSON.stringify(opened));
  faint.motion.animations[1].tracks[1].keys[0].value = 1;
  assert.equal(parseProject(faint).motion.animations[1]?.tracks[1]?.keys[0]?.value, 1);
  // Older files never had the keys command and are left alone.
  assert.deepEqual(
    parseProject({ ...saved, version: 26 }).motion.animations[0]?.tracks[1]?.keys.map(
      (k) => k.value,
    ),
    [0, 1],
  );
});
