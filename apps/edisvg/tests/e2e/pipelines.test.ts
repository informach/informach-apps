import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { crc32, deflateSync } from "node:zlib";
import { chromium } from "playwright";
import { parseProject } from "../../src/shared/project";
import { rendererServer } from "../rendererServer";
import { game } from "../szprojectFixture";

/** Real whisper words of the lighthouse narration, said at 2:00 of a lesson. */
const LESSON_WORDS = (
  JSON.parse(
    readFileSync(
      new URL("../../../../packages/edi-speech/tests/fixtures/farol-words.json", import.meta.url),
      "utf8",
    ),
  ).words as { text: string; start: number; end: number; p: number }[]
).map((w) => ({ ...w, start: w.start + 120, end: w.end + 120 }));

/** A silent mono WAV of `seconds`, as the main process cuts the narration. */
function wav(seconds: number): number[] {
  const rate = 22050;
  const samples = Math.round(seconds * rate);
  const data = Buffer.alloc(44 + samples * 2);
  data.write("RIFF", 0);
  data.writeUInt32LE(36 + samples * 2, 4);
  data.write("WAVEfmt ", 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24);
  data.writeUInt32LE(rate * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write("data", 36);
  data.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++)
    data.writeInt16LE(Math.round(Math.sin(i / 8) * 8000), 44 + i * 2);
  return [...data];
}

