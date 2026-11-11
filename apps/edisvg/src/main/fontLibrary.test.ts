import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { FontAsset } from "@informach/edi-motion/assets";
import { inspectAssetNotice, inspectAssets } from "../shared/assetInspection";
import { executeDocumentTransaction } from "../shared/documentCommands";
import { defaultFonts } from "../shared/fontDefaults";
import { inspectFontCoverage } from "../shared/fontInspection";
import {
  DEFAULT_LIBRARY_FONTS,
  inspectFontLibrary,
  libraryFontAsset,
  libraryFontsNamed,
  resolveLibraryFonts,
} from "../shared/fontLibrary";
import { newProject, PROJECT_VERSION, type Project, parseProject } from "../shared/project";
import { flattenScene } from "../shared/scene.js";
import { createFontPreference, libraryFont, libraryFonts, withDefaultFonts } from "./fontLibrary";
import { createProjectFiles } from "./projectFiles.js";

/** EdiAula's bundle, where development reads it (the installer copies it beside EdiSVG). */
const ediaula = (path: string) =>
  fileURLToPath(new URL(`../../../ediaula/resources/${path}`, import.meta.url));
const source = { dir: ediaula("fonts"), manifest: ediaula("fonts.json") };

const PT_BR =
  "Ação, coração e pão! Você já viu? À noite: Árvore, ÉPOCA, índio, ÓTIMO, ÚNICO — “aspas” 1234567890 % R$ ç Ç ã õ â ê ô à á é í ó ú ü (ok) [sim] {não} ; … ‘x’ « » ª º °";

/** The editor's edit_document: library fonts loaded and resolved, then one transaction. */
async function edit(project: Project, commands: unknown[], artboardId = "artboard-main") {
  const ids = libraryFontsNamed(commands);
  const fonts = new Map<string, FontAsset>();
  for (const id of ids) fonts.set(id, libraryFontAsset(await libraryFont(source, id)));
  const resolved = resolveLibraryFonts(commands, fonts);
  const result = executeDocumentTransaction(
    { project, sessionId: "00000000-0000-4000-8000-000000000000", revision: 0 },
    {
      projectId: project.id,
      sessionId: "00000000-0000-4000-8000-000000000000",
      revision: 0,
      artboardId,
      commands: resolved.commands,
    },
  );
  return { project: parseProject(result.project), added: resolved.added, result };
}

const text = (id: string, value: string, weight = "normal") => ({
  id,
  name: id,
  tag: "text" as const,
  attrs: { x: "10", y: "50", "font-size": "40", "font-family": "Arial", "font-weight": weight },
  text: value,
  children: [],
  transform: { x: 0, y: 0, rotation: 0, sx: 1, sy: 1, opacity: 100 },
  visible: true,
  locked: false,
});

function withTexts(nodes: ReturnType<typeof text>[]): Project {
  const project = newProject();
  project.artboards[0]?.scene.nodes.push(...nodes);
  return parseProject(project);
}

test("the library lists Baloo 2 and Nunito as static faces with stable ids and the OFL", async () => {
  const library = await libraryFonts(source);
  const baloo = library.find((font) => font.id === "baloo-2-800");
  const nunito = library.find((font) => font.id === "nunito-400");
  assert.deepEqual(baloo, {
    id: "baloo-2-800",
    family: "Baloo 2",
    weight: 800,
    style: "normal",
    format: "truetype",
    group: baloo?.group,
    license: "SIL Open Font License 1.1",
  });
  assert.equal(nunito?.family, "Nunito");
  for (const id of ["nunito-600", "nunito-700", "plus-jakarta-sans-700"])
    assert.ok(
      library.some((font) => font.id === id),
      id,
    );
  assert.equal(new Set(library.map((font) => font.id)).size, library.length);
  // get_font_library pages without bytes.
  const page = inspectFontLibrary(library, { offset: 0, limit: 5 });
  assert.equal(page.fonts.length, 5);
  assert.equal(page.nextOffset, 5);
  assert.equal(page.total, library.length);
  assert.deepEqual(page.newProjectDefaults, DEFAULT_LIBRARY_FONTS);
  assert.doesNotMatch(JSON.stringify(page), /data|bytes/);
  // Only the library's ids: no path, no unknown face.
  for (const id of ["../fonts/Baloo2-800", "baloo-2-300", "comic-sans-400", 42])
    await assert.rejects(libraryFont(source, id));
});

