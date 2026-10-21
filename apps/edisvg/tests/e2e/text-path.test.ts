import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyBehavior } from "@informach/edi-motion/behavior";
import { chromium } from "playwright";
import { compileInteractiveArtboard } from "../../src/shared/interactive";
import { newProject, parseProject } from "../../src/shared/project";
import { editScene } from "../../src/shared/scene.js";
import { textPathFromShape } from "../../src/shared/textPath";
import { assetTestBundle } from "../assetBundle";
import { rendererServer } from "../rendererServer";

const XLINK = 'xmlns:xlink="http://www.w3.org/1999/xlink"',
  text = 'font-family="Arial" font-size="14" fill="#102030"';
export const svgTextPathSources = {
  visible: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 120"><path id="arc" d="M10 100 C50 10 130 10 170 100" fill="none" stroke="#e33a60"/><text ${text}><textPath href="#arc" startOffset="10%">Texto ao longo da curva</textPath></text></svg>`,
  definition: `<svg xmlns="http://www.w3.org/2000/svg" ${XLINK} viewBox="0 0 180 120"><defs><path id="wave" d="M0 0 C30 -30 60 30 90 0 S150 -30 160 0" transform="translate(10 60)"/></defs><text ${text} text-anchor="middle"><textPath xlink:href="#wave" startOffset="50%">Onda centralizada</textPath></text></svg>`,
  absolute: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 120"><defs><path id="line" d="M20 30 L160 30 L160 110"/></defs><g transform="rotate(4 90 60)"><text ${text}><textPath href="#line" startOffset="60">Dobra no canto</textPath></text></g></svg>`,
};

test("imported textPath keeps the native browser pixels of the original SVG", {
  timeout: 60000,
}, async () => {
  const server = await rendererServer(
      new Map([["/text.html", { content: "<!doctype html><main></main>", mime: "text/html" }]]),
    ),
    code = await assetTestBundle(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage(),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${server.url}/text.html`);
    await page.addScriptTag({ content: code });
    for (const [name, source] of Object.entries(svgTextPathSources)) {
      const result = await page.evaluate(async (source) => {
        const api = window.EdiAssetTest;
        if (!api) throw new Error("Missing import bundle");
        const imported = api.inspectSvgImport(source);
        if (!imported.scene) return { issues: imported.report.issues, mismatches: -1, painted: 0 };
        const reference = document.createElement("div"),
          host = document.createElement("div");
        reference.innerHTML = source;
        host.innerHTML = api.renderScene(imported.scene);
        document.body.append(reference, host);
        const original = reference.querySelector("svg"),
          svg = host.querySelector("svg");
        if (!(original instanceof SVGSVGElement) || !(svg instanceof SVGSVGElement))
          throw new Error("Missing compared drawings");
        const points: [number, number][] = [];
        for (let y = 0; y < 120; y += 1) for (let x = 0; x < 180; x += 1) points.push([x, y]);
        const expected = await api.svgPixels(original, 180, 120, points),
          actual = await api.svgPixels(svg, 180, 120, points);
        let mismatches = 0,
          painted = 0;
        for (const [index, pixel] of actual.entries()) {
          if ((expected[index]?.[3] ?? 0) > 0) painted++;
          if (
            pixel.some(
              (value, channel) => Math.abs(value - (expected[index]?.[channel] ?? -999)) > 2,
            )
          )
            mismatches++;
        }
        reference.remove();
        host.remove();
        return { issues: [], mismatches, painted };
      }, source);
      assert.deepEqual(result.issues, [], `${name}: ${JSON.stringify(result.issues)}`);
      assert.ok(result.painted > 100, `${name}: ${result.painted} painted pixels`);
      assert.equal(result.mismatches, 0, `${name} differs from the native SVG`);
    }
    const refused = await page.evaluate(
      (sources) => {
        const api = window.EdiAssetTest;
        if (!api) throw new Error("Missing import bundle");
        return sources.map(
          (source) =>
            api.inspectSvgImport(source).report.issues.find((issue) => issue.severity === "error")
              ?.message ?? "",
        );
      },
      [
        '<text><textPath href="#p"><tspan>a</tspan></textPath></text>',
        '<text><textPath href="#missing">a</textPath></text>',
        '<text><textPath href="#p" method="stretch">a</textPath></text>',
        '<text>antes<textPath href="#p">a</textPath></text>',
        '<text><textPath href="#p" startOffset="1em">a</textPath></text>',
      ].map(
        (body) =>
          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path id="p" d="M0 50 L100 50"/>${body}</svg>`,
      ),
    );
    for (const [index, pattern] of [
      /sem tspan/,
      /referência local a um path/,
      /fora do perfil: method/,
      /único textPath/,
      /porcentagem ou comprimento/,
    ].entries())
      assert.match(refused[index] ?? "", pattern);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});