/** A PNG of RGBA rows, as a picture the person picks for the palette. */
function png(width: number, rows: number[][]): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(rows.length, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const raw = Buffer.concat(rows.map((row) => Buffer.from([0, ...row])));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** EdiAula's fonts, as the main process hands them to a run (the files the installer copies). */
const FONT_FILES: Record<string, string> = {
  "Baloo 2 700": "Baloo2-700.ttf",
  "Bebas Neue 400": "BebasNeue-400.ttf",
  "Nunito 400": "Nunito-400.ttf",
  "Nunito 700": "Nunito-700.ttf",
};
const FONTS = Object.fromEntries(
  Object.entries(FONT_FILES).map(([key, file]) => [
    key,
    {
      name: file,
      base64: readFileSync(
        new URL(`../../../ediaula/resources/fonts/${file}`, import.meta.url),
      ).toString("base64"),
    },
  ]),
);

/** EdiAula's script of the lesson (Sistema Zero format): the lighthouse narration is part 2. */
const LESSON_SCRIPT = [
  "# Roteiro de produção · A Chave do Farol",
  "",
  "## Parte 1. Abertura",
  "",
  "**Fala para ElevenLabs:**",
  "",
  "```text",
  "Oi! Vamos começar.",
  "```",
  "",
  "## Parte 2. A chave",
  "",
  '**Na tela:** No "O personagem", apontar o personagem [apontar jogo 53 173].',
  "",
  "**Fala para ElevenLabs:**",
  "",
  "```text",
  "[warm voice] Olá de novo, turma. O personagem precisa encontrar a chave antes de chegar ao farol. Quando ele pegar a chave, o aviso muda.",
  "```",
].join("\n");

/**
 * The desktop bridge of the pipelines, faked in the page: recipes kept in memory, file dialogs
 * answered with tokens, the picked studio project read back. A string, so tsx adds nothing to it.
 */
const fakeDesktop = (project: string) => `
  (() => {
    let store = { version: 1, recipes: [], hidden: [] };
    const files = {
      szproject: { token: "file-projeto-0001", name: "projeto-final.szproject.json", kind: "szproject", size: 2000 },
      audio: { token: "file-audio-00001", name: "aula-inteira.mp3", kind: "audio", size: 9000 },
      lesson: { token: "file-aula-000001", name: "Aula 3.zip", kind: "lesson", size: 900 },
      video: { token: "file-video-00001", name: "demo.mp4", kind: "video", size: 9000 },
    };
    window.__pipelineWrites = 0;
    window.desktop = {
      // The editor tells the app about every edit; the app answers with the file's status.
      projectChanged: async () => ({ name: "Sem arquivo", path: null, dirty: true }),
      pipelinesRead: async () => structuredClone(store),
      pipelinesWrite: async (value) => { window.__pipelineWrites++; store = structuredClone(value); return structuredClone(store); },
      pipelinePick: async (kind) => files[kind] ?? null,
      pipelineFonts: async () => [
        { family: "Baloo 2", group: "Infantil", weights: [400, 600, 700, 800] },
        { family: "Nunito", group: "Arredondada", weights: [400, 600, 700, 800, 900] },
        { family: "Bebas Neue", group: "Títulos", weights: [400] },
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
      pipelineReadProject: async (token) => {
        if (token !== "file-projeto-0001") throw new Error("token");
        return ${JSON.stringify(project)};
      },
      pipelineWords: async (token, kind) => {
        const audio = token === "file-audio-00001" && kind === "audio";
        const lesson = token === "file-aula-000001" && kind === "lesson";
        if (!audio && !lesson) throw new Error("audio");
        return ${JSON.stringify(LESSON_WORDS)};
      },
      // The screen of the stretch, made from the lesson package: read as a picked video.
      pipelineLessonVideo: async (token, from, to) => {
        if (token !== "file-aula-000001") throw new Error("pacote");
        window.__lessonVideo = [from, to];
        return { token: "file-video-00001", name: "Tela da aula (2:15 a 2:25)", kind: "video", size: 9000 };
      },
      pipelineNarration: async (token, kind, start, end) => {
        window.__narration = [start, end];
        return new Uint8Array(${JSON.stringify(wav(9))});
      },
      pipelineCancel: async () => undefined,
      pipelineVideoFacts: async (token) => {
        if (token !== "file-video-00001") throw new Error("video");
        // The demonstration starts with the stretch: a click 1 s and another 5 s into it.
        return { width: 1280, height: 720, duration: 30, clicks: [
          { t: 1, x: 640, y: 80 },
          { t: 5, x: 200, y: 600 },
          { t: 25, x: 10, y: 10 },
        ] };
      },
      pipelineVideoPreview: async (token, seconds) => {
        window.__preview = seconds;
        return new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]);
      },
      pipelineVideoFrames: async (token, times) => {
        window.__frames = times;
        return times.map(() => ({ mediaType: "image/jpeg", data: "AAAA" }));
      },
      onPipelineProgress: () => () => undefined,
      // The package's script: this lesson is its second part (lessonPackage.ts packageScript).
      pipelineLessonScript: async (token) => {
        if (token !== "file-aula-000001") throw new Error("pacote");
        return { id: "aula-3-farol", script: { text: ${JSON.stringify(LESSON_SCRIPT)}, section: 1 } };
      },
      // Sending the lesson's animations to EdiAula (lessonDelivery.ts): what arrives is counted.
      lessonSendStart: async (spec) => {
        window.__send = { spec, frames: 0, sizes: new Set(), opaque: 0 };
        return "entrega-1";
      },
      lessonSendFrame: async (id, bytes) => {
        if (id !== "entrega-1") throw new Error("envio");
        window.__send.frames++;
        window.__send.sizes.add(bytes.length);
        for (let i = 3; i < bytes.length; i += 4) if (bytes[i]) window.__send.opaque++;
      },
      lessonSendFinish: async () => window.__send.spec.clipId + "-1731000000000.webm",
      lessonSendCancel: async () => undefined,
      lessonSendManifest: async (manifest) => {
        window.__manifest = manifest;
      },
      // What the main process keeps for the next opening (pipelineReferences.ts).
      pipelineReferenceSave: async (projectId, kind, bytes, meta) => {
        window.__kept = [...(window.__kept ?? []), { projectId, kind, meta, bytes: [...bytes] }];
      },
    };
  })();`;

test("pipelines: the ready recipes, edit and duplicate, and a run that imports the studio project", {
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
    // After loading: with a desktop bridge at start the editor recovers through the app instead.
    await page.evaluate(fakeDesktop(JSON.stringify(game)));
    await page.locator('[data-action="pipelines"]').first().click();
    const dialog = page.getByRole("dialog", { name: "Pipelines" });
    await dialog.getByText("Cena animada do jogo").waitFor();
    await dialog.getByText("Demonstração passo a passo").waitFor();
    await page.screenshot({ path: "test-results/pipelines-list.png" });

    // Edit the ready demo recipe, then duplicate it: the copy is the person's own.
    const demo = dialog.locator("li", { hasText: "Demonstração passo a passo" });
    await demo.getByRole("button", { name: "Editar" }).click();
    await dialog.getByLabel("Instruções para o assistente").fill("Setas grandes e amarelas.");
    await dialog.getByRole("button", { name: "Salvar receita" }).click();
    await demo.getByRole("button", { name: "Duplicar" }).click();
    await dialog.getByText("Demonstração passo a passo (cópia)").waitFor();
    const stored = await page.evaluate(() => window.desktop?.pipelinesRead());
    assert.deepEqual(
      stored?.recipes.map((r: { id: string; style: string; name: string }) => [
        r.id.startsWith("recipe-demonstracao") ? r.id : "own",
        r.style,
      ]),
      [
        ["recipe-demonstracao", "Setas grandes e amarelas."],
        ["own", "Setas grandes e amarelas."],
      ],
    );

    // Run the game scene recipe: it asks for what is missing, then imports the project.
    await dialog
      .locator("li", { hasText: "Cena animada do jogo" })
      .getByRole("button", { name: "Rodar" })
      .click();
    const run = dialog.getByRole("button", { name: "Rodar pipeline" });
    assert.equal(await run.isDisabled(), true);
    await dialog.getByText(/Falta: Projeto do Estúdio/).waitFor();
    await dialog.getByRole("button", { name: "Escolher…" }).click();
    await dialog.getByRole("button", { name: "Escolher áudio…" }).click();
    await dialog.getByText("aula-inteira.mp3").waitFor();
    // What is in [brackets] is a note: only the rest is looked for in the audio.
    await dialog
      .getByLabel("Roteiro do trecho (só a parte desta cena)")
      .fill(
        "[mostrar o farol] O personagem precisa encontrar a chave antes de chegar ao farol. [pausa]\nQuando ele pegar a chave, [a chave brilha] o aviso muda.",
      );
    // The recipe's fonts come chosen: Baloo 2 for titles, Nunito for the body.
    assert.equal(await dialog.getByLabel("Título").inputValue(), "Baloo 2");
    assert.equal(await dialog.getByLabel("Corpo").inputValue(), "Nunito");
    await page.screenshot({ path: "test-results/pipelines-run.png" });
    const beforeRun = await page.evaluate(() => localStorage.getItem("edisvg-project"));
    await run.click();
    await dialog.getByText(/^(Pipeline concluído\.|O pipeline parou\.)$/).waitFor();
    const said = (await dialog.textContent()) ?? "";
    // Everything up to the draft is done; the draft needs the desktop assistant (Claude Code or
    // Codex), which a browser page does not have: the run stops there and says so.
    assert.match(said, /Aplicar as paletas de texto e das imagensPronto/, said);
    assert.match(said, /Incorporar as fontes de título e corpoPronto/, said);
    assert.match(
      said,
      /Fontes Baloo 2 nos títulos e Nunito no corpo, incorporadas ao projeto\./,
      said,
    );
    assert.match(
      said,
      /Pedir o rascunho da animação ao assistenteFalhou: O assistente precisa do aplicativo desktop\./,
      said,
    );
    await dialog.getByText(/3 imagens viraram pranchetas/).waitFor();
    const project = parseProject(
      JSON.parse((await page.evaluate(() => localStorage.getItem("edisvg-project"))) ?? "null"),
    );
    assert.equal(project.artboards.at(-1)?.name, "Cena · A Chave do Farol");
    // The title's bold and the body's regular and bold, embedded with their notice.
    assert.deepEqual(await page.evaluate("window.__fontsAsked"), [
      "Baloo 2 700",
      "Nunito 400",
      "Nunito 700",
    ]);
    const fonts = project.assets.filter((asset) => asset.kind === "font");
    assert.deepEqual(
      fonts.map((font) => [font.name, font.weight]),
      [
        ["Baloo 2 700", 700],
        ["Nunito 400", 400],
        ["Nunito 700", 700],
      ],
    );
    assert.ok(fonts.every((font) => font.licenseNotice.includes("SIL Open Font License")));
    // The stretch of the lesson: "O personagem" at 2:15.98 to "muda." at 2:24.9, with breath.
    await dialog.getByText(/Trecho achado na aula de 2:15 a 2:24, com 2 frases\./).waitFor();
    const cut = (await page.evaluate("window.__narration")) as [number, number];
    assert.ok(Math.abs(cut[0] - (135.98 - 0.4)) < 0.2, `cut from ${cut[0]}`);
    assert.ok(Math.abs(cut[1] - (144.9 + 0.8)) < 0.4, `cut to ${cut[1]}`);
    // An animation as long as the narration, opened with the narration over its timeline.
    const clip = project.motion.animations.at(-1);
    assert.equal(clip?.name, "Narração · Cena animada do jogo");
    assert.equal(clip?.fps, 30);
    assert.equal(clip?.frames, Math.ceil((cut[1] - cut[0]) * 30));
    await page.getByRole("button", { name: "Fechar pipelines" }).click();
    const bar = page.locator(".narration-bar");
    await bar.waitFor();
    assert.deepEqual(await bar.locator(".narration-line").allTextContents(), [
      "O personagem precisa encontrar a chave antes de chegar ao farol.",
      "Quando ele pegar a chave, o aviso muda.",
    ]);
    // A click on a sentence takes the playhead there and lights it.
    await bar.locator(".narration-line").nth(1).click();
    await bar.locator(".narration-line.is-now").getByText("Quando ele pegar a chave").waitFor();
    // The narration loads under the page's CSP (media from blob:) and has its length.
    const loaded = await page.evaluate(
      () =>
        new Promise<number>((done, fail) => {
          const audio = document.querySelector<HTMLAudioElement>("audio[data-narration]");
          if (!audio) return fail(new Error("no narration element"));
          if (audio.readyState >= 1) return done(audio.duration);
          setTimeout(() => fail(new Error("narration did not load in 10 s")), 10_000);
          audio.addEventListener("loadedmetadata", () => done(audio.duration), { once: true });
          audio.addEventListener("error", () => fail(new Error("narration did not decode")), {
            once: true,
          });
        }),
    );
    assert.ok(Math.abs(loaded - 9) < 0.1, `narration of ${loaded} s`);
    await page.screenshot({ path: "test-results/pipelines-narration.png" });
    // The Cena's palette: the text colours, then the images' (the fixture paints #00ff00, #ff0000).
    const scene = parseProject(
      JSON.parse((await page.evaluate(() => localStorage.getItem("edisvg-project"))) ?? "null"),
    ).artboards.at(-1);
    assert.deepEqual(scene?.scene.palette?.slice(0, 3), ["#ffffff", "#143d35", "#ffb547"]);
    assert.ok(scene?.scene.palette?.includes("#00ff00"));
    // An edit after the run is undone alone, and the narration stays with the file.
    const afterRun = await page.evaluate(() => localStorage.getItem("edisvg-project"));
    await page.locator("[data-layer-name]").first().click();
    // The click opens the layer's name for editing: the shortcut goes to the canvas, not to it.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("Control+d");
    assert.notEqual(await page.evaluate(() => localStorage.getItem("edisvg-project")), afterRun);
    await page.locator('[data-action="undo"]').first().click();
    assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), afterRun);
    await page.locator(".narration-bar").waitFor({ timeout: 2_000 });
    assert.equal(await page.locator("audio[data-narration]").count(), 1);
    // The whole run, stopped or not, is one undo step.
    await page.locator('[data-action="undo"]').first().click();
    assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), beforeRun);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});

