import assert from "node:assert/strict";
import { test } from "node:test";
import type { DesignKit } from "../../shared/designKit";
import {
  choosePlan,
  defaultFolders,
  fontFamilies,
  imageScene,
  isPaletteSheet,
  kitBoardName,
  kitFonts,
  kitGroups,
  kitSummary,
  mergedPalette,
  planDesignKit,
  setKitFonts,
  sheetColors,
} from "./designKitImport";
import type { ImportedScene } from "./szProjectImport";

/**
 * The SVG import stands in for svgImport.js (it needs a DOM): a scene whose nodes are given as
 * JSON in the "SVG" text, or a refusal for "ruim".
 */
const toScene = (svg: string): ImportedScene => {
  if (svg === "ruim") {
    const error = new Error("Elemento script não suportado.");
    error.name = "SvgImportError";
    throw error;
  }
  return { viewBox: [0, 0, 100, 50], nodes: JSON.parse(svg) };
};
const text = (value: string, attrs: Record<string, string> = {}) => ({
  tag: "text",
  text: value,
  attrs,
  children: [],
});
const rect = (fill: string) => ({ tag: "rect", text: "", attrs: { fill }, children: [] });

const sheet = JSON.stringify([
  rect("#e9eef6"),
  text("chao"),
  text("#e9eef6"),
  rect("#1b5cf3"),
  text("azul"),
  text("#1B5CF3"),
  // The same colour twice is listed once.
  text("azul-de-novo"),
  text("#1b5cf3"),
]);
const balloon = JSON.stringify([
  { tag: "path", text: "", attrs: { fill: "#fff3c4", stroke: "#e8a317" }, children: [] },
  text("Dica do Zappy", { "font-family": "'Baloo 2', Nunito, sans-serif", "font-weight": "800" }),
  text("Clique na bandeira verde.", { "font-family": "Nunito, sans-serif", "font-weight": "400" }),
]);
const png = new Uint8Array([137, 80, 78, 71]);

const kit: DesignKit = {
  name: "Kit-Aulas",
  files: [
    { path: "baloes/balao-dica.svg", svg: balloon },
    { path: "personagens/zappy-feliz.png", png },
    { path: "paleta-cores.svg", svg: sheet },
    { path: "icones/check.svg", svg: JSON.stringify([rect("#0f1a33")]) },
    { path: "icones/script.svg", svg: "ruim" },
  ],
  left: ["LEIA-ME.txt"],
};

test("a kit's pieces become 'Kit · folder · file' artboards, the palette sheet first, and its PNGs images", () => {
  const plan = planDesignKit(kit, toScene);
  assert.deepEqual(
    plan.boards.map((b) => b.name),
    ["Kit · paleta-cores", "Kit · baloes · balao-dica", "Kit · icones · check"],
  );
  assert.deepEqual(
    plan.images.map((i) => [i.name, i.file]),
    [["Kit · personagens · zappy-feliz", "zappy-feliz"]],
  );
  assert.equal(plan.sheet, "paleta-cores.svg");
  assert.deepEqual(plan.palette, [
    { name: "chao", color: "#e9eef6" },
    { name: "azul", color: "#1b5cf3" },
  ]);
  assert.deepEqual(plan.left, [
    "LEIA-ME.txt",
    "icones/script.svg (Elemento script não suportado.)",
  ]);
});

test("without a palette sheet, the kit's colours are the ones its pieces use most", () => {
  const plan = planDesignKit(
    { ...kit, files: kit.files.filter((f) => f.path !== "paleta-cores.svg") },
    toScene,
  );
  assert.equal(plan.sheet, null);
  assert.deepEqual(
    plan.palette.map((c) => c.color),
    ["#0f1a33", "#e8a317", "#fff3c4"],
  );
  // A sheet without colour texts gives its shapes' fills.
  assert.deepEqual(
    sheetColors({ viewBox: [0, 0, 1, 1], nodes: [rect("#ABCDEF"), rect("#abcdef"), rect("none")] }),
    [{ name: "#abcdef", color: "#abcdef" }],
  );
});

test("a kit with nothing that imports is refused, saying what was left out", () => {
  assert.throws(
    () => planDesignKit({ name: "x", files: [{ path: "a.svg", svg: "ruim" }], left: [] }, toScene),
    /Nenhum arquivo do kit pôde ser importado\. Ficaram de fora: a\.svg/,
  );
});

test("names, palette sheets and font stacks are read as a kit writes them", () => {
  assert.equal(kitBoardName("baloes/sub/balao.svg"), "Kit · baloes · sub · balao");
  assert.equal(kitBoardName(`${"x".repeat(200)}.svg`).length, 120);
  for (const name of ["paleta-cores.svg", "kit/Palette.svg", "cores.svg", "colors-v2.svg"])
    assert.equal(isPaletteSheet(name), true, name);
  for (const name of ["paletas.png", "icones/cor.svg", "minha-paleta.svg"])
    assert.equal(isPaletteSheet(name), false, name);
  assert.deepEqual(fontFamilies(`'Baloo 2', "Nunito", sans-serif`), ["Baloo 2", "Nunito"]);
  assert.deepEqual(fontFamilies(undefined), []);
});

