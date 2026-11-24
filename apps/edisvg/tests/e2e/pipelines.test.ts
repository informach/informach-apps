import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { crc32, deflateSync } from "node:zlib";
import { chromium } from "playwright";
import { newProject, parseProject } from "../../src/shared/project";
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
      pipelineNotify: async (notice) => {
        window.__notices = [...(window.__notices ?? []), notice];
      },
      // The style guide pictures kept in the profile (main/pipelineGuides.ts), by id.
      pipelineGuideSave: async (bytes, name) => {
        window.__guides = window.__guides ?? {};
        const id = "guide-" + String(Object.keys(window.__guides).length + 1).padStart(32, "0");
        window.__guides[id] = bytes.slice();
        return { id, name };
      },
      // Where a run stopped, by project (main/pipelineRuns.ts).
      pipelineRunSave: async (projectId, record) => {
        window.__runs = { ...(window.__runs ?? {}), [projectId]: record };
      },
      pipelineRunLoad: async (projectId) => window.__runs?.[projectId] ?? null,
      pipelineRunClear: async (projectId) => {
        if (window.__runs) delete window.__runs[projectId];
      },
      pipelineGuideStyle: async (id) => window.__guideStyles?.[id] ?? null,
      pipelineGuideStyleSave: async (id, style) => {
        window.__guideStyles = { ...(window.__guideStyles ?? {}), [id]: style };
      },
      pipelineGuideRead: async (id) => {
        const bytes = window.__guides?.[id];
        if (!bytes) throw new Error("O guia de estilo da receita não está mais neste computador: escolha de novo.");
        return { mediaType: "image/png", bytes };
      },
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
    // No palette or fonts to choose: they come from the style guide (none here: the recipe's).
    assert.equal(await dialog.getByLabel("Título").count(), 0);
    assert.equal(await dialog.locator(".pipeline-swatch").count(), 0);
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
    // The end of the run goes to the main process for the phone notice: whether it worked, the
    // recipe and how long it took, nothing of the files.
    const notices = (await page.evaluate("window.__notices")) as {
      ok: boolean;
      recipe: string;
      seconds: number;
    }[];
    assert.deepEqual(
      notices.map(({ ok, recipe }) => [ok, recipe]),
      [[false, "Cena animada do jogo"]],
    );
    assert.deepEqual(Object.keys(notices[0] ?? {}).sort(), ["ok", "recipe", "seconds"]);
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
    await page.locator('[data-menu="edit"]').click();
    await page.locator('[data-menu-item="undo"]').click();
    assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), afterRun);
    await page.locator(".narration-bar").waitFor({ timeout: 2_000 });
    assert.equal(await page.locator("audio[data-narration]").count(), 1);
    // The whole run, stopped or not, is one undo step.
    await page.locator('[data-menu="edit"]').click();
    await page.locator('[data-menu-item="undo"]').click();
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
    // Without a style guide, the recipe's colours; the arrow takes the accent (the last one).
    assert.deepEqual(project.artboards.at(-5)?.scene.palette, ["#ffffff", "#1f2a44", "#ffb547"]);
    assert.match(JSON.stringify(project.artboards.at(-4)?.scene), /#ffb547/);
    // Baloo 2 bold in the titles; the balloon's text is in the body's bold.
    assert.deepEqual(await page.evaluate("window.__fontsAsked"), [
      "Baloo 2 700",
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
    await page.locator('[data-menu="edit"]').click();
    await page.locator('[data-menu-item="undo"]').click();
    assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), afterFirst);
    await page.locator('[data-menu="edit"]').click();
    await page.locator('[data-menu-item="undo"]').click();
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

    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});

