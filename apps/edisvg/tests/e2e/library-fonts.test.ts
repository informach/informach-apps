import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { chromium, type Page } from "playwright";
import { parseProject } from "../../src/shared/project";
import { rendererServer } from "../rendererServer";

/** EdiSVG's library as the main process hands it: the bundle's files, by id. */
const FILES: Record<string, { family: string; weight: number; file: string }> = {
  "baloo-2-800": { family: "Baloo 2", weight: 800, file: "Baloo2-800.ttf" },
  "nunito-400": { family: "Nunito", weight: 400, file: "Nunito-400.ttf" },
};
const base64 = Object.fromEntries(
  Object.entries(FILES).map(([id, font]) => [
    id,
    readFileSync(
      new URL(`../../../ediaula/resources/fonts/${font.file}`, import.meta.url),
    ).toString("base64"),
  ]),
);

const fakeDesktop = `
  (() => {
    const files = ${JSON.stringify(FILES)};
    const data = ${JSON.stringify(base64)};
    window.__preference = { heading: "baloo-2-800", body: "nunito-400" };
    window.desktop = {
      projectChanged: async () => ({ name: "Sem arquivo", path: null, dirty: true }),
      fontLibrary: async () =>
        Object.entries(files).map(([id, font]) => ({
          id, family: font.family, weight: font.weight, style: "normal", format: "truetype",
          group: "Infantil", license: "SIL Open Font License 1.1",
        })),
      libraryFont: async (id) => {
        const font = files[id];
        if (!font) throw new Error("A fonte " + id + " não vem com o EdiSVG.");
        return {
          family: font.family, weight: font.weight, name: font.file,
          bytes: Uint8Array.from(atob(data[id]), (c) => c.charCodeAt(0)),
          notice: "Copyright The Authors. SIL Open Font License 1.1.",
        };
      },
      fontPreference: async () => window.__preference,
      setFontPreference: async (value) => (window.__preference = value),
    };
  })();`;

const stored = async (page: Page) => {
  const text = await page.evaluate(() => localStorage.getItem("edisvg-project"));
  assert.ok(text);
  return parseProject(JSON.parse(text));
};
const texts = async (page: Page) =>
  (await stored(page)).artboards[0]?.scene.nodes.filter((node) => node.tag === "text") ?? [];

test("a library font from the text panel: in the catalog once, on the text at once, undo/redo", {
  timeout: 90000,
}, async () => {
  const server = await rendererServer(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(server.url);
    await page.locator(".scene-artwork>svg").waitFor();
    await page.evaluate(fakeDesktop);
    // A text, made with the Text tool.
    await page.locator('[data-tool="text"]').click();
    await page.locator(".scene-artwork>svg").click({ position: { x: 300, y: 300 } });
    await page.locator('[data-text-panel] textarea[name="text"]').waitFor();
    const select = page.getByLabel("Fonte incorporada");
    // The library's faces are offered in their own group.
    await page
      .locator('optgroup[label="Do EdiSVG"] option', { hasText: "Baloo 2 ExtraBold" })
      .waitFor({
        state: "attached",
      });
    const before = await page.evaluate(() => localStorage.getItem("edisvg-project"));
    await select.selectOption({ label: "Baloo 2 ExtraBold" });
    await page.waitForFunction(
      () => JSON.parse(localStorage.getItem("edisvg-project") ?? "{}").assets?.length === 1,
    );
    let project = await stored(page);
    const baloo = project.assets[0];
    assert.equal(baloo?.kind === "font" && baloo.family, "Baloo 2");
    let [node] = await texts(page);
    assert.equal(node?.fontAssetId, baloo?.id);
    assert.equal(node?.attrs["font-weight"], "800");
    // Now the project's: listed once, selected, drawn with the embedded face.
    await page
      .locator('optgroup[label="Do projeto"] option', { hasText: "Baloo 2 ExtraBold" })
      .waitFor({
        state: "attached",
      });
    assert.equal(
      await page.locator('optgroup[label="Do EdiSVG"] option', { hasText: "Baloo 2" }).count(),
      0,
    );
    assert.equal(await select.inputValue(), baloo?.id);
    // The canvas draws the text with the embedded face (edi-<asset id>), loaded, not a fallback.
    await page.waitForFunction((family) => {
      const face = [...document.fonts].find((item) => item.family.replaceAll('"', "") === family);
      const drawn = document.querySelector(".scene-artwork>svg text");
      return (
        face?.status === "loaded" &&
        !!drawn &&
        getComputedStyle(drawn).fontFamily.replaceAll('"', "").startsWith(family)
      );
    }, `edi-${baloo?.id}`);
    // The same font again does not grow the catalog.
    await select.selectOption({ label: "Baloo 2 ExtraBold" });
    project = await stored(page);
    assert.equal(project.assets.length, 1);
    // One undo step: back to the system font and an empty catalog; redo brings both.
    await page.locator('[data-action="undo"]').click();
    assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), before);
    await page.locator('[data-action="redo"]').click();
    [node] = await texts(page);
    assert.equal(node?.fontAssetId, baloo?.id);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});