test("texts take the bundled font they name (first of the stack EdiSVG has), in the nearest weight", () => {
  const plan = planDesignKit(kit, toScene);
  const scenes = plan.boards.map((b) => b.scene);
  const families = [
    { family: "Baloo 2", group: "Títulos", weights: [400, 600, 700, 800] },
    { family: "Nunito", group: "Texto", weights: [400, 700] },
  ];
  // A group passes its font down; an unknown family is named once and left to the system.
  scenes.push({
    viewBox: [0, 0, 1, 1],
    nodes: [
      {
        tag: "g",
        attrs: { "font-family": "Nunito", "font-weight": "bold" },
        children: [text("herdado"), text("outra", { "font-family": "Comic Sans" })],
      },
    ],
  });
  const needs = kitFonts(scenes, families);
  assert.deepEqual(needs.wanted, [
    { family: "Baloo 2", weight: 800 },
    { family: "Nunito", weight: 400 },
    { family: "Nunito", weight: 700 },
  ]);
  assert.deepEqual(needs.missing, ["Comic Sans"]);
  const embedded = needs.wanted.map((w) => ({
    ...w,
    assetId: `asset-${w.family}-${w.weight}`,
    italic: false,
  }));
  assert.equal(setKitFonts(scenes, families, embedded), 3);
  const texts = scenes.flatMap((s) =>
    JSON.parse(JSON.stringify(s.nodes)).flatMap(function all(n: {
      tag: string;
      text: string;
      fontAssetId?: string;
      attrs: Record<string, string>;
      children: unknown[];
    }): unknown[] {
      return [
        ...(n.tag === "text"
          ? [[n.text, n.fontAssetId ?? null, n.attrs["font-weight"] ?? null]]
          : []),
        ...(n.children as (typeof n)[]).flatMap(all),
      ];
    }),
  );
  assert.deepEqual(texts, [
    ["chao", null, null],
    ["#e9eef6", null, null],
    ["azul", null, null],
    ["#1B5CF3", null, null],
    ["azul-de-novo", null, null],
    ["#1b5cf3", null, null],
    ["Dica do Zappy", "asset-Baloo 2-800", "800"],
    ["Clique na bandeira verde.", "asset-Nunito-400", "400"],
    ["herdado", "asset-Nunito-700", "700"],
    ["outra", null, null],
  ]);
});

test("a project holds 100 artboards: the folders that fit are checked, the largest left out first", () => {
  const plan = planDesignKit(kit, toScene);
  const groups = kitGroups(plan);
  assert.deepEqual(
    groups.map((g) => [g.folder, g.count, g.sample]),
    [
      ["", 1, ["paleta-cores"]],
      ["baloes", 1, ["balao-dica"]],
      ["icones", 1, ["check"]],
      ["personagens", 1, ["zappy-feliz"]],
    ],
  );
  assert.deepEqual([...defaultFolders(groups, 10)].sort(), ["", "baloes", "icones", "personagens"]);
  const big = [
    { folder: "baloes", count: 8, sample: [] },
    { folder: "icones", count: 47, sample: [] },
    { folder: "etiquetas", count: 11, sample: [] },
  ];
  assert.deepEqual([...defaultFolders(big, 60)].sort(), ["baloes", "etiquetas"]);
  assert.deepEqual([...defaultFolders(big, 5)], []);
  const chosen = choosePlan(plan, new Set(["baloes", "personagens"]));
  assert.deepEqual(
    [...chosen.boards, ...chosen.images].map((b) => b.name),
    ["Kit · baloes · balao-dica", "Kit · personagens · zappy-feliz"],
  );
  // The palette stays the kit's even without the sheet's artboard.
  assert.equal(chosen.palette.length, 2);
});

test("a PNG's artboard is its size, showing it whole; the open artboard's palette gains the kit's", () => {
  const scene = imageScene({ id: "asset-zappy", name: "zappy", width: 512, height: 300 });
  assert.deepEqual(scene.viewBox, [0, 0, 512, 300]);
  assert.deepEqual((scene.nodes[0] as { attrs: unknown }).attrs, {
    x: "0",
    y: "0",
    width: "512",
    height: "300",
  });
  assert.deepEqual(
    mergedPalette(
      ["#FFFFFF", "#000000"],
      [
        { name: "branco", color: "#ffffff" },
        { name: "azul", color: "#1b5cf3" },
      ],
    ),
    ["#ffffff", "#000000", "#1b5cf3"],
  );
  assert.equal(
    mergedPalette(
      [],
      Array.from({ length: 70 }, (_, i) => ({
        name: "",
        color: `#0000${i.toString(16).padStart(2, "0")}`,
      })),
    ).length,
    64,
  );
});

test("the summary says what came in and what did not", () => {
  const summary = kitSummary({
    name: "Kit-Aulas",
    svgs: 3,
    images: 1,
    palette: [{ name: "azul", color: "#1b5cf3" }],
    sheet: "paleta-cores.svg",
    fonts: ["Baloo 2 800", "Nunito 400"],
    texts: 2,
    missingFonts: ["Comic Sans"],
    normalized: 1,
    left: ["LEIA-ME.txt"],
  });
  assert.match(summary, /Kit "Kit-Aulas" importado: 4 pranchetas "Kit · …" \(3 SVG, 1 PNG\)/);
  assert.match(summary, /1 cor de paleta-cores\.svg na paleta/);
  assert.match(summary, /Fontes incorporadas: Baloo 2 800, Nunito 400 \(2 textos\)/);
  assert.match(summary, /os textos usam a do sistema: Comic Sans/);
  assert.match(summary, /1 PNG convertido para sRGB/);
  assert.match(summary, /Ficaram de fora: LEIA-ME\.txt\. Ctrl\+Z desfaz tudo\.$/);
});