test("pipelines: the screen demonstration gets its layer artboard, the video under it and the ready elements", {
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
    await page.evaluate(fakeDesktop(JSON.stringify(game)));
    await page.locator('[data-action="pipelines"]').first().click();
    const dialog = page.getByRole("dialog", { name: "Pipelines" });
    await dialog
      .locator("li", { hasText: "Demonstração passo a passo" })
      .getByRole("button", { name: "Rodar" })
      .click();
    await dialog.getByRole("button", { name: "Escolher…" }).click();
    await dialog.getByRole("button", { name: "Escolher áudio…" }).click();
    await dialog
      .getByLabel("Roteiro do trecho (só a parte desta cena)")
      .fill(
        "O personagem precisa encontrar a chave antes de chegar ao farol. Quando ele pegar a chave, o aviso muda.",
      );
    // The palette from a picture: mostly white, then navy, a muted green and a little pure red.
    const white = [255, 255, 255, 255];
    const navy = [16, 32, 64, 255];
    const green = [60, 140, 80, 255];
    const red = [255, 0, 0, 255];
    await dialog.getByLabel("Imagem para a paleta de texto desta vez").setInputFiles({
      name: "referencia.png",
      mimeType: "image/png",
      buffer: png(4, [
        [...white, ...white, ...white, ...white],
        [...white, ...white, ...white, ...white],
        [...navy, ...navy, ...navy, ...navy],
        [...green, ...green, ...red, ...red],
      ]),
    });
    await dialog.getByText("#3c8c50").waitFor();
    assert.deepEqual(await dialog.locator(".pipeline-swatch code").allTextContents(), [
      "#ffffff",
      "#102040",
      "#3c8c50",
      "#ff0000",
    ]);
    await dialog.getByLabel("Título").selectOption("Bebas Neue");
    const beforeRun = await page.evaluate(() => localStorage.getItem("edisvg-project"));
    await dialog.getByRole("button", { name: "Rodar pipeline" }).click();
    await dialog.getByText(/^(Pipeline concluído\.|O pipeline parou\.)$/).waitFor();
    const said = (await dialog.textContent()) ?? "";
    assert.match(said, /Preparar o vídeo da demonstraçãoPronto/, said);
    assert.match(said, /Criar os elementos prontos \(seta, balão, destaque e clique\)Pronto/, said);
    assert.match(said, /Demonstração 1280×720: 2 cliques gravados no trecho\./, said);
    assert.match(
      said,
      /Pedir o rascunho da animação ao assistenteFalhou: O assistente precisa do aplicativo desktop\./,
      said,
    );
    // The video of the stretch: "O personagem" (2:15.98) to "muda." (2:24.9) and the breath after.
    const seconds = (await page.evaluate("window.__preview")) as number;
    assert.ok(Math.abs(seconds - (144.9 + 0.8 - 135.98)) < 0.4, `preview of ${seconds} s`);
    const project = parseProject(
      JSON.parse((await page.evaluate(() => localStorage.getItem("edisvg-project"))) ?? "null"),
    );
    const names = project.artboards.map((board) => [
      board.name,
      board.scene.viewBox[2],
      board.scene.viewBox[3],
    ]);
    assert.deepEqual(names.slice(-5), [
      ["Demonstração · demo.mp4", 1280, 720],
      ["Seta", 240, 120],
      ["Balão", 520, 220],
      ["Destaque", 320, 200],
      ["Clique", 120, 120],
    ]);
    // The layer's palette is the one taken from the picture; the arrow takes its accent.
    assert.deepEqual(project.artboards.at(-5)?.scene.palette, [
      "#ffffff",
      "#102040",
      "#3c8c50",
      "#ff0000",
    ]);
    assert.match(JSON.stringify(project.artboards.at(-4)?.scene), /#ff0000/);
    // Bebas Neue has one weight: the title takes it. The balloon's text is in the body's bold.
    assert.deepEqual(await page.evaluate("window.__fontsAsked"), [
      "Bebas Neue 400",
      "Nunito 400",
      "Nunito 700",
    ]);
    const bold = project.assets.find((asset) => asset.name === "Nunito 700");
    const balloon = JSON.stringify(project.artboards.at(-3)?.scene);
    assert.ok(bold && balloon.includes(`"fontAssetId":"${bold.id}"`), balloon.slice(0, 400));
    await dialog.getByRole("button", { name: "Fechar pipelines" }).click();
    // The layer's artboard stays open, with the video under it and the narration over the timeline.
    await page
      .locator(".scene-artboard.has-reference video[data-reference]")
      .waitFor({ state: "attached" });
    await page.locator(".narration-bar").waitFor();
    await page.screenshot({ path: "test-results/pipelines-demo.png" });

    // The video and the narration are kept by project, with the artboard and animation they go with.
    type Kept = {
      projectId: string;
      kind: "narration" | "video";
      meta: Record<string, unknown>;
      bytes: number[];
    };
    const keptNow = async () => (await page.evaluate("window.__kept")) as Kept[];
    const first = await keptNow();
    const layer = project.artboards.at(-5);
    assert.deepEqual(
      first.map((k) => [k.kind, k.projectId]),
      [
        ["video", project.id],
        ["narration", project.id],
      ],
    );
    const firstVideo = first.find((k) => k.kind === "video");
    const firstNarration = first.find((k) => k.kind === "narration");
    assert.equal(firstVideo?.meta.artboardId, layer?.id);
    assert.ok(
      project.motion.animations.some((clip) => clip.id === firstNarration?.meta.clipId),
      JSON.stringify(firstNarration?.meta),
    );
    assert.deepEqual(Object.keys(firstNarration?.meta ?? {}).sort(), [
      "clipId",
      "duration",
      "lessonStart",
      "lines",
      "name",
    ]);

    // A second stretch of the same lesson, in the same file: each run keeps its own narration and
    // video (a lesson mixes a full-screen scene and demonstrations over the screen).
    const afterFirst = await page.evaluate(() => localStorage.getItem("edisvg-project"));
    await page.locator('[data-action="pipelines"]').first().click();
    await dialog
      .locator("li", { hasText: "Demonstração passo a passo" })
      .getByRole("button", { name: "Rodar" })
      .click();
    await dialog.getByRole("button", { name: "Escolher…" }).click();
    await dialog.getByRole("button", { name: "Escolher áudio…" }).click();
    await dialog
      .getByLabel("Roteiro do trecho (só a parte desta cena)")
      .fill("Quando ele pegar a chave, o aviso muda.");
    await dialog.getByRole("button", { name: "Rodar pipeline" }).click();
    await dialog.getByText(/^(Pipeline concluído\.|O pipeline parou\.)$/).waitFor();
    await dialog.getByRole("button", { name: "Fechar pipelines" }).click();
    const both = parseProject(
      JSON.parse((await page.evaluate(() => localStorage.getItem("edisvg-project"))) ?? "null"),
    );
    const layers = both.artboards.filter((board) => board.name === "Demonstração · demo.mp4");
    assert.equal(layers.length, 2);
    const kept = await keptNow();
    const keptVideos = kept.filter((k) => k.kind === "video");
    const keptNarrations = kept.filter((k) => k.kind === "narration");
    assert.deepEqual(
      keptVideos.map((k) => k.meta.artboardId),
      layers.map((board) => board.id),
    );
    assert.equal(new Set(keptNarrations.map((k) => k.meta.clipId)).size, 2);
    // Both narrations stay in the editor, each with its animation.
    assert.equal(await page.locator("audio[data-narration]").count(), 2);
    await page.getByRole("button", { name: "Artboards" }).click();
    await page.getByText("Demonstração · demo.mp4", { exact: true }).first().click();
    await page
      .locator(".scene-artboard.has-reference video[data-reference]")
      .waitFor({ state: "attached" });

    // Closed and opened again: the editor starts with the file, and both come back under it.
    const reopened = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    reopened.on("pageerror", (error) => errors.push(error.message));
    // A string, not a function: tsx would wrap a function with helpers the page does not have.
    await reopened.addInitScript(`
      (() => {
        const saved = ${JSON.stringify(both)};
        const references = ${JSON.stringify(kept)};
        const stored = (value) => ({ ...value.meta, bytes: new Uint8Array(value.bytes) });
        const of = (kind) => references.filter((r) => r.kind === kind).map(stored);
        window.desktop = {
          projectInitialize: async () => ({
            project: saved,
            status: { name: "Aula 3.edisvg", path: null, dirty: false },
            recovered: false,
          }),
          projectChanged: async () => ({ name: "Aula 3.edisvg", path: null, dirty: false }),
          pipelineReferences: async (projectId) =>
            projectId === saved.id
              ? { narrations: of("narration"), videos: of("video") }
              : { narrations: [], videos: [] },
          aiStatus: async () => ({ available: false, clients: [] }),
          handleAiTools: () => () => undefined,
          onAssistantEvent: () => () => undefined,
          onCommand: () => () => undefined,
        };
      })();`);
    await reopened.goto(server.url);
    await reopened.locator("audio[data-narration]").nth(1).waitFor({ state: "attached" });
    // On each layer's artboard, its own video is under it again.
    await reopened.getByRole("button", { name: "Artboards" }).click();
    for (const index of [0, 1]) {
      await reopened.getByText("Demonstração · demo.mp4", { exact: true }).nth(index).click();
      await reopened
        .locator(".scene-artboard.has-reference video[data-reference]")
        .waitFor({ state: "attached" });
    }
    await reopened.close();

    // Each run is one undo step.
    await page.locator('[data-action="undo"]').first().click();
    assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), afterFirst);
    await page.locator('[data-action="undo"]').first().click();
    assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), beforeRun);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});