test("Fontes do projeto: defaults from the library, a new text in the title one, apply to all", {
  timeout: 90000,
}, async () => {
  const server = await rendererServer(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(server.url);
    await page.locator(".scene-artwork>svg").waitFor();
    await page.evaluate(fakeDesktop);
    // An old text, before any default.
    await page.locator('[data-tool="text"]').click();
    await page.locator(".scene-artwork>svg").click({ position: { x: 300, y: 300 } });
    await page.locator('[data-text-panel] textarea[name="text"]').waitFor();
    assert.equal((await texts(page))[0]?.fontAssetId, undefined);
    // Fontes do projeto, from the text panel.
    await page.getByRole("button", { name: "Fontes do projeto…" }).click();
    const dialog = page.getByRole("dialog", { name: "Fontes do projeto" });
    const [heading, body] = [
      dialog.getByLabel("Título e números").first(),
      dialog.getByLabel("Corpo (textos de apoio)").first(),
    ];
    await heading.selectOption({ label: "Baloo 2 ExtraBold" });
    await body.selectOption({ label: "Nunito Regular" });
    await dialog.getByRole("button", { name: "Salvar fontes deste projeto" }).click();
    await dialog.getByText("Fontes padrão do projeto salvas.").waitFor();
    let project = await stored(page);
    assert.equal(project.version, 27);
    assert.equal(project.assets.length, 2);
    const ids = project.defaults?.fonts;
    assert.ok(ids?.heading && ids.body);
    // Apply to all: the old text (normal weight) takes the body font.
    await dialog.getByRole("button", { name: "Aplicar fontes padrão a todos os textos" }).click();
    await dialog.getByText("Fontes padrão aplicadas aos textos.").waitFor();
    assert.equal((await texts(page))[0]?.fontAssetId, ids.body);
    // New projects: the preference goes to the main process.
    await dialog.getByLabel("Título e números").nth(1).selectOption({ label: "Nunito Regular" });
    await dialog.getByRole("button", { name: "Salvar para projetos novos" }).click();
    await dialog.getByText("Os projetos novos vão nascer com essas fontes.").waitFor();
    assert.deepEqual(
      await page.evaluate(() => (window as unknown as { __preference: unknown }).__preference),
      {
        heading: "nunito-400",
        body: "nunito-400",
      },
    );
    await dialog.getByRole("button", { name: "Fechar", exact: true }).click();
    // A new text is born in the title font; Corpo switches it.
    await page.locator('[data-tool="text"]').click();
    await page.locator(".scene-artwork>svg").click({ position: { x: 250, y: 200 } });
    await page.locator('[data-text-panel] textarea[name="text"]').waitFor();
    project = await stored(page);
    const born = (await texts(page)).at(-1);
    assert.equal(born?.fontAssetId, ids.heading);
    await page.getByRole("button", { name: /^Corpo · Nunito Regular/ }).click();
    await page.waitForFunction(
      (id) =>
        JSON.parse(localStorage.getItem("edisvg-project") ?? "{}").artboards[0].scene.nodes.at(-1)
          .fontAssetId === id,
      ids.body,
    );
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});

test("the HTML export embeds Baloo 2 and Nunito: the texts draw in them, not in a fallback", {
  timeout: 60000,
}, async () => {
  const { buildInteractiveExport } = await import("../../src/renderer/src/behavior/export");
  const { executeDocumentTransaction } = await import("../../src/shared/documentCommands");
  const { libraryFontAsset, resolveLibraryFonts } = await import("../../src/shared/fontLibrary");
  const { newProject } = await import("../../src/shared/project");
  const { readFile, writeFile } = await import("node:fs/promises");
  const font = (id: string) => {
    const entry = FILES[id];
    assert.ok(entry);
    return libraryFontAsset({
      family: entry.family,
      weight: entry.weight,
      name: entry.file,
      bytes: new Uint8Array(Buffer.from(base64[id] ?? "", "base64")),
      notice: "Copyright The Authors. SIL Open Font License 1.1.",
    });
  };
  const start = newProject();
  const node = (id: string, y: number, value: string) => ({
    id,
    name: id,
    tag: "text" as const,
    attrs: { x: "60", y: String(y), "font-size": "96", "font-family": "Arial", fill: "#14213d" },
    text: value,
    children: [],
    transform: { x: 0, y: 0, rotation: 0, sx: 1, sy: 1, opacity: 100 },
    visible: true,
    locked: false,
  });
  start.artboards[0]?.scene.nodes.push(
    node("node-titulo", 300, "Ação 2 + 3 = 5!"),
    node("node-apoio", 500, "Coração, pão e você"),
  );
  const fonts = new Map([
    ["baloo-2-800", font("baloo-2-800")],
    ["nunito-400", font("nunito-400")],
  ]);
  const { commands } = resolveLibraryFonts(
    [
      {
        type: "asset",
        operation: "set-font",
        targetId: "node-titulo",
        libraryFontId: "baloo-2-800",
      },
      { type: "asset", operation: "set-font", targetId: "node-apoio", libraryFontId: "nunito-400" },
    ],
    fonts,
  );
  const sessionId = "00000000-0000-4000-8000-000000000000";
  const project = parseProject(
    executeDocumentTransaction(
      { project: parseProject(start), sessionId, revision: 0 },
      { projectId: start.id, sessionId, revision: 0, commands },
    ).project,
  );
  const html = buildInteractiveExport(
    project,
    { format: "interactive-html", alt: "Fontes da biblioteca", reduced: true, offscreen: false },
    await readFile("out/renderer/edi-player.global.js", "utf8"),
  );
  const channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    await page.setContent(html.content);
    await page.waitForFunction(
      () =>
        !!Reflect.get(window, "ediSVGInteractivePlayer") ||
        !!document.querySelector("#player-status")?.textContent,
    );
    assert.equal(await page.locator("#player-status").textContent(), "");
    const drawn = await page.evaluate(async () => {
      await document.fonts.ready;
      return [...document.querySelectorAll("#edi-artwork svg text")].map((text) => {
        const shape = text as SVGTextElement;
        const family =
          (shape.getAttribute("font-family") ?? "").split(",")[0]?.replaceAll('"', "").trim() ?? "";
        const face = [...document.fonts].find((item) => item.family.replaceAll('"', "") === family);
        // The same text in the fallback the attribute names, to see the embedded face is the one drawn.
        const probe = document.createElementNS("http://www.w3.org/2000/svg", "text");
        probe.textContent = shape.textContent;
        probe.setAttribute("font-size", shape.getAttribute("font-size") ?? "96");
        probe.setAttribute("font-family", "Arial");
        shape.ownerSVGElement?.append(probe);
        const fallback = probe.getComputedTextLength();
        probe.remove();
        return {
          family,
          status: face?.status ?? null,
          length: shape.getComputedTextLength(),
          fallback,
        };
      });
    });
    assert.equal(drawn.length, 2);
    for (const [index, id] of ["baloo-2-800", "nunito-400"].entries()) {
      const text = drawn[index];
      assert.equal(text?.family, `edi-${fonts.get(id)?.id}`);
      assert.equal(text?.status, "loaded");
      assert.notEqual(Math.round(text?.length ?? 0), Math.round(text?.fallback ?? 0));
    }
    const shot = process.env.EDISVG_FONT_SHOT;
    if (shot) await writeFile(shot, await page.locator("#edi-artwork").screenshot());
  } finally {
    await browser.close();
  }
});

