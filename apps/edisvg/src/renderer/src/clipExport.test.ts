import assert from "node:assert/strict";
import { test } from "node:test";
import { applyMotionCommands } from "@informach/edi-motion";
import { audioProjectFixture } from "../../../tests/audioFixture";
import { firstScene } from "../../../tests/fixtures";
import { newProject, parseProject } from "../../shared/project";
import { editScene } from "../../shared/scene.js";
import { buildClipExport } from "./clipExport";
import { buildExport } from "./export.js";

test("direct timeline exports require explicit consent to lose audio and interactivity, never for project backup", () => {
  const { project, boardId } = audioProjectFixture(),
    options = {
      format: "svg" as const,
      alt: "Som",
      reduced: true,
      offscreen: true,
      artboardId: boardId,
    };
  assert.throws(() => buildClipExport(project, "animation-tone", options, ""), /áudio/);
  assert.match(
    buildClipExport(project, "animation-tone", { ...options, confirmAnimationOnly: true }, "")
      .content,
    /<svg/,
  );
  assert.deepEqual(
    parseProject(
      JSON.parse(
        buildClipExport(project, "animation-tone", { ...options, format: "json" }, "").content,
      ),
    ),
    project,
  );
});

test("clip exports preserve full document, global transforms and valid XML attributes, with explicit sampling bounds", () => {
  const project = newProject();
  if (!firstScene(project)) throw new Error("Missing scene");
  const id = editScene(firstScene(project), null, "add", "rect");
  assert.ok(id);
  project.transforms.x = 12;
  project.transforms.y = -5;
  project.motion = applyMotionCommands(project.motion, new Set([id]), [
    {
      type: "create-animation",
      animation: {
        id: "animation-test",
        name: "Movimento",
        fps: 30,
        frames: 30,
        mode: "ping-pong",
        tracks: [],
      },
    },
    {
      type: "set-key",
      animationId: "animation-test",
      targetId: id,
      property: "x",
      frame: 0,
      value: 8,
    },
    {
      type: "set-key",
      animationId: "animation-test",
      targetId: id,
      property: "x",
      frame: 30,
      value: 68,
    },
  ]);
  const state = { ...project, activeClipId: "animation-test" };
  const options = { alt: '<teste $1 $& $` $\'> "seguro"', reduced: true, offscreen: true };
  const json = buildExport(state, { ...options, format: "json" }).content;
  assert.deepEqual(parseProject(JSON.parse(json)), project);
  const svg = buildExport(state, { ...options, format: "svg" }).content;
  assert.ok(svg.includes('data-scene-motion="" style="transform:translate(12px,-5px)'));
  assert.ok(svg.includes('data-edi-still=""'));
  assert.ok(svg.includes('dur="2s"'));
  assert.ok(svg.includes("&lt;teste $1 $&amp; $` $&apos;&gt;"));
  assert.match(svg, /Trilhas amostradas/);
  const clip = project.motion.animations[0];
  assert.ok(clip);
  clip.frames = 360000;
  assert.throws(() => buildExport(state, { ...options, format: "svg" }), /orçamento de exportação/);
});
