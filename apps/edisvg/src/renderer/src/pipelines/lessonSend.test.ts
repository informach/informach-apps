import assert from "node:assert/strict";
import { test } from "node:test";
import type { Project } from "../../../shared/project";
import { cannotSend, sendPlan } from "./lessonSend";

const stretch = (clipId: string, start: number, kind: "game-scene" | "screen-demo") => ({
  clipId,
  kind,
  lessonId: "pgte1jhfsnary",
  section: 5,
  start,
  end: start + 10,
  phrases: [],
});

test("a lesson's animations are sent in the order of its seconds, at the artboard's size", () => {
  const project = {
    artboards: [
      {
        id: "artboard-cena",
        name: "Cena",
        scene: { viewBox: [0, 0, 1440, 1080], nodes: [] },
        lessonClips: [stretch("animation-cena", 489.7, "game-scene")],
      },
      {
        id: "artboard-camada",
        name: "Demonstração",
        // Larger than a video takes: scaled down, the proportion kept.
        scene: { viewBox: [0, 0, 7680, 4320], nodes: [] },
        lessonClips: [
          stretch("animation-demo", 10, "screen-demo"),
          // Its animation was deleted: nothing to send.
          stretch("animation-apagada", 20, "screen-demo"),
        ],
      },
    ],
    motion: {
      animations: [
        { id: "animation-cena", name: "Cena", fps: 30, frames: 300 },
        { id: "animation-demo", name: "Demo", fps: 30, frames: 0 },
      ],
    },
  } as unknown as Project;
  const items = sendPlan(project).get("pgte1jhfsnary") ?? [];
  assert.deepEqual(
    items.map((i) => [i.stretch.clipId, i.width, i.height, i.frames]),
    [
      ["animation-demo", 3840, 2160, 1],
      ["animation-cena", 1440, 1080, 300],
    ],
  );
});

test("an animation over the send's rate or length is refused before anything is encoded", () => {
  assert.equal(cannotSend({ name: "Cena", fps: 30, frames: 3344 }), null);
  assert.match(cannotSend({ name: "Cena", fps: 120, frames: 10 }) ?? "", /120 FPS: .* até 60/);
  assert.match(cannotSend({ name: "Cena", fps: 30, frames: 72_001 }) ?? "", /72001 quadros/);
});
