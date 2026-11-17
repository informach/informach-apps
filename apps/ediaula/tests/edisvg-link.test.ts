import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { writeManifest } from "@informach/edi-link/node";
import {
  createRendersWatcher,
  lessonLinkProject,
  linkState,
  readEdisvgSummary,
} from "../src/main/edisvgLink.ts";

let root = "";
before(async () => {
  root = await mkdtemp(join(tmpdir(), "ediaula-vinculo-"));
});
after(async () => {
  await rm(root, { recursive: true, force: true });
});

test("the lesson's EdiSVG project goes beside the lesson file, with its name", () => {
  assert.equal(
    lessonLinkProject(join(root, "DPJ Aula01", "DPJ Aula01.ediaula")),
    join(root, "DPJ Aula01", "DPJ Aula01.edisvg"),
  );
  assert.equal(lessonLinkProject("aula.ediaula"), undefined);
  assert.equal(lessonLinkProject(join(root, "aula.zip")), undefined);
});

test("a .edisvg is read as far as linking goes; anything else is refused", async () => {
  const path = join(root, "Personagem.edisvg");
  await writeFile(
    path,
    JSON.stringify({
      version: 26,
      id: "project-x",
      name: "Personagem",
      artboards: [
        { id: "artboard-a1", name: "Cena", scene: { viewBox: [0, 0, 1920, 1080], nodes: [] } },
      ],
      motion: {
        animations: [{ id: "animation-a1", name: "Entrada", fps: 30, frames: 90, tracks: [] }],
      },
    }),
  );
  const summary = await readEdisvgSummary(path);
  assert.deepEqual(
    summary.motion?.animations.map((a) => a.name),
    ["Entrada"],
  );
  await writeFile(join(root, "quebrado.edisvg"), "{");
  await assert.rejects(
    readEdisvgSummary(join(root, "quebrado.edisvg")),
    /não é um projeto do EdiSVG/,
  );
  await assert.rejects(readEdisvgSummary(join(root, "aula.ediaula")), /\.edisvg/);
});

test("a project's linked animations: each render a full path of its renders folder, when it is there", async () => {
  const project = join(root, "Aula", "Aula.edisvg");
  await mkdir(join(root, "Aula"), { recursive: true });
  await writeFile(project, "{}");
  const folder = join(root, "Aula", "Aula · renders");
  const render = (animationId: string, hash: string) => ({
    file: `${animationId}-${hash}.webm`,
    width: 1920,
    height: 1080,
    fps: 30,
    frames: 30,
    duration: 1,
    hash,
  });
  await writeManifest(folder, {
    version: 1,
    projectId: "project-x",
    items: [
      {
        animationId: "animation-a1",
        artboardId: "artboard-a1",
        name: "A",
        updatedAt: 1,
        render: render("animation-a1", "0000000000000001"),
      },
      // Its render is not on the disk (removed by hand): no path.
      {
        animationId: "animation-b2",
        artboardId: "artboard-a1",
        name: "B",
        updatedAt: 1,
        render: render("animation-b2", "0000000000000002"),
      },
      { animationId: "animation-c3", artboardId: "artboard-a1", name: "C", updatedAt: 1 },
    ],
  });
  await writeFile(join(folder, "animation-a1-0000000000000001.webm"), "webm");
  const state = await linkState(project);
  assert.equal(state.exists, true);
  assert.deepEqual(
    state.items.map((i) => [i.animationId, i.renderPath]),
    [
      ["animation-a1", join(folder, "animation-a1-0000000000000001.webm")],
      ["animation-b2", undefined],
      ["animation-c3", undefined],
    ],
  );
  // A project moved away: its renders are still read (the clip keeps playing), and it says so.
  assert.equal((await linkState(join(root, "Outra", "Outra.edisvg"))).exists, false);
});

test("a save in EdiSVG is heard: the manifest written, also when the renders folder is new", async () => {
  await mkdir(join(root, "Nova"), { recursive: true });
  const project = join(root, "Nova", "Nova.edisvg");
  const heard: string[] = [];
  const watcher = createRendersWatcher((p) => heard.push(p));
  try {
    watcher.set([project]);
    await writeManifest(join(root, "Nova", "Nova · renders"), {
      version: 1,
      projectId: "project-y",
      items: [{ animationId: "animation-a1", artboardId: "artboard-a1", name: "A", updatedAt: 1 }],
    });
    const deadline = Date.now() + 5000;
    while (!heard.length && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
    assert.deepEqual([...new Set(heard)], [project]);
    // Not watched any more: nothing is heard.
    watcher.set([]);
    heard.length = 0;
    await writeManifest(join(root, "Nova", "Nova · renders"), {
      version: 1,
      projectId: "project-y",
      items: [],
    });
    await new Promise((r) => setTimeout(r, 500));
    assert.deepEqual(heard, []);
  } finally {
    watcher.close();
  }
});

test("a package's EdiSVG project gets its links back: a save there reaches the lesson again", async () => {
  const { readManifest, rendersDir } = await import("@informach/edi-link/node");
  const { restorePackedLinks } = await import("../src/main/edisvgLink.ts");
  const pkg = join(root, "Pacote");
  const media = join(pkg, "media");
  await mkdir(media, { recursive: true });
  const edisvg = join(media, "conceito.edisvg");
  await writeFile(
    edisvg,
    JSON.stringify({ id: "project-conceito", artboards: [], motion: { animations: [] } }),
  );
  const played = join(media, "a1-animation-um-0123456789abcdef.webm");
  await writeFile(played, "webm");
  const asset = (id: string, path: string, animationId: string, hash?: string) => ({
    id,
    name: `Conceito ${id}`,
    path,
    kind: "video" as const,
    duration: 2,
    width: 1920,
    height: 1080,
    fps: 30,
    hasVideo: true,
    hasAudio: false,
    size: 4,
    proxyStatus: "none" as const,
    alpha: true,
    link: {
      app: "edisvg" as const,
      project: edisvg,
      animationId,
      artboardId: "artboard-cena",
      ...(hash ? { hash } : {}),
    },
  });
  const lesson = {
    version: 1,
    id: "aula",
    name: "Aula",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 1920, height: 1080, fps: 30 },
    assets: [
      asset("a1", played, "animation-um", "0123456789abcdef"),
      // Its render did not come in the package: EdiSVG makes it at the next save.
      asset("a2", join(media, "sumiu.webm"), "animation-dois", "fedcba9876543210"),
    ],
    tracks: [],
    clips: [],
  } as unknown as import("../src/shared/types.ts").Project;

  const opened = await restorePackedLinks(lesson, pkg, 5);
  const folder = rendersDir(edisvg);
  const manifest = await readManifest(folder);
  assert.equal(manifest?.projectId, "project-conceito");
  assert.deepEqual(
    manifest?.items.map((i) => [i.animationId, i.artboardId, i.render?.file, i.render?.frames]),
    [
      ["animation-um", "artboard-cena", "animation-um-0123456789abcdef.webm", 60],
      ["animation-dois", "artboard-cena", undefined, undefined],
    ],
  );
  // The render it plays is the manifest's: EdiSVG only renders what a save changes.
  assert.equal(opened.assets[0].path, join(folder, "animation-um-0123456789abcdef.webm"));
  assert.deepEqual((await linkState(edisvg)).items[0].renderPath, opened.assets[0].path);
  // A manifest already there (EdiSVG's own) is never rewritten.
  assert.equal(await restorePackedLinks(lesson, pkg, 9), lesson);
  // A project outside the package is not the package's to touch.
  const outside = await restorePackedLinks(lesson, join(root, "Outro"), 9);
  assert.equal(outside, lesson);
});