test("pipelines: on an animation EdiAula asked for, the lesson comes chosen and the run fills that animation", {
  timeout: 90000,
}, async () => {
  const server = await rendererServer(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    // The bridge at the start: the editor subscribes to the requests of other tools when it
    // starts. A string, so tsx adds nothing to it.
    await page.addInitScript(`
      (() => {
        const project = ${JSON.stringify(newProject())};
        const status = { name: "Aula 3.edisvg", path: "C:\\\\Aulas\\\\Aula 3.edisvg", dirty: false };
        window.desktop = {
          projectInitialize: async () => ({ project, status, recovered: false }),
          projectChanged: async () => status,
          onLinkWaiting: (callback) => {
            window.__linkWaiting = callback;
            return () => undefined;
          },
          aiStatus: async () => ({ available: false, clients: [] }),
          handleAiTools: () => () => undefined,
          onAssistantEvent: () => () => undefined,
          onCommand: () => () => undefined,
        };
      })();`);
    await page.goto(server.url);
    await page.locator(".scene-artwork>svg").waitFor();
    await page.evaluate(fakeDesktop(JSON.stringify(game)));
    // The link: a request to make the animation, the manifest of the project's links, and the
    // lesson file EdiAula named (the .ediaula, read by the run as the package is).
    // A string, so tsx adds nothing to it.
    await page.evaluate(`
      (() => {
        window.__items = [];
        window.__registered = [];
        window.__requests = [
          {
            version: 1,
            id: "pedido-0001",
            from: "ediaula",
            type: "create",
            project: "C:\\\\Aulas\\\\Aula 3.edisvg",
            name: "Parte 2",
            width: 1280,
            height: 720,
            fps: 30,
            duration: 10,
            lesson: "C:\\\\Aulas\\\\Aula 3.ediaula",
          },
        ];
        const status = { name: "Aula 3.edisvg", path: "C:\\\\Aulas\\\\Aula 3.edisvg", dirty: false };
        Object.assign(window.desktop, {
          projectChanged: async () => status,
          projectSave: async () => ({ saved: true, ...status }),
          linkNext: async () => window.__requests.shift() ?? null,
          linkOpenProject: async () => ({ same: true, project: null, status }),
          linkDone: async () => undefined,
          linkList: async () => structuredClone(window.__items),
          linkRegister: async (projectId, input) => {
            window.__registered.push(input);
            const before = window.__items.find((i) => i.animationId === input.animationId);
            const item = { ...before, ...input, updatedAt: 1 };
            window.__items = [...window.__items.filter((i) => i !== before), item];
            return item;
          },
          linkLessonFile: async () => ({
            token: "file-aula-000001",
            name: "Aula 3.ediaula",
            kind: "lesson",
            size: 900,
          }),
        });
        window.__linkWaiting();
      })();`);
    await page.waitForFunction(
      () => (window as unknown as { __registered: unknown[] }).__registered.length === 1,
    );
    const made = (await page.evaluate("window.__registered[0]")) as {
      animationId: string;
      artboardId: string;
      lesson: string;
    };
    assert.equal(made.lesson, "C:\\Aulas\\Aula 3.ediaula");

    // The pipelines open on that animation: the lesson already chosen.
    await page.locator('[data-action="pipelines"]').first().click();
    const dialog = page.getByRole("dialog", { name: "Pipelines" });
    await dialog.getByRole("status").getByText("Aula 3").waitFor();
    await dialog
      .locator("li", { hasText: "Demonstração passo a passo" })
      .getByRole("button", { name: "Rodar" })
      .click();
    await dialog.getByText("Aula 3.ediaula (pacote da aula do EdiAula)").waitFor();
    const phrases = dialog.getByRole("group", { name: "Roteiro da aula · Seção 2 · A chave" });
    await phrases.getByRole("checkbox", { name: "Olá de novo, turma." }).uncheck();
    await dialog.getByRole("button", { name: "Rodar pipeline" }).click();
    await dialog.getByText(/^(Pipeline concluído\.|O pipeline parou\.)$/).waitFor();
    await dialog.getByRole("button", { name: "Fechar pipelines" }).click();

    // The run's narration went into the linked animation (no other one was made), the link now
    // draws on the run's layer at the stretch's second, and the empty artboard it came with went.
    await page.waitForFunction(
      () => (window as unknown as { __registered: unknown[] }).__registered.length === 2,
    );
    const relinked = (await page.evaluate("window.__registered[1]")) as {
      animationId: string;
      artboardId: string;
      start: number;
    };
    const project = parseProject(
      JSON.parse((await page.evaluate(() => localStorage.getItem("edisvg-project"))) ?? "null"),
    );
    assert.equal(relinked.animationId, made.animationId);
    const layer = project.artboards.find((b) => b.id === relinked.artboardId);
    assert.equal(layer?.name, "Demonstração · Tela da aula (2:15 a 2:25)");
    assert.equal(Number(relinked.start.toFixed(2)), 135.58);
    assert.equal(
      project.artboards.some((b) => b.id === made.artboardId),
      false,
    );
    assert.equal(project.motion.animations.filter((a) => a.name.startsWith("Narração")).length, 0);
    const animation = project.motion.animations.find((a) => a.id === made.animationId);
    assert.ok((animation?.frames ?? 0) > 200, `${animation?.frames}`);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});

test("pipelines: a style guide picture in the recipe goes to the assistant in readable parts", {
  timeout: 90000,
}, async () => {
  const server = await rendererServer(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    // The assistant's bridge at the start (the panel keeps the one it found): it records what a
    // run sends and ends the turn. A string, so tsx adds nothing to it.
    await page.addInitScript(`
      (() => {
        const project = ${JSON.stringify(newProject())};
        const status = { name: "Sem arquivo", path: null, dirty: false };
        window.__sent = [];
        window.desktop = {
          projectInitialize: async () => ({ project, status, recovered: false }),
          projectChanged: async () => status,
          aiStatus: async () => ({ mcp: { ready: true }, clients: [{ id: "claude", installed: true }] }),
          aiConnect: async () => ({ message: "" }),
          aiStop: async () => {},
          aiSend: async (request) => {
            window.__sent.push({
              prompt: request.prompt,
              images: request.images.map((image) => ({ mediaType: image.mediaType, bytes: image.data.length })),
            });
            // Reading the guide: its colours and fonts, as the question asks (JSON only).
            const answer = request.prompt.includes("responda só com um JSON")
              ? '{"textPalette": ["#FFFFFF", "#0F1A33", "#0B7A54", "#FFC02E"], "fonts": {"title": "Bebas Neue", "body": "Nunito"}}'
              : "";
            setTimeout(() => {
              if (answer) window.__assistantEvent({ type: "text", text: answer });
              window.__assistantEvent({ type: "done" });
            }, 0);
            return { started: true };
          },
          onAssistantEvent: (callback) => { window.__assistantEvent = callback; return () => {}; },
          handleAiTools: () => () => undefined,
          onCommand: () => () => undefined,
        };
      })();`);
    await page.goto(server.url);
    await page.locator(".scene-artwork>svg").waitFor();
    await page.evaluate(fakeDesktop(JSON.stringify(game)));
    await page.locator('[data-action="pipelines"]').first().click();
    const dialog = page.getByRole("dialog", { name: "Pipelines" });
    const scene = dialog.locator("li", { hasText: "Cena animada do jogo" });
    await scene.getByRole("button", { name: "Editar" }).click();

    // A tall guide (800 × 3000, bands of colour), as a style guide page is.
    const bands = [
      [233, 238, 246, 255],
      [27, 92, 243, 255],
      [255, 192, 46, 255],
    ];
    const rows = Array.from({ length: 3000 }, (_, y) =>
      Array.from({ length: 800 }, () => bands[Math.floor(y / 1000)] ?? [0, 0, 0, 255]).flat(),
    );
    await dialog.getByLabel("Imagem do guia de estilo").setInputFiles({
      name: "guia.png",
      mimeType: "image/png",
      buffer: png(800, rows),
    });
    await dialog.getByRole("img", { name: "Guia de estilo guia.png" }).waitFor();
    await dialog.getByRole("button", { name: "Salvar receita" }).click();
    const stored = (await page.evaluate("window.desktop.pipelinesRead()")) as {
      recipes: { id: string; guideImage?: { id: string; name: string } }[];
    };
    assert.deepEqual(stored.recipes.find((r) => r.id === "recipe-cena-do-jogo")?.guideImage, {
      id: `guide-${"1".padStart(32, "0")}`,
      name: "guia.png",
    });

    // The run takes the recipe's guide; it could be changed or left out for this time only. With
    // a guide, reading its colours and fonts is the first step, and nothing else asks for them.
    await scene.getByRole("button", { name: "Rodar" }).click();
    await dialog.getByRole("img", { name: "Guia de estilo guia.png" }).waitFor();
    assert.equal(
      await dialog.locator(".pipeline-steps li").first().locator("span").first().textContent(),
      "Ler as cores e as fontes do guia de estilo",
    );
    assert.equal(await dialog.locator(".pipeline-swatch").count(), 0);
    await dialog.getByRole("button", { name: "Escolher…" }).click();
    await dialog.getByRole("button", { name: "Escolher áudio…" }).click();
    await dialog
      .getByLabel("Roteiro do trecho (só a parte desta cena)")
      .fill(
        "O personagem precisa encontrar a chave antes de chegar ao farol.\nQuando ele pegar a chave, o aviso muda.",
      );
    await dialog.getByRole("button", { name: "Rodar pipeline" }).click();
    await dialog.getByText(/^(Pipeline concluído\.|O pipeline parou\.)$/).waitFor();
    const sent = (await page.evaluate("window.__sent")) as {
      prompt: string;
      images: { mediaType: string; bytes: number }[];
    }[];
    const said = (await dialog.textContent()) ?? "";
    // First the guide is read (its parts, a question for JSON only), then the draft is asked.
    assert.equal(sent.length, 2, said);
    assert.match(sent[0]?.prompt ?? "", /As 3 imagens anexadas são um guia de estilo/);
    assert.match(sent[0]?.prompt ?? "", /Baloo 2, Nunito, Bebas Neue/);
    // 800 × 3000 reads best in three parts at full size (each within ~1.15 MP), sent as PNG.
    for (const request of sent)
      assert.deepEqual(
        request.images.map((image) => image.mediaType),
        ["image/png", "image/png", "image/png"],
      );
    assert.match(said, /Ler as cores e as fontes do guia de estiloPronto/, said);
    assert.match(
      said,
      /Do guia de estilo: cores #ffffff, #0f1a33, #0b7a54, #ffc02e; Bebas Neue nos títulos e Nunito no corpo\./,
      said,
    );
    // The steps use them: Bebas Neue's only weight in the titles, Nunito in the body.
    assert.deepEqual(await page.evaluate("window.__fontsAsked"), [
      "Bebas Neue 400",
      "Nunito 400",
      "Nunito 700",
    ]);
    const prompt = sent[1]?.prompt ?? "";
    assert.match(prompt, /Textos: #ffffff, #0f1a33, #0b7a54, #ffc02e/);
    assert.match(prompt, /## Guia de estilo da receita \(imagem anexada\)/);
    assert.match(prompt, /As 3 primeiras imagens anexadas são o guia de estilo/);
    assert.match(prompt, /vale o guia/);
    // The parts are shown in the assistant panel by name.
    const shown = page.locator(".chat-message.user .chat-images img");
    assert.equal(await shown.count(), 3);
    assert.equal(
      await shown.first().getAttribute("alt"),
      "Imagem de referência: Guia de estilo, parte 1 de 3",
    );
    await page.screenshot({ path: "test-results/pipelines-guide.png" });
    // Run again: the guide was read once and kept with it, so only the draft is asked.
    await dialog.getByRole("button", { name: "Rodar pipeline" }).click();
    await page.waitForFunction(
      () => (window as never as { __sent: unknown[] }).__sent.length === 3,
    );
    await dialog.getByRole("button", { name: "Rodar pipeline" }).waitFor();
    const again = (await page.evaluate("window.__sent")) as { prompt: string }[];
    assert.match(again[2]?.prompt ?? "", /Monte o rascunho da animação/);
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

test("pipelines: a theory lesson sets the presenter's stage at each shot and shows her in it", {
  timeout: 90000,
}, async () => {
  const server = await rendererServer(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    // The assistant picks the shots (JSON only) and then makes no edit: the run stops at the draft,
    // after the spot is made. A string, so tsx adds nothing to it.
    await page.addInitScript(`
      (() => {
        const project = ${JSON.stringify(newProject())};
        const status = { name: "Sem arquivo", path: null, dirty: false };
        window.__sent = [];
        window.desktop = {
          projectInitialize: async () => ({ project, status, recovered: false }),
          projectChanged: async () => status,
          aiStatus: async () => ({ mcp: { ready: true }, clients: [{ id: "claude", installed: true }] }),
          aiConnect: async () => ({ message: "" }),
          aiStop: async () => {},
          aiSend: async (request) => {
            window.__sent.push(request.prompt);
            const answer = request.prompt.includes('"posicoes"')
              ? '{"posicoes": ["close-right", "medium-left"]}'
              : "";
            const part = /a parte ([0-9]+) de/.exec(request.prompt)?.[1];
            setTimeout(async () => {
              if (answer) window.__assistantEvent({ type: "text", text: answer });
              // Drawing (once told to): each part adds a square of its own colour and animates
              // it with the short keys command; the part in __failPart then runs out of time.
              if (part && window.__drawing) try {
                const look = async () =>
                  JSON.parse((await window.__tool({ name: "get_overview", input: {} })).text);
                const edit = async (o, commands) => {
                  const done = await window.__tool({
                    name: "edit_document",
                    input: { projectId: o.projectId, sessionId: o.sessionId, revision: o.revision, artboardId: o.activeArtboardId, commands },
                  });
                  if (!done.ok) throw new Error(done.text);
                };
                const fill = "#" + part.repeat(6);
                let o = await look();
                await edit(o, [{ type: "scene", targetId: null, operation: "add", value: { tag: "rect", attrs: { x: "0", y: "0", width: "10", height: "10", fill } } }]);
                o = await look();
                // A new shape is the selected object.
                await edit(o, [{ type: "motion", command: { type: "keys", animationId: o.activeClipId, targetId: o.selected, tracks: { opacity: [[0, 0], [12, 1, "ease-out"]] } } }]);
                if (window.__failPart === part)
                  window.__assistantEvent({ type: "error", text: "A IA demorou demais para responder." });
              } catch (error) {
                window.__drawError = String(error?.message ?? error);
              }
              window.__assistantEvent({ type: "done" });
            }, 0);
            return { started: true };
          },
          onAssistantEvent: (callback) => { window.__assistantEvent = callback; return () => {}; },
          handleAiTools: (handler) => { window.__tool = handler; return () => {}; },
          onCommand: () => () => undefined,
        };
      })();`);
    await page.goto(server.url);
    await page.locator(".scene-artwork>svg").waitFor();
    await page.evaluate(fakeDesktop(JSON.stringify(game)));
    // Her video is the narration: heard and cut as the voice, and the stretch is 2:15–2:25 of it.
    await page.evaluate(`(() => {
      const desktop = window.desktop;
      const words = desktop.pipelineWords;
      desktop.pipelineWords = async (token, kind) => {
        window.__heard = [token, kind];
        return words("file-audio-00001", "audio");
      };
      desktop.pipelineVideoFacts = async () => ({ width: 1280, height: 720, duration: 600, clicks: null });
      desktop.pipelinePresenter = async (token, from, seconds) => {
        window.__presenter = [token, from, seconds];
        return {
          screen: "#14b43c",
          person: { left: 0.35, top: 0.1, right: 0.65, bottom: 1 },
          preview: new Uint8Array([26, 69, 223, 163]),
        };
      };
    })()`);
    await page.locator('[data-action="pipelines"]').first().click();
    const dialog = page.getByRole("dialog", { name: "Pipelines" });
    await dialog
      .locator("li", { hasText: "Aula teórica com a apresentadora" })
      .getByRole("button", { name: "Rodar" })
      .click();
    // Only her video is asked for.
    assert.equal(await dialog.getByRole("button", { name: "Escolher áudio…" }).count(), 0);
    await dialog.getByRole("button", { name: "Escolher vídeo…" }).click();
    await dialog
      .getByLabel("Roteiro do trecho (só a parte desta cena)")
      .fill(
        "O personagem precisa encontrar a chave antes de chegar ao farol. Quando ele pegar a chave, o aviso muda.",
      );
    await dialog.getByRole("button", { name: "Rodar pipeline" }).click();
    await dialog.getByText(/^(Pipeline concluído\.|O pipeline parou\.)$/).waitFor();
    const said = (await dialog.textContent()) ?? "";
    assert.match(said, /Preparar o vídeo da apresentadora \(tirar o fundo verde\)Pronto/, said);
    assert.match(said, /Escolher os planos da apresentadora .*Pronto/, said);
    assert.match(said, /2 planos da apresentadora\./, said);
    assert.ok(said.includes("do vídeo: Médio curto à direita (x 0.781, y 1.15, escala 2.3)"), said);
    assert.ok(said.includes("do vídeo: Médio à esquerda (x 0.229, y 0.9, escala 1.8)"), said);
    assert.match(
      said,
      /Pedir o rascunho da animação ao assistenteFalhou: Parte 1 de 3 · Fundo: O assistente não alterou/,
    );
    assert.deepEqual(await page.evaluate("window.__heard"), ["file-video-00001", "video"]);
    const [, from, seconds] = (await page.evaluate("window.__presenter")) as number[];
    assert.ok(
      Math.abs((from ?? 0) - 135.58) < 0.4 && Math.abs((seconds ?? 0) - 10.12) < 0.6,
      `${from} ${seconds}`,
    );

    const project = parseProject(
      JSON.parse((await page.evaluate(() => localStorage.getItem("edisvg-project"))) ?? "null"),
    );
    const board = project.artboards.at(-1);
    assert.equal(board?.name, "Aula teórica · demo.mp4");
    assert.deepEqual(board?.scene.viewBox, [0, 0, 1920, 1080]);
    const slot = board?.scene.nodes.find((node) => node.name === "Apresentadora (espaço)");
    assert.ok(slot, JSON.stringify(board?.scene.nodes.map((n) => n.name)));
    assert.equal(slot.locked, true);
    assert.equal(slot.attrs.fill, "none");
    assert.deepEqual([slot.attrs.width, slot.attrs.height], ["1920", "1080"]);
    // From the back: her spot, the background in the ink and the light behind her in the accent.
    assert.deepEqual(
      board?.scene.nodes.slice(0, 3).map((node) => [node.name, node.attrs.fill]),
      [
        ["Apresentadora (espaço)", "none"],
        ["Fundo", "#101b35"],
        ["Fundo · luz atrás da apresentadora", "#ffc23c"],
      ],
    );
    const light = board?.scene.nodes[2];
    assert.match(JSON.stringify(light), /"kind":"radial"/);
    // The guides the content keeps between.
    assert.deepEqual(
      board?.guides?.map((guide) => `${guide.axis} ${guide.position}`),
      ["x 84", "x 960", "x 1836", "y 92", "y 1008"],
    );
    const clip = project.motion.animations.at(-1);
    const keysOf = (id: string | undefined) =>
      Object.fromEntries(
        (clip?.tracks ?? [])
          .filter((track) => track.targetId === id)
          .map((track) => [
            track.property,
            track.keys.map((key) => [key.frame, key.value, key.easing]),
          ]),
      );
    const keys = keysOf(slot.id);
    const cut = keys.x?.[1]?.[0];
    assert.ok(typeof cut === "number" && cut > 30, JSON.stringify(keys));
    // A landscape video: at 2.3 and 1.8 it runs past the left edge, the top on the top.
    const shots = (first: number, second: number) => [
      [0, first, "hold"],
      [cut, second, "hold"],
    ];
    assert.deepEqual(keys, {
      x: shots(-708, -1288),
      y: shots(0, 0),
      sx: shots(2.3, 1.8),
      sy: shots(2.3, 1.8),
    });
    assert.deepEqual(keysOf(light?.id), {
      x: shots(1506, 446),
      y: shots(520, 560),
      sx: shots(1.5, 1.2),
      sy: shots(1.5, 1.2),
    });
    // The draft is told her spot and where she stands in each shot.
    const sent = (await page.evaluate("window.__sent")) as string[];
    assert.ok((sent.at(-1) ?? "").includes(`[${slot.id}] "Apresentadora (espaço)"`));
    assert.match(
      sent.at(-1) ?? "",
      /Corte 1, quadros 0–\d+, frases 1: Médio curto à direita\. Conteúdo em x 84–960, centralizado em x 522/,
    );
    // Her preview is kept with the spot it fills, as WebM.
    const kept = (await page.evaluate("window.__kept")) as {
      kind: string;
      meta: Record<string, unknown>;
    }[];
    assert.deepEqual(kept.find((k) => k.kind === "video")?.meta, {
      artboardId: board?.id,
      offset: 0,
      duration: seconds,
      slotId: slot.id,
      mediaType: "video/webm",
    });

    // Continuar de onde parou: the steps done are not run again, only the draft's parts are
    // asked. The second part runs out of time: its square goes away, the first part's stays.
    const framings = () =>
      page.evaluate(() =>
        (window as never as { __sent: string[] }).__sent.filter((p) => p.includes('"posicoes"')),
      );
    assert.equal((await framings()).length, 1);
    assert.match(said, /parou em: Pedir o rascunho da animação ao assistente \(parte 1 de 3\)/);
    await page.evaluate(() => {
      Object.assign(window, { __drawing: true, __failPart: "2", __sent: [] });
    });
    await dialog.getByRole("button", { name: "Continuar de onde parou" }).click();
    await dialog.getByText(/Falhou: Parte 2 de 3/).waitFor();
    const stoppedAgain = (await dialog.textContent()) ?? "";
    assert.match(
      stoppedAgain,
      /Falhou: Parte 2 de 3 · Corte 1: A IA demorou demais para responder\. As 2 alterações feitas nesta parte foram desfeitas\./,
      stoppedAgain,
    );
    assert.match(stoppedAgain, /\(parte 2 de 3\)/);
    assert.equal((await framings()).length, 0);
    const squares = async () => {
      const kept = parseProject(
        JSON.parse((await page.evaluate(() => localStorage.getItem("edisvg-project"))) ?? "null"),
      );
      const nodes = kept.artboards.at(-1)?.scene.nodes ?? [];
      const clip = kept.motion.animations.at(-1);
      return ["#111111", "#222222", "#333333"].filter((fill) => {
        const node = nodes.find((n) => n.attrs.fill === fill);
        return node && clip?.tracks.some((t) => t.targetId === node.id && t.property === "opacity");
      });
    };
    assert.deepEqual(await squares(), ["#111111"]);
    // Again: parts 2 and 3 only, and the run is done (nothing left to continue).
    await page.evaluate(() => {
      Object.assign(window, { __failPart: null, __sent: [] });
    });
    await dialog.getByRole("button", { name: "Continuar de onde parou" }).click();
    await dialog.getByText("Pipeline concluído.").waitFor();
    const parts = (await page.evaluate("window.__sent")) as string[];
    assert.deepEqual(
      parts.map((p) => /a parte (\d+) de 3/.exec(p)?.[1]),
      ["2", "3"],
    );
    assert.deepEqual(await squares(), ["#111111", "#222222", "#333333"]);
    assert.equal(await dialog.getByRole("button", { name: "Continuar de onde parou" }).count(), 0);
    assert.deepEqual(await page.evaluate("window.__runs"), {});
    assert.equal(await page.evaluate("window.__drawError"), undefined);

    await dialog.getByRole("button", { name: "Fechar pipelines" }).click();
    // She shows over the artwork in her spot: close on the right in the first shot…
    await page
      .locator(".scene-artboard .presenter-frame video.presenter-video")
      .waitFor({ state: "attached" });
    const placed = () =>
      page.evaluate(() => {
        const board = document.querySelector<HTMLElement>(".scene-artboard");
        const video = document.querySelector<HTMLVideoElement>("video.presenter-video");
        if (!board || !video) return null;
        const w = board.offsetWidth;
        const style = video.style;
        return [style.left, style.top, style.width, style.height].map(
          (v) => Math.round((Number.parseFloat(v) / w) * 1000) / 1000,
        );
      });
    assert.deepEqual(await placed(), [-0.369, 0, 2.3, 1.294]);
    // …and the medium shot on the left after the cut (the end of the animation).
    await page.locator('[data-action="end"]').first().click();
    await page.waitForFunction(() => {
      const video = document.querySelector<HTMLVideoElement>("video.presenter-video");
      const board = document.querySelector<HTMLElement>(".scene-artboard");
      return !!video && !!board && Number.parseFloat(video.style.width) < 2 * board.offsetWidth;
    });
    assert.deepEqual(await placed(), [-0.671, 0, 1.8, 1.013]);
    await page.screenshot({ path: "test-results/pipelines-presenter.png" });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});