test("add-library-font and set-font in one transaction; again adds nothing; coverage and notice", async () => {
  const start = withTexts([text("node-titulo", PT_BR), text("node-apoio", PT_BR)]);
  const { project, added } = await edit(start, [
    { type: "asset", operation: "add-library-font", fontId: "baloo-2-800" },
    { type: "asset", operation: "set-font", targetId: "node-titulo", libraryFontId: "baloo-2-800" },
    { type: "asset", operation: "set-font", targetId: "node-apoio", libraryFontId: "nunito-400" },
  ]);
  assert.equal(added.length, 2);
  assert.deepEqual(
    added.map((entry) => entry.fontId),
    ["baloo-2-800", "nunito-400"],
  );
  const listed = inspectAssets(project.assets, {});
  assert.equal(listed.total, 2);
  assert.deepEqual(
    listed.items.map((item) => item.kind === "font" && [item.family, item.weight]),
    [
      ["Baloo 2", 800],
      ["Nunito", 400],
    ],
  );
  const scene = project.artboards[0]?.scene;
  assert.ok(scene);
  const titulo = flattenScene(scene).find(({ node }) => node.id === "node-titulo")?.node;
  assert.equal(titulo?.fontAssetId, added[0]?.assetId);
  assert.equal(titulo?.attrs["font-weight"], "800");
  assert.equal(titulo?.attrs["font-family"], "Baloo 2");
  // pt-BR: accents, cedilla, capitals and punctuation, nothing missing in either font.
  for (const id of ["node-titulo", "node-apoio"]) {
    const coverage = inspectFontCoverage(scene, project.assets, { id });
    assert.equal(coverage.source, "embedded");
    assert.deepEqual(coverage.coverage?.missing, [], id);
  }
  // The OFL notice is readable, the license text included.
  const notice = inspectAssetNotice(project.assets, {
    id: added[0]?.assetId,
    field: "licenseNotice",
  });
  assert.match(JSON.stringify(notice), /Baloo 2 Project Authors/);
  assert.match(JSON.stringify(notice), /SIL OPEN FONT LICENSE Version 1\.1/);
  // The same font again (add and set-font) is the same asset: the catalog does not grow.
  const again = await edit(project, [
    { type: "asset", operation: "add-library-font", fontId: "baloo-2-800" },
    { type: "asset", operation: "set-font", targetId: "node-apoio", libraryFontId: "baloo-2-800" },
  ]);
  assert.equal(again.project.assets.length, 2);
  // A command that names a library font without the editor's resolution says so.
  assert.throws(
    () =>
      executeDocumentTransaction(
        { project, sessionId: "00000000-0000-4000-8000-000000000000", revision: 0 },
        {
          projectId: project.id,
          sessionId: "00000000-0000-4000-8000-000000000000",
          revision: 0,
          commands: [{ type: "asset", operation: "add-library-font", fontId: "nunito-400" }],
        },
      ),
    /não resolvida/,
  );
});