test("pipelines: with the lesson package the demonstration takes its screen from it", {
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
    await page.evaluate(fakeDesktop(JSON.stringify(game)));
    await page.locator('[data-action="pipelines"]').first().click();
    const dialog = page.getByRole("dialog", { name: "Pipelines" });
    await dialog
      .locator("li", { hasText: "Demonstração passo a passo" })
      .getByRole("button", { name: "Rodar" })
      .click();
    // Before the package, the video is asked for; with it, the package brings the screen.
    await dialog.getByRole("button", { name: "Escolher…" }).waitFor();
    await dialog.getByRole("button", { name: "Escolher aula…" }).click();
    await dialog.getByText("Aula 3.zip (pacote da aula do EdiAula)").waitFor();
    await dialog.getByText("Vem do pacote da aula: a tela gravada no trecho do roteiro.").waitFor();
    assert.equal(await dialog.getByRole("button", { name: "Escolher…" }).count(), 0);
    // The roteiro comes with the lesson: its section's phrases, all picked, nothing to paste.
    const phrases = dialog.getByRole("group", { name: "Roteiro da aula · Seção 2 · A chave" });
    await phrases.getByText("3 de 3 frases nesta animação.", { exact: false }).waitFor();
    assert.equal(await dialog.getByLabel("Roteiro do trecho (só a parte desta cena)").count(), 0);
    await phrases.getByText(/^Na tela: No "O personagem", apontar o personagem/).waitFor();
    // "Olá de novo, turma." is not in this stretch of the audio: left out of the animation.
    await phrases.getByRole("checkbox", { name: "Olá de novo, turma." }).uncheck();
    await phrases.getByText("2 de 3 frases nesta animação.", { exact: false }).waitFor();
    await page.screenshot({ path: "test-results/pipelines-lesson-phrases.png" });
    await dialog.getByRole("button", { name: "Rodar pipeline" }).click();
    await dialog.getByText(/^(Pipeline concluído\.|O pipeline parou\.)$/).waitFor();
    const said = (await dialog.textContent()) ?? "";
    assert.match(said, /Preparar o vídeo da demonstraçãoPronto/, said);
    assert.match(said, /Demonstração 1280×720: 2 cliques gravados no trecho\./, said);
    // The screen from "O personagem" (2:15.98) to the breath after "muda." (2:24.9 + 0.8).
    const [from, to] = (await page.evaluate("window.__lessonVideo")) as number[];
    assert.ok(
      Math.abs((from ?? 0) - 135.98) < 0.3 && Math.abs((to ?? 0) - 145.7) < 0.3,
      `${from}–${to}`,
    );
    const project = parseProject(
      JSON.parse((await page.evaluate(() => localStorage.getItem("edisvg-project"))) ?? "null"),
    );
    assert.ok(
      project.artboards.some((board) => board.name === "Demonstração · Tela da aula (2:15 a 2:25)"),
    );
    // "Escrever à mão": the phrases picked, with the direction as an annotation, to edit.
    await phrases.getByRole("button", { name: "Escrever à mão" }).click();
    assert.equal(
      await dialog.getByLabel("Roteiro do trecho (só a parte desta cena)").inputValue(),
      '[Na tela: No "O personagem", apontar o personagem (apontar jogo 53 173).] O personagem precisa encontrar a chave antes de chegar ao farol.\nQuando ele pegar a chave, o aviso muda.',
    );
    // The run recorded, on the layer it made, the stretch of the lesson its animation is.
    const layer = project.artboards.find(
      (board) => board.name === "Demonstração · Tela da aula (2:15 a 2:25)",
    );
    const stretch = layer?.lessonClips?.[0];
    assert.equal(layer?.lessonClips?.length, 1);
    assert.deepEqual(
      stretch && {
        ...stretch,
        start: Number(stretch.start.toFixed(2)),
        end: Number(stretch.end.toFixed(2)),
      },
      {
        clipId: project.motion.animations.at(-1)?.id,
        kind: "screen-demo",
        lessonId: "aula-3-farol",
        section: 1,
        start: 135.58,
        end: 145.56,
        phrases: [
          "O personagem precisa encontrar a chave antes de chegar ao farol.",
          "Quando ele pegar a chave, o aviso muda.",
        ],
      },
    );

    // The next run of the same lesson shows what is done, and starts with the rest picked.
    await dialog.getByRole("button", { name: "Voltar" }).click();
    await dialog
      .locator("li", { hasText: "Cena animada do jogo" })
      .getByRole("button", { name: "Rodar" })
      .click();
    await dialog.getByRole("button", { name: "Escolher aula…" }).click();
    const next = dialog.getByRole("group", { name: "Roteiro da aula · Seção 2 · A chave" });
    await next
      .getByText("1 de 3 frases nesta animação · 2 já animadas neste projeto", { exact: false })
      .waitFor();
    assert.equal(
      await next.getByRole("checkbox", { name: "Olá de novo, turma." }).isChecked(),
      true,
    );
    assert.equal(await next.getByText("Já animada: demonstração sobre a tela").count(), 2);
    await page.screenshot({ path: "test-results/pipelines-lesson-done.png" });
    await dialog.getByRole("button", { name: "Fechar pipelines" }).click();

    // Arquivo › Enviar animações para a aula: the demonstration, drawn frame by frame, goes to
    // EdiAula as a transparent layer at its second of the lesson.
    await page.keyboard.press("Control+k");
    await page.getByLabel("Buscar comando", { exact: true }).fill("Enviar animações");
    await page.getByLabel("Buscar comando", { exact: true }).press("Enter");
    const send = page.getByRole("dialog", { name: "Enviar animações para a aula" });
    await send.getByText("2:15–2:25", { exact: false }).waitFor();
    await send.getByText("Sobre a tela (transparente)", { exact: false }).waitFor();
    await send.getByRole("button", { name: "Enviar para o EdiAula" }).click();
    await send.getByText(/^1 animação enviada\./).waitFor({ timeout: 60_000 });
    const clip = project.motion.animations.at(-1);
    const delivered = (await page.evaluate(
      "({ ...window.__send, sizes: [...window.__send.sizes] })",
    )) as {
      spec: Record<string, unknown>;
      frames: number;
      sizes: number[];
      opaque: number;
    };
    assert.deepEqual(delivered.spec, {
      lessonId: "aula-3-farol",
      clipId: clip?.id,
      kind: "screen-demo",
      width: 1280,
      height: 720,
      fps: 30,
      frames: clip?.frames,
    });
    assert.equal(delivered.frames, clip?.frames);
    assert.deepEqual(delivered.sizes, [1280 * 720 * 4]);
    // The layer has nothing drawn yet (the assistant needs the desktop): every pixel transparent.
    assert.equal(delivered.opaque, 0);
    const manifest = (await page.evaluate("window.__manifest")) as {
      lessonId: string;
      items: { clipId: string; kind: string; file: string; start: number; duration: number }[];
    };
    assert.equal(manifest.lessonId, "aula-3-farol");
    assert.deepEqual(
      manifest.items.map((item) => [
        item.clipId,
        item.kind,
        item.file,
        Number(item.start.toFixed(2)),
      ]),
      [[clip?.id, "screen-demo", `${clip?.id}-1731000000000.webm`, 135.58]],
    );
    assert.ok(Math.abs((manifest.items[0]?.duration ?? 0) - (clip?.frames ?? 0) / 30) < 1e-9);
    await page.screenshot({ path: "test-results/lesson-send.png" });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});

