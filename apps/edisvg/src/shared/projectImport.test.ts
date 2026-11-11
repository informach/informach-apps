import assert from "node:assert/strict";
import { test } from "node:test";
import { compileArtboard } from "./components";
import { executeDocumentTransaction } from "./documentCommands";
import { newProject, type Project, parseProject } from "./project";
import { importableArtboards } from "./projectImport";
import { flattenScene } from "./scene.js";
import type { SceneNode } from "./sceneTypes";

const transform = { x: 0, y: 0, rotation: 0, sx: 1, sy: 1, opacity: 100 };
const rect = (id: string, name: string): SceneNode => ({
  id,
  name,
  tag: "rect",
  attrs: { width: "40", height: "60", fill: "#ff8800" },
  text: "",
  children: [],
  transform: { ...transform },
  visible: true,
  locked: false,
});
const track = (id: string, targetId: string) => ({
  id,
  targetId,
  property: "y" as const,
  keys: [
    { id: `${id.replace("track", "key")}-1`, frame: 0, value: 0, easing: "linear" as const },
    { id: `${id.replace("track", "key")}-2`, frame: 30, value: -40, easing: "linear" as const },
  ],
});

/** The mascot's project: Zappy (animated), a scene showing Zappy as a component, and the main board. */
function mascotProject(): Project {
  const project = newProject();
  project.artboards[0]?.scene.nodes.push(rect("node-fundo", "Fundo"));
  project.artboards.push(
    {
      id: "artboard-zappy",
      name: "Zappy",
      scene: {
        viewBox: [0, 0, 400, 400],
        nodes: [
          {
            ...rect("node-zappy", "Zappy"),
            tag: "g",
            attrs: {},
            children: [rect("node-corpo", "Corpo")],
          },
        ],
      },
    },
    {
      id: "artboard-cena",
      name: "Cena",
      scene: {
        viewBox: [0, 0, 800, 600],
        nodes: [
          {
            ...rect("node-instancia", "Zappy"),
            tag: "g",
            attrs: {},
            instance: {
              artboardId: "artboard-zappy",
              animationId: "anim-acenar",
              width: 400,
              height: 400,
              fit: "contain",
              speed: 1,
              offsetSeconds: 0,
              overrides: [],
            },
          },
        ],
      },
    },
  );
  project.motion.animations.push(
    {
      id: "anim-acenar",
      name: "Acenar",
      fps: 30,
      frames: 60,
      mode: "loop",
      tracks: [track("track-mascote-y", "node-corpo")],
    },
    {
      id: "anim-tudo",
      name: "Tudo",
      fps: 30,
      frames: 60,
      mode: "once",
      tracks: [track("track-fundo", "node-fundo"), track("track-zappy", "node-zappy")],
    },
  );
  return parseProject(project);
}

/** The cover's project, made by the assistant too: it shares ids and names with the mascot's. */
function coverProject(): Project {
  const project = newProject();
  project.artboards[0]?.scene.nodes.push(rect("node-corpo", "Título"));
  project.motion.animations.push({
    id: "anim-acenar",
    name: "Acenar",
    fps: 30,
    frames: 30,
    mode: "loop",
    tracks: [track("track-mascote-y", "node-corpo")],
  });
  return parseProject(project);
}

const importInto = (target: Project, source: Project, artboardIds: string[]) => {
  const sessionId = crypto.randomUUID();
  return executeDocumentTransaction(
    { project: target, sessionId, revision: 0 },
    {
      projectId: target.id,
      sessionId,
      revision: 0,
      commands: [{ type: "project-import", source, artboardIds }],
    },
  );
};

test("the dialog lists each artboard with its animations and the components it brings", () => {
  const list = importableArtboards(mascotProject());
  const cena = list.find((item) => item.name === "Cena");
  assert.deepEqual(cena, {
    id: "artboard-cena",
    name: "Cena",
    width: 800,
    height: 600,
    animations: ["Acenar", "Tudo"],
    components: ["Zappy"],
    componentIds: ["artboard-zappy"],
  });
  assert.deepEqual(list.find((item) => item.name === "Zappy")?.components, []);
});

test("an artboard comes with its components and animations, its ids renamed where they collide", () => {
  const cover = coverProject(),
    before = JSON.stringify(cover);
  const result = importInto(cover, mascotProject(), ["artboard-cena"]);
  assert.equal(JSON.stringify(cover), before, "the project given in is left as it was");
  const project = result.project;
  assert.deepEqual(
    project.artboards.map((board) => board.name),
    ["Prancheta 1", "Zappy", "Cena"],
  );
  assert.equal(result.selectedArtboard, "artboard-cena");
  const zappy = project.artboards.find((board) => board.name === "Zappy");
  const cena = project.artboards.find((board) => board.name === "Cena");
  assert.ok(zappy && cena);
  // "node-corpo" was the cover's title: the mascot's body got a new id.
  const body = flattenScene(zappy.scene).find(({ node }) => node.name === "Corpo")?.node;
  assert.ok(body && body.id !== "node-corpo" && body.id.startsWith("node-"));
  assert.equal(
    flattenScene(project.artboards[0]?.scene ?? null).find(({ node }) => node.id === "node-corpo")
      ?.node.name,
    "Título",
  );
  // "Acenar" came as "Acenar 2", with its own id, and its track follows the body.
  const waving = project.motion.animations.find((animation) => animation.name === "Acenar 2");
  assert.ok(waving && waving.id !== "anim-acenar");
  assert.equal(waving.tracks[0]?.targetId, body.id);
  assert.notEqual(waving.tracks[0]?.id, "track-mascote-y");
  // The scene's component shows the imported Zappy, playing the imported animation.
  const instance = cena.scene.nodes[0]?.instance;
  assert.equal(instance?.artboardId, zappy.id);
  assert.equal(instance?.animationId, waving.id);
  // "Tudo" keeps only what moves Zappy; the mascot project's background stays behind.
  const all = project.motion.animations.find((animation) => animation.name === "Tudo");
  assert.deepEqual(
    all?.tracks.map((item) => item.targetId),
    ["node-zappy"],
  );
  // The cover's own animation is untouched.
  const own = project.motion.animations.find((animation) => animation.id === "anim-acenar");
  assert.equal(own?.name, "Acenar");
  assert.equal(own?.tracks[0]?.targetId, "node-corpo");
  assert.ok(compileArtboard(project, cena.id));
});

test("importing the same artboard twice makes a second, independent copy", () => {
  const source = mascotProject();
  const once = importInto(coverProject(), source, ["artboard-zappy"]).project;
  const twice = importInto(once, source, ["artboard-zappy"]).project;
  const copies = twice.artboards.filter((board) => board.name.startsWith("Zappy"));
  assert.deepEqual(
    copies.map((board) => board.name),
    ["Zappy", "Zappy 2"],
  );
  const [a, b] = copies.map((board) => flattenScene(board.scene).map(({ node }) => node.id));
  assert.ok(a && b && a.every((id) => !b.includes(id)));
  // The main artboard of the source ("artboard-main", also the cover's) never came.
  assert.equal(twice.artboards.filter((board) => board.id === "artboard-main").length, 1);
});

test("an import over the project's limits changes nothing", () => {
  const cover = coverProject();
  for (let i = 0; i < 99; i++)
    cover.motion.animations.push({
      id: `anim-${i}`,
      name: `A${i}`,
      fps: 30,
      frames: 30,
      mode: "loop",
      tracks: [],
    });
  assert.throws(() => importInto(cover, mascotProject(), ["artboard-cena"]), /limite é 100/);
});
