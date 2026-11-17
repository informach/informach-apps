import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PACKAGE_MEDIA,
  packedForArchive,
  packedLinks,
  packPlan,
  unpackPaths,
} from "../src/shared/projectPackage.ts";
import type { Asset, Project } from "../src/shared/types.ts";

/**
 * A lesson with animations linked to EdiSVG, packed: the .edisvg goes into the package once per
 * project and the link points at that copy, so the package opens on another computer and the
 * clip still opens in EdiSVG. A project that is gone travels as its last render; a package made
 * before the links travelled opens without them instead of being refused.
 */

const EDISVG = "C:\\Aulas\\Parte 4\\pecas\\conceito-1-duas-versoes.edisvg";

function linked(id: string, project: string, render: string): Asset {
  return {
    id,
    name: `Conceito ${id}`,
    path: render,
    kind: "video",
    duration: 11.8,
    width: 1920,
    height: 1080,
    fps: 30,
    hasVideo: true,
    hasAudio: false,
    size: 1000,
    proxyStatus: "none",
    alpha: true,
    link: {
      app: "edisvg",
      project,
      animationId: `animation-${id}`,
      artboardId: "artboard-cena",
      hash: "0123456789abcdef",
    },
  };
}

function lesson(assets: Asset[]): Project {
  return {
    version: 1,
    id: "aula",
    name: "Aula",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 1920, height: 1080, fps: 30 },
    assets,
    tracks: [{ id: "t", kind: "video", name: "Tela", muted: false, hidden: false, locked: false }],
    clips: assets.map((a, i) => ({
      id: `c${i}`,
      assetId: a.id,
      trackId: "t",
      start: i * 12,
      in: 0,
      duration: 11.8,
      volume: 1,
    })),
  } as Project;
}

test("the linked .edisvg travels once and the link points at it", () => {
  const p = lesson([
    linked("a", EDISVG, "C:\\Aulas\\Parte 4\\pecas\\conceito-1 · renders\\a.webm"),
    linked("b", EDISVG, "C:\\Aulas\\Parte 4\\pecas\\conceito-1 · renders\\b.webm"),
  ]);
  const plan = packPlan(p);
  const svg = plan.files.filter((f) => f.path === EDISVG);
  assert.equal(svg.length, 1, "one copy of the project for both clips");
  assert.equal(svg[0].name, `${PACKAGE_MEDIA}conceito-1-duas-versoes.edisvg`);
  for (const a of plan.project.assets) assert.equal(a.link?.project, svg[0].name);

  const opened = unpackPaths(plan.project, "D:\\Pacote");
  for (const a of opened.assets) {
    assert.equal(a.link?.project, "D:\\Pacote\\media\\conceito-1-duas-versoes.edisvg");
    assert.equal(a.link?.animationId, `animation-${a.id}`);
  }
});

test("a link whose project is gone travels as its last render", () => {
  const p = lesson([linked("a", EDISVG, "C:\\Aulas\\a.webm")]);
  const plan = packPlan(p, (path) => path !== EDISVG);
  assert.equal(plan.project.assets[0].link, undefined);
  assert.ok(!plan.files.some((f) => f.path === EDISVG));
  assert.equal(unpackPaths(plan.project, "D:\\Pacote").assets[0].link, undefined);
});

test("a package made before the links travelled opens without them", () => {
  const old = lesson([{ ...linked("a", EDISVG, `${PACKAGE_MEDIA}a-a.webm`) }]);
  const opened = unpackPaths(old, "D:\\Pacote");
  assert.equal(opened.assets[0].link, undefined);
  assert.equal(opened.assets[0].path, "D:\\Pacote\\media\\a-a.webm");
});

test("packing writes the project with the links in media/, checked as it will be read back", async () => {
  const { projectSchema } = await import("../src/shared/project-schema.ts");
  const plan = packPlan(lesson([linked("a", EDISVG, "C:\\Aulas\\a.webm")]));
  // The relative link alone is refused by the schema: packing used to stop here.
  assert.throws(() => projectSchema.parse(plan.project), /não é absoluto/);
  const written = packedForArchive(plan.project, (raw) => projectSchema.parse(raw) as Project);
  assert.equal(written.assets[0].link?.project, `${PACKAGE_MEDIA}conceito-1-duas-versoes.edisvg`);
  const reopened = projectSchema.parse(
    packedLinks(JSON.parse(JSON.stringify(written)), "D:\\Pacote"),
  );
  assert.equal(
    unpackPaths(reopened as Project, "D:\\Pacote").assets[0].link?.project,
    "D:\\Pacote\\media\\conceito-1-duas-versoes.edisvg",
  );
});

test("opening checks the packed project with its links already in the folder", async () => {
  const { projectSchema } = await import("../src/shared/project-schema.ts");
  const plan = packPlan(lesson([linked("a", EDISVG, "C:\\Aulas\\a.webm")]));
  const raw = JSON.parse(JSON.stringify(plan.project));
  const checked = projectSchema.parse(packedLinks(raw, "D:\\Pacote"));
  const opened = unpackPaths(checked as Project, "D:\\Pacote");
  assert.equal(opened.assets[0].link?.project, "D:\\Pacote\\media\\conceito-1-duas-versoes.edisvg");
  const old = JSON.parse(JSON.stringify(lesson([linked("a", EDISVG, `${PACKAGE_MEDIA}a.webm`)])));
  const oldChecked = projectSchema.parse(packedLinks(old, "D:\\Pacote"));
  assert.equal(oldChecked.assets[0].link, undefined);
});