test("video frames (the raster export behind WebM and MP4) draw the library fonts", {
  timeout: 180000,
}, async () => {
  const { rasterTestBundle } = await import("../rasterBundle");
  const { executeDocumentTransaction } = await import("../../src/shared/documentCommands");
  const { libraryFontAsset, resolveLibraryFonts } = await import("../../src/shared/fontLibrary");
  const { newProject } = await import("../../src/shared/project");
  const { writeFile } = await import("node:fs/promises");
  const { unzipSync } = await import("fflate");
  const font = (id: string) => {
    const entry = FILES[id];
    assert.ok(entry);
    return libraryFontAsset({
      family: entry.family,
      weight: entry.weight,
      name: entry.file,
      bytes: new Uint8Array(Buffer.from(base64[id] ?? "", "base64")),
      notice: "Copyright The Authors. SIL Open Font License 1.1.",
    });
  };
  const start = newProject();
  const node = (id: string, y: number, value: string) => ({
    id,
    name: id,
    tag: "text" as const,
    attrs: { x: "60", y: String(y), "font-size": "110", "font-family": "Arial", fill: "#14213d" },
    text: value,
    children: [],
    transform: { x: 0, y: 0, rotation: 0, sx: 1, sy: 1, opacity: 100 },
    visible: true,
    locked: false,
  });
  start.artboards[0]?.scene.nodes.push(
    node("node-titulo", 400, "Ação 2 + 3 = 5!"),
    node("node-apoio", 640, "Coração, pão e você"),
  );
  start.motion.animations.push({
    id: "anim-entrada",
    name: "Entrada",
    fps: 10,
    frames: 2,
    mode: "once",
    tracks: [
      {
        id: "track-titulo-x",
        targetId: "node-titulo",
        property: "x",
        keys: [
          { id: "key-a", frame: 0, value: 0, easing: "linear" },
          { id: "key-b", frame: 2, value: 0, easing: "linear" },
        ],
      },
    ],
  });
  const plain = parseProject(start);
  const { commands } = resolveLibraryFonts(
    [
      {
        type: "asset",
        operation: "set-font",
        targetId: "node-titulo",
        libraryFontId: "baloo-2-800",
      },
      { type: "asset", operation: "set-font", targetId: "node-apoio", libraryFontId: "nunito-400" },
    ],
    new Map([
      ["baloo-2-800", font("baloo-2-800")],
      ["nunito-400", font("nunito-400")],
    ]),
  );
  const sessionId = "00000000-0000-4000-8000-000000000000";
  const embedded = parseProject(
    executeDocumentTransaction(
      { project: plain, sessionId, revision: 0 },
      { projectId: plain.id, sessionId, revision: 0, commands },
    ).project,
  );
  const server = await rendererServer(
      new Map([["/raster.html", { content: "<!doctype html><body></body>", mime: "text/html" }]]),
    ),
    code = await rasterTestBundle(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage();
    await page.goto(`${server.url}/raster.html`);
    await page.addScriptTag({ content: code });
    const frame = async (project: unknown) => {
      const bytes = await page.evaluate(async (project) => {
        const api = (window as unknown as { EdiRasterTest: typeof import("../rasterBrowser") })
          .EdiRasterTest;
        const result = await api.buildRasterExport(project as never, {
          artboardId: "artboard-main",
          animationId: "anim-entrada",
          width: 540,
          height: 540,
          fps: 10,
          format: "png-sequence",
          background: "#ffffff",
          confirmRaster: true,
          confirmAnimationOnly: true,
          confirmPalette: true,
        });
        return Array.from(result.content);
      }, project);
      const png = unzipSync(Uint8Array.from(bytes))["quadro-00000.png"];
      assert.ok(png);
      return png;
    };
    const withFonts = await frame(embedded);
    const fallback = await frame(plain);
    // The embedded faces change the drawing: the frame is not the fallback's.
    assert.notDeepEqual(Buffer.from(withFonts), Buffer.from(fallback));
    const shot = process.env.EDISVG_FONT_SHOT;
    if (shot) await writeFile(shot.replace(/\.png$/, "-video.png"), withFonts);
  } finally {
    await browser.close();
    await server.close();
  }
});