test("pipelines: a lesson EdiAula sends with Animar no EdiSVG opens them with it chosen, once", {
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
    await page.evaluate(fakeDesktop(JSON.stringify(game)));
    // The request EdiAula left (lessonRequest.ts): the main process hands it over once.
    await page.evaluate(() => {
      const w = window as unknown as {
        __taken: number;
        desktop: Record<string, unknown>;
      };
      w.__taken = 0;
      w.desktop.lessonRequestTake = async () =>
        w.__taken++
          ? null
          : {
              name: "Aula 3",
              file: { token: "file-aula-000001", name: "Aula 3.zip", kind: "lesson", size: 900 },
            };
    });
    // The window comes back to the front after the click in EdiAula.
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    const dialog = page.getByRole("dialog", { name: "Pipelines" });
    await dialog.getByRole("status").getByText("Aula 3").waitFor();
    await dialog
      .locator("li", { hasText: "Demonstração passo a passo" })
      .getByRole("button", { name: "Rodar" })
      .click();
    // The run starts with the lesson chosen and its phrases offered, nothing picked by hand.
    await dialog.getByText("Aula 3.zip (pacote da aula do EdiAula)").waitFor();
    await dialog
      .getByRole("group", { name: "Roteiro da aula · Seção 2 · A chave" })
      .getByText("3 de 3 frases nesta animação.", { exact: false })
      .waitFor();
    await page.screenshot({ path: "test-results/pipelines-handed-lesson.png" });
    // Back to the list and into the other recipe: the same lesson comes chosen there too.
    await dialog.getByRole("button", { name: "Voltar", exact: true }).click();
    await dialog
      .locator("li", { hasText: "Cena animada do jogo" })
      .getByRole("button", { name: "Rodar" })
      .click();
    await dialog.getByText("Aula 3.zip (pacote da aula do EdiAula)").waitFor();
    await dialog.getByRole("button", { name: "Fechar pipelines" }).click();
    // Taken once: coming back to the front again opens nothing.
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForTimeout(300);
    assert.equal(await dialog.count(), 0);
    assert.equal(await page.evaluate("window.__taken"), 2);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});

declare global {
  interface Window {
    desktop?: {
      pipelinesRead(): Promise<{ recipes: { id: string; style: string; name: string }[] }>;
    };
  }
}