test("project defaults: a new text is born in the title font; apply to all by weight; v27", async () => {
  const start = withTexts([
    text("node-numero", "42", "bold"),
    text("node-apoio", "Some os números"),
  ]);
  const { project } = await edit(start, [
    {
      type: "fonts",
      operation: "set-defaults",
      headingLibraryFontId: "baloo-2-800",
      bodyLibraryFontId: "nunito-400",
    },
  ]);
  const fonts = defaultFonts(project);
  assert.equal(fonts.heading?.family, "Baloo 2");
  assert.equal(fonts.body?.family, "Nunito");
  assert.equal(project.version, PROJECT_VERSION);
  assert.equal(PROJECT_VERSION, 27);
  // A new text (as the toolbar and the assistant make it) takes the title font.
  const added = await edit(project, [
    { type: "scene", operation: "add", targetId: null, value: "text" },
  ]);
  const scene = added.project.artboards[0]?.scene;
  const born = flattenScene(scene ?? { viewBox: [0, 0, 1, 1], nodes: [] }).find(
    ({ node }) => node.text === "Seu texto",
  )?.node;
  assert.equal(born?.fontAssetId, fonts.heading?.id);
  assert.equal(born?.attrs["font-weight"], "800");
  // Apply to all: bold → title, the rest → body; a locked text stays.
  const locked = parseProject({
    ...added.project,
    artboards: added.project.artboards.map((board) => ({
      ...board,
      scene: {
        ...board.scene,
        nodes: [...board.scene.nodes, { ...text("node-trancado", "Fixo"), locked: true }],
      },
    })),
  });
  const applied = await edit(locked, [{ type: "fonts", operation: "apply-defaults" }]);
  const nodes = new Map(
    flattenScene(applied.project.artboards[0]?.scene ?? { viewBox: [0, 0, 1, 1], nodes: [] }).map(
      ({ node }) => [node.id, node],
    ),
  );
  assert.equal(nodes.get("node-numero")?.fontAssetId, fonts.heading?.id);
  assert.equal(nodes.get("node-apoio")?.fontAssetId, fonts.body?.id);
  assert.equal(nodes.get("node-apoio")?.attrs["font-family"], "Nunito");
  assert.equal(nodes.get("node-trancado")?.fontAssetId, undefined);
  // Title / body on chosen texts.
  const role = await edit(applied.project, [
    { type: "fonts", operation: "apply-defaults", role: "heading", targetIds: ["node-apoio"] },
  ]);
  const apoio = flattenScene(
    role.project.artboards[0]?.scene ?? { viewBox: [0, 0, 1, 1], nodes: [] },
  )
    .map(({ node }) => node)
    .find((node) => node.id === "node-apoio");
  assert.equal(apoio?.fontAssetId, fonts.heading?.id);
  // A default font cannot leave the catalog while it is the default.
  await assert.rejects(
    edit(withTexts([]), [
      { type: "fonts", operation: "set-defaults", headingLibraryFontId: "baloo-2-800" },
    ]).then(({ project: only }) =>
      edit(only, [{ type: "asset", operation: "remove", assetId: defaultFonts(only).heading?.id }]),
    ),
    /fontes padrão do projeto/,
  );
  // Saved and opened again, the defaults stay; v26 cannot carry them, and opens as v27 without.
  const roundTrip = parseProject(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(roundTrip.defaults, project.defaults);
  assert.throws(() => parseProject({ ...JSON.parse(JSON.stringify(project)), version: 26 }), /v27/);
  const old = { ...JSON.parse(JSON.stringify(start)), version: 26 };
  const migrated = parseProject(old);
  assert.equal(migrated.version, 27);
  assert.equal(migrated.defaults, undefined);
  assert.deepEqual(migrated.artboards, start.artboards);
});

test("a new project is born with the preferred fonts, and is still a blank one", async () => {
  const dir = mkdtempSync(join(tmpdir(), "edisvg-fonts-"));
  const preference = createFontPreference(join(dir, "fontes-padrao.json"));
  assert.deepEqual(await preference.read(), DEFAULT_LIBRARY_FONTS);
  const project = await withDefaultFonts(newProject(), source, await preference.read());
  const fonts = defaultFonts(project);
  assert.equal(fonts.heading?.family, "Baloo 2");
  assert.equal(fonts.heading?.weight, 800);
  assert.equal(fonts.body?.family, "Nunito");
  assert.equal(fonts.body?.weight, 400);
  assert.equal(project.assets.length, 2);
  // Another choice is kept for the next projects; a face the library lacks is refused.
  await preference.write({ heading: "nunito-800", body: "nunito-400" });
  assert.match(readFileSync(join(dir, "fontes-padrao.json"), "utf8"), /nunito-800/);
  const other = await withDefaultFonts(newProject(), source, await preference.read());
  assert.equal(defaultFonts(other).heading?.weight, 800);
  assert.equal(defaultFonts(other).heading?.family, "Nunito");
  await assert.rejects(preference.write({ heading: "../x", body: "nunito-400" }));
  // A broken install opens the project without defaults.
  const broken = await withDefaultFonts(
    newProject(),
    { dir: join(dir, "nada"), manifest: join(dir, "nada.json") },
    DEFAULT_LIBRARY_FONTS,
  );
  assert.equal(broken.defaults, undefined);
  // "Novo" makes it with them, and it gives way to another file without asking.
  let asked = 0;
  const files = createProjectFiles({
    chooseSave: async () => null,
    chooseOpen: async () => null,
    confirm: async () => {
      asked++;
      return "cancel";
    },
    write: async () => {},
    exists: () => false,
    blank: async () => project,
  });
  await files.recover(project, { persist: false });
  // The untouched new project gives way to the one another tool asks for, without the question.
  const made = await files.openLinked(join(dir, "Aula.edisvg"), "Aula");
  assert.equal(made?.project.name, "Aula");
  assert.equal(made?.project.assets.length, 2);
  assert.equal(asked, 0);
});
