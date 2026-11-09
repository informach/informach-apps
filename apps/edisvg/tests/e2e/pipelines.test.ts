import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
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
      lesson: { token: "file-aula-000001", name: "Aula 3.ediaula", kind: "lesson", size: 900 },
      video: { token: "file-video-00001", name: "demo.mp4", kind: "video", size: 9000 },
    };
    window.__pipelineWrites = 0;
    window.desktop = {
      // The editor tells the app about every edit; the app answers with the file's status.
      projectChanged: async () => ({ name: "Sem arquivo", path: null, dirty: true }),
      pipelinesRead: async () => structuredClone(store),
      pipelinesWrite: async (value) => { window.__pipelineWrites++; store = structuredClone(value); return structuredClone(store); },
      pipelinePick: async (kind) => files[kind] ?? null,
      pipelineReadProject: async (token) => {
        if (token !== "file-projeto-0001") throw new Error("token");
        return ${JSON.stringify(project)};
      },
      pipelineWords: async (token, kind) => {
        if (token !== "file-audio-00001" || kind !== "audio") throw new Error("audio");
        return ${JSON.stringify(LESSON_WORDS)};
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
    await dialog
      .getByLabel("Roteiro do trecho (só a parte desta cena)")
      .fill(
        "O personagem precisa encontrar a chave antes de chegar ao farol. Quando ele pegar a chave, o aviso muda.",
      );
    await page.screenshot({ path: "test-results/pipelines-run.png" });
    const beforeRun = await page.evaluate(() => localStorage.getItem("edisvg-project"));
    await run.click();
    await dialog.getByText(/^(Pipeline concluído\.|O pipeline parou\.)$/).waitFor();
    const said = (await dialog.textContent()) ?? "";
    // Everything up to the draft is done; the draft needs the desktop assistant (Claude Code or
    // Codex), which a browser page does not have: the run stops there and says so.
    assert.match(said, /Aplicar as paletas de texto e das imagensPronto/, said);
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
    // The layer's palette is the text palette of the recipe.
    assert.deepEqual(project.artboards.at(-5)?.scene.palette, ["#ffffff", "#1f2a44", "#ffb547"]);
    await dialog.getByRole("button", { name: "Fechar pipelines" }).click();
    // The layer's artboard stays open, with the video under it and the narration over the timeline.
    await page
      .locator(".scene-artboard.has-reference video[data-reference]")
      .waitFor({ state: "attached" });
    await page.locator(".narration-bar").waitFor();
    await page.screenshot({ path: "test-results/pipelines-demo.png" });
    // The whole run is one undo step.
    await page.locator('[data-action="undo"]').first().click();
    assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), beforeRun);
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