test("the player keeps dynamic text on the curve and the inspector attaches a sibling shape", {
  timeout: 60000,
}, async () => {
  const project = newProject(),
    board = project.artboards[0];
  if (!board) throw new Error("Missing board");
  board.scene.viewBox = [0, 0, 400, 200];
  const curve = editScene(board.scene, null, "add", {
    tag: "path",
    attrs: { d: "M20 180 C120 20 280 20 380 180", fill: "none", stroke: "#e33a60" },
  });
  const label = editScene(board.scene, null, "add", {
    tag: "text",
    attrs: { "font-size": "20", fill: "#102030", "font-family": "Arial" },
  });
  if (!curve || !label) throw new Error("Missing objects");
  editScene(board.scene, label, "text", "Curva");
  editScene(board.scene, label, "text-path", textPathFromShape(board.scene, label, curve, 20));
  board.behavior = {
    ...emptyBehavior(),
    inputs: [{ id: "input-text", kind: "string", name: "Texto", initial: "Curva" }],
    bindings: [
      {
        id: "binding-text",
        inputId: "input-text",
        targetId: label,
        kind: "text",
        direction: "two-way",
      },
    ],
  };
  const parsed = parseProject(project),
    compiled = compileInteractiveArtboard(parsed, board.id),
    code = await assetTestBundle(),
    server = await rendererServer(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage();
    await page.setContent(
      `<style>svg{width:800px;height:400px}</style>${compiled.svg.replace("<svg ", '<svg id="live" ')}`,
    );
    await page.addScriptTag({ content: code });
    const glyphs = () =>
      page.evaluate((id) => {
        const element = document.querySelector(`[data-edi-object="${id}"]>text`);
        if (!(element instanceof SVGTextElement)) throw new Error("Missing text");
        return {
          path: element.firstElementChild?.localName,
          content: element.textContent,
          ys: Array.from(
            { length: element.getNumberOfChars() },
            (_, index) => element.getStartPositionOfChar(index).y,
          ),
        };
      }, label);
    await page.evaluate(async (blueprint) => {
      const api = window.EdiAssetTest,
        root = document.querySelector("#live");
      if (!api || !(root instanceof SVGSVGElement)) throw new Error("Missing player host");
      Reflect.set(
        window,
        "pathPlayer",
        await api.createInteractiveSvgPlayerAsync(root, blueprint, { autoplay: false }),
      );
    }, compiled.document);
    await page.evaluate(() => {
      Reflect.get(window, "pathPlayer").setInput("input-text", "Um texto bem mais longo na curva");
      Reflect.get(window, "pathPlayer").advance(0);
    });
    const dynamic = await glyphs();
    assert.equal(dynamic.path, "textPath");
    assert.equal(dynamic.content, "Um texto bem mais longo na curva");
    // Along the arch the baseline rises and falls: the text bends with the curve.
    const top = Math.min(...dynamic.ys);
    assert.ok(
      (dynamic.ys[0] ?? 0) - top > 15 && (dynamic.ys.at(-1) ?? 0) - top > 60,
      JSON.stringify(dynamic.ys),
    );

    // Inspector: a plain text attached to the sibling curve through the panel.
    const authored = structuredClone(parsed),
      node = authored.artboards[0]?.scene.nodes.find((item) => item.id === label);
    assert.ok(node);
    delete node.textPath;
    const editor = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
      errors: string[] = [];
    editor.on("pageerror", (error) => errors.push(error.message));
    editor.on("dialog", (dialog) => dialog.accept());
    await editor.addInitScript(
      (value) => localStorage.setItem("edisvg-project", JSON.stringify(value)),
      parseProject(authored),
    );
    await editor.goto(server.url);
    await editor.locator(".scene-artwork>svg").waitFor();
    await editor.locator(`[data-scene-select="${label}"]`).click();
    const form = editor.getByRole("form", { name: "Texto em caminho", exact: true });
    await form.getByRole("combobox").selectOption(curve);
    await form.getByRole("spinbutton").fill("35");
    await form.getByRole("button", { name: "Aplicar caminho", exact: true }).click();
    await editor.waitForFunction(
      (id) =>
        JSON.parse(
          localStorage.getItem("edisvg-project") ?? "null",
        )?.artboards[0]?.scene.nodes.find((item: { id: string }) => item.id === id)?.textPath
          ?.startOffset === 35,
      label,
    );
    assert.equal(
      await editor
        .locator(`.scene-artwork [data-object="${label}"]>text>textPath`)
        .getAttribute("startOffset"),
      "35%",
    );
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});
