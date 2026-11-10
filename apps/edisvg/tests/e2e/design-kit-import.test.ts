import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { crc32, deflateSync } from "node:zlib";
import { chromium } from "playwright";
import { parseProject } from "../../src/shared/project";
import { rendererServer } from "../rendererServer";

/** A red PNG of `size`×`size`, a kit's character. */
function png(size: number): number[] {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const row = [0, ...Array.from({ length: size }, () => [220, 30, 40, 255]).flat()];
  const raw = Buffer.from(Array.from({ length: size }, () => row).flat());
  return [
    ...Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", header),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  ];
}

const swatch = (x: number, name: string, color: string) =>
  `<rect x="${x}" y="10" width="120" height="70" rx="12" fill="${color}"/><text x="${x}" y="98" font-size="13">${name}</text><text x="${x}" y="114" font-size="12">${color}</text>`;

/**
 * A kit as the main process hands it (src/main/designKit.ts): a palette sheet, a balloon whose
 * texts name Baloo 2 and Nunito, a character PNG, and 100 icons (more than a project holds).
 */
const KIT = {
  name: "Kit-Teste",
  left: ["LEIA-ME.txt"],
  files: [
    {
      path: "paleta-cores.svg",
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="130" viewBox="0 0 400 130">${swatch(10, "tinta", "#0f1a33")}${swatch(140, "azul", "#1b5cf3")}${swatch(270, "amarelo", "#ffc02e")}</svg>`,
    },
    {
      path: "baloes/balao-dica.svg",
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="88" viewBox="0 0 420 88"><path d="M32,4 H396 A16,16 0 0 1 412,20 V68 A16,16 0 0 1 396,84 H32 A16,16 0 0 1 16,68 V66 L4,60 L16,54 V20 A16,16 0 0 1 32,4 Z" fill="#fff3c4" stroke="#e8a317" stroke-width="1.6"/><text x="34" y="38" font-family="'Baloo 2', Nunito, sans-serif" font-size="18" font-weight="800" fill="#0f1a33">Dica do Zappy</text><text x="34" y="64" font-family="Nunito, sans-serif" font-size="16" font-weight="400" fill="#0f1a33">Clique na bandeira verde.</text></svg>`,
    },
    { path: "personagens/bola.png", png: png(8) },
    ...Array.from({ length: 100 }, (_, i) => ({
      path: `icones/icone-${String(i).padStart(3, "0")}.svg`,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M4 12 L10 18 L20 6" fill="none" stroke="#0f1a33" stroke-width="2"/></svg>`,
    })),
  ],
};

/** EdiAula's fonts, as the main process hands them (the files the installer copies). */
const FONTS = Object.fromEntries(
  [
    ["Baloo 2 800", "Baloo2-800.ttf"],
    ["Nunito 400", "Nunito-400.ttf"],
  ].map(([key, file]) => [
    key,
    {
      name: file,
      base64: readFileSync(
        new URL(`../../../ediaula/resources/fonts/${file}`, import.meta.url),
      ).toString("base64"),
    },
  ]),
);

const fakeDesktop = `
  (() => {
    const kit = ${JSON.stringify(KIT)};
    window.desktop = {
      projectChanged: async () => ({ name: "Sem arquivo", path: null, dirty: true }),
      importDesignKit: async () => ({
        ...kit,
        files: kit.files.map((f) => (f.png ? { path: f.path, png: new Uint8Array(f.png) } : f)),
      }),
      pipelineFonts: async () => [
        { family: "Baloo 2", group: "Infantil", weights: [400, 600, 700, 800] },
        { family: "Nunito", group: "Arredondada", weights: [400, 600, 700, 800, 900] },
      ],
      pipelineFont: async (family, weight) => {
        const font = ${JSON.stringify(FONTS)}[family + " " + weight];
        if (!font) throw new Error("A fonte " + family + " não vem com o EdiSVG.");
        window.__fontsAsked = [...(window.__fontsAsked ?? []), family + " " + weight];
        return {
          family,
          weight,
          name: font.name,
          bytes: Uint8Array.from(atob(font.base64), (c) => c.charCodeAt(0)),
          notice: "Copyright The Authors. SIL Open Font License 1.1.",
        };
      },
    };
  })();`;

test("a design kit: the folders that fit, 'Kit ·' artboards with its palette and fonts, one edit", {
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
    const before = await page.evaluate(() => localStorage.getItem("edisvg-project"));
    await page.locator('[data-action="import-kit"]').first().click();
    const dialog = page.getByRole("dialog", { name: "Importar kit de design" });
    await dialog.getByText("Pastas do kit").waitFor();
    const folders = dialog.getByRole("checkbox");
    // 103 artboards do not fit beside the one there: the icons (the largest folder) start out.
    assert.deepEqual(
      await folders.evaluateAll((boxes) =>
        boxes.map((b) => [(b as HTMLInputElement).value, (b as HTMLInputElement).checked]),
      ),
      [
        ["", true],
        ["baloes", true],
        ["icones", false],
        ["personagens", true],
      ],
    );
    await dialog.getByText("3 pranchetas escolhidas; cabem 99 neste projeto").waitFor();
    await dialog.getByText("Paleta: 3 cores de paleta-cores.svg").waitFor();
    await dialog.getByText(/Fontes que o kit usa e o EdiSVG tem: Baloo 2, Nunito\./).waitFor();
    const confirm = dialog.getByRole("button", { name: /^Importar \d+ pranchetas?$/ });
    await dialog.getByRole("checkbox", { checked: false }).check();
    await dialog.getByText(/103 pranchetas escolhidas; cabem 99 .* Desmarque pastas/).waitFor();
    assert.equal(await confirm.isDisabled(), true);
    await page.screenshot({ path: "test-results/design-kit-dialog.png" });
    await dialog.locator('input[value="icones"]').uncheck();
    await confirm.click();
    await page
      .getByText(/Kit "Kit-Teste" importado: 3 pranchetas "Kit · …" \(2 SVG, 1 PNG\)/)
      .waitFor();
    await page
      .getByText(
        /Fontes incorporadas: Baloo 2 800, Nunito 400 \(2 textos\)\..*Ficaram de fora: LEIA-ME\.txt\./,
      )
      .waitFor();
    assert.equal(await dialog.isVisible(), false);
    await page.screenshot({ path: "test-results/design-kit-imported.png" });

    const project = parseProject(
      JSON.parse((await page.evaluate(() => localStorage.getItem("edisvg-project"))) ?? "null"),
    );
    assert.deepEqual(
      project.artboards.map((board) => [board.name, board.scene.viewBox.slice(2)]),
      [
        ["Prancheta 1", [1080, 1080]],
        ["Kit · paleta-cores", [400, 130]],
        ["Kit · baloes · balao-dica", [420, 88]],
        ["Kit · personagens · bola", [8, 8]],
      ],
    );
    const colors = ["#0f1a33", "#1b5cf3", "#ffc02e"];
    // Every kit artboard and the one open offer the kit's colours.
    for (const board of project.artboards)
      assert.deepEqual(board.scene.palette, colors, board.name);
    // The open artboard stays the open one.
    await page.locator(".scene-tree-heading small", { hasText: "1080 × 1080" }).waitFor();
    const fonts = new Map(
      project.assets
        .filter((asset) => asset.kind === "font")
        .map((asset) => [asset.id, `${asset.family} ${asset.weight}`]),
    );
    const balloon = project.artboards[2]?.scene.nodes.filter((node) => node.tag === "text") ?? [];
    assert.deepEqual(
      balloon.map((node) => [
        node.text,
        fonts.get(node.fontAssetId ?? ""),
        node.attrs["font-weight"],
      ]),
      [
        ["Dica do Zappy", "Baloo 2 800", "800"],
        ["Clique na bandeira verde.", "Nunito 400", "400"],
      ],
    );
    assert.deepEqual(
      await page.evaluate(() => (window as { __fontsAsked?: string[] }).__fontsAsked),
      ["Baloo 2 800", "Nunito 400"],
    );
    const image = project.artboards[3]?.scene.nodes[0];
    assert.equal(image?.tag, "image");
    assert.equal(project.assets.find((asset) => asset.id === image?.assetId)?.kind, "image");

    // The whole import is one edit.
    await page.locator('[data-action="undo"]').click();
    assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), before);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});
