import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { strToU8, zipSync } from "fflate";
import type { ElectronApplication, Page } from "playwright";
import { game } from "../tests/szprojectFixture.ts";

const run = promisify(execFile);

/**
 * The game scene recipe under Electron, end to end in the main process: the picked studio project
 * is read, the picked package of an EdiAula lesson is unpacked and gives its words on its clock,
 * the narration of the stretch is mixed by the suite's FFmpeg, and the scene animation opens with
 * the narration over its timeline. The screen demonstration takes its video from the same package.
 * The file dialogs are answered in the main process and given back afterwards (the next journeys
 * answer real Windows dialogs). With EDISVG_PIPELINE_WHISPER=1 an audio file is also transcribed
 * by EdiAula's engine (installed on that machine; never in CI).
 */
export async function verifySvgNativePipelineJourney(
  editor: Page,
  application: ElectronApplication,
  root: string,
  screenshot: string,
): Promise<void> {
  const ffmpeg = resolve(".cache/edi-native-media/windows-x64/bin/ffmpeg.exe");
  const words = JSON.parse(
    await readFile(resolve("packages/edi-speech/tests/fixtures/farol-words.json"), "utf8"),
  ).words as { text: string; start: number; end: number; p: number }[];
  // A lesson of EdiAula: a 160 s voice whose transcript says the lighthouse scene at 2:00.
  const voice = join(root, "pipeline-voz.wav");
  await run(ffmpeg, [
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=220:duration=160",
    voice,
  ]);
  const transcript = JSON.stringify({
    words: words.map((w) => ({ ...w, start: w.start + 120, end: w.end + 120 })),
  });
  // The screen of a guided take, from lesson 134 s: the stretch (135.98–145.7) shows its
  // seconds 1.98–11.7, where the cursor data has two clicks.
  const screen = join(root, "pipeline-tela.mp4");
  await run(ffmpeg, [
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=1280x720:rate=30:duration=30",
    "-pix_fmt",
    "yuv420p",
    screen,
  ]);
  const cursor = JSON.stringify({
    version: 2,
    width: 1280,
    height: 720,
    clicks: [
      [4, 640, 80, 0, 0.05],
      [8, 200, 600, 0, 0.05],
      [20, 10, 10, 0, 0.05],
    ],
  });
  // EdiAula's package of the lesson (Arquivo › Empacotar a aula): stored, paths under media/.
  const lesson = join(root, "pipeline-aula.zip");
  await writeFile(
    lesson,
    zipSync(
      {
        "aula.ediaula": strToU8(
          JSON.stringify({
            version: 1,
            // The script of this lesson (one section): its phrases are offered to the run.
            script: {
              text: [
                "## Parte 1. A chave",
                "",
                '**Na tela:** No "O personagem", apontar o personagem [apontar jogo 53 173].',
                "",
                "**Fala para ElevenLabs:**",
                "",
                "```text",
                "O personagem precisa encontrar a chave antes de chegar ao farol. Quando ele pegar a chave, o aviso muda.",
                "```",
              ].join("\n"),
            },
            assets: [
              {
                id: "voz",
                path: "media/voz-narracao.wav",
                transcript: "media/voz-transcricao.json",
                transcriptStatus: "ready",
                hasAudio: true,
                recording: { role: "narration" },
              },
              {
                id: "pagina",
                path: "media/pagina-som-da-pagina.wav",
                hasAudio: true,
                recording: { role: "system" },
              },
              {
                id: "tela",
                path: "media/tela-tela.mp4",
                cursor: "media/tela-cursor.json",
                hasVideo: true,
                hasAudio: false,
                width: 1280,
                height: 720,
                fps: 30,
                recording: { role: "screen" },
              },
            ],
            tracks: [
              { id: "video", kind: "video" },
              { id: "narracao", kind: "audio", name: "Narração guiada" },
              { id: "pagina", kind: "audio", name: "Som da página" },
            ],
            clips: [
              { assetId: "voz", trackId: "narracao", start: 0, in: 0, duration: 160, volume: 1 },
              { assetId: "pagina", trackId: "pagina", start: 0, in: 0, duration: 160, volume: 1 },
              { assetId: "tela", trackId: "video", start: 134, in: 0, duration: 30, volume: 1 },
            ],
          }),
        ),
        "media/voz-narracao.wav": new Uint8Array(await readFile(voice)),
        "media/voz-transcricao.json": strToU8(transcript),
        "media/pagina-som-da-pagina.wav": new Uint8Array(await readFile(voice)),
        "media/tela-tela.mp4": new Uint8Array(await readFile(screen)),
        "media/tela-cursor.json": strToU8(cursor),
      },
      { level: 0 },
    ),
  );
  const project = join(root, "pipeline-projeto.szproject.json");
  await writeFile(project, JSON.stringify(game));

  const answer = (paths: string[]) =>
    application.evaluate(({ dialog }, files) => {
      const holder = globalThis as unknown as { __originalOpen?: typeof dialog.showOpenDialog };
      holder.__originalOpen ??= dialog.showOpenDialog;
      const queue = [...files];
      Reflect.set(dialog, "showOpenDialog", async () => {
        const next = queue.shift();
        return next ? { canceled: false, filePaths: [next] } : { canceled: true, filePaths: [] };
      });
    }, paths);
  const answerSave = (path: string) =>
    application.evaluate(({ dialog }, file) => {
      const holder = globalThis as unknown as { __originalSave?: typeof dialog.showSaveDialog };
      holder.__originalSave ??= dialog.showSaveDialog;
      Reflect.set(dialog, "showSaveDialog", async () => ({ canceled: false, filePath: file }));
    }, path);
  const restore = () =>
    application.evaluate(({ dialog }) => {
      const holder = globalThis as unknown as {
        __originalOpen?: typeof dialog.showOpenDialog;
        __originalSave?: typeof dialog.showSaveDialog;
      };
      if (holder.__originalOpen) Reflect.set(dialog, "showOpenDialog", holder.__originalOpen);
      if (holder.__originalSave) Reflect.set(dialog, "showSaveDialog", holder.__originalSave);
      holder.__originalOpen = undefined;
      holder.__originalSave = undefined;
    });

  const runScene = async (
    audioButton: "Escolher aula…" | "Escolher áudio…",
    script: string | null,
  ) => {
    await editor.locator('[data-action="pipelines"]').first().click();
    const dialog = editor.getByRole("dialog", { name: "Pipelines" });
    await dialog
      .locator("li", { hasText: "Cena animada do jogo" })
      .getByRole("button", { name: "Rodar" })
      .click();
    await dialog.getByRole("button", { name: "Escolher…" }).click();
    await dialog.getByText("pipeline-projeto.szproject.json").waitFor();
    await dialog.getByRole("button", { name: audioButton }).click();
    if (script === null)
      // The lesson's script, read from the package by the main process: every phrase picked.
      await dialog
        .getByRole("group", { name: "Roteiro da aula · Seção 1 · A chave" })
        .getByText("2 de 2 frases nesta animação.", { exact: false })
        .waitFor();
    else await dialog.getByLabel("Roteiro do trecho (só a parte desta cena)").fill(script);
    await dialog.getByRole("button", { name: "Rodar pipeline" }).click();
    await dialog
      .getByText(/^(Pipeline concluído\.|O pipeline parou\.)$/)
      .waitFor({ timeout: 180_000 });
    const said = (await dialog.textContent()) ?? "";
    // Up to the narration the run is the app's own; the draft needs Claude Code or Codex, which
    // the native verification keeps out of reach on purpose: there the run stops, saying why.
    assert.match(said, /Preparar a narração na préviaPronto/, said);
    assert.match(said, /Aplicar as paletas de texto e das imagensPronto/, said);
    // The fonts come from EdiAula's bundle through the main process (Baloo 2 and Nunito).
    assert.match(said, /Incorporar as fontes de título e corpoPronto/, said);
    assert.match(said, /Pedir o rascunho da animação ao assistenteFalhou: /, said);
    await dialog.getByRole("button", { name: "Fechar pipelines" }).click();
    // The draft step opened the assistant panel: closed for the next journeys.
    const closeAssistant = editor.getByRole("button", { name: "Fechar assistente" });
    if (await closeAssistant.isVisible()) await closeAssistant.click();
    return said;
  };

  const before = await editor.evaluate(() => localStorage.getItem("edisvg-project"));
  try {
    await answer([project, lesson]);
    const said = await runScene("Escolher aula…", null);
    assert.match(said, /Trecho achado na aula de 2:15 a 2:24, com 2 frases\./);
    const bar = editor.locator(".narration-bar");
    await bar.waitFor();
    assert.equal(await bar.locator(".narration-line").count(), 2);
    // The narration really plays with the animation (the mixed WAV decodes and has its length).
    const length = await editor.evaluate(
      () =>
        new Promise<number>((done, fail) => {
          const audio = document.querySelector<HTMLAudioElement>("audio[data-narration]");
          if (!audio) return fail(new Error("no narration element"));
          if (audio.readyState >= 1) return done(audio.duration);
          setTimeout(() => fail(new Error("narration did not load in 15 s")), 15_000);
          audio.addEventListener("loadedmetadata", () => done(audio.duration), { once: true });
          audio.addEventListener("error", () => fail(new Error("narration did not decode")), {
            once: true,
          });
        }),
    );
    // "O personagem" at 135.98 s to "muda." at 144.9 s, with 0.4 s before and 0.8 s after.
    assert.ok(Math.abs(length - 10.1) < 0.4, `narration of ${length} s`);
    await editor.screenshot({ path: screenshot });
    console.log("Verified the game scene pipeline with an EdiAula lesson under Electron: edisvg");

    if (process.env.EDISVG_PIPELINE_WHISPER === "1") {
      const audio = process.env.EDISVG_PIPELINE_AUDIO;
      assert.ok(audio, "EDISVG_PIPELINE_AUDIO: a WAV of the lighthouse narration");
      await answer([project, audio]);
      const heard = await runScene(
        "Escolher áudio…",
        "Depois, arraste o bloco de variáveis para o começo do programa.",
      );
      assert.match(heard, /Trecho achado na aula de 0:10 a 0:1\d, com 1 frase\./);
      console.log("Verified the game scene pipeline transcribing an audio file: edisvg");
    }

    // The screen demonstration: the same package brings the screen, cut to the stretch by the
    // suite's FFmpeg, with its clicks, under the layer.
    await answer([lesson]);
    await editor.locator('[data-action="pipelines"]').first().click();
    const pipelines = editor.getByRole("dialog", { name: "Pipelines" });
    await pipelines
      .locator("li", { hasText: "Demonstração passo a passo" })
      .getByRole("button", { name: "Rodar" })
      .click();
    await pipelines.getByRole("button", { name: "Escolher aula…" }).click();
    await pipelines
      .getByText("Vem do pacote da aula: a tela gravada no trecho do roteiro.")
      .waitFor();
    await pipelines
      .getByRole("group", { name: "Roteiro da aula · Seção 1 · A chave" })
      .getByText("2 de 2 frases nesta animação.", { exact: false })
      .waitFor();
    await pipelines.getByRole("button", { name: "Rodar pipeline" }).click();
    await pipelines
      .getByText(/^(Pipeline concluído\.|O pipeline parou\.)$/)
      .waitFor({ timeout: 180_000 });
    const demoSaid = (await pipelines.textContent()) ?? "";
    assert.match(demoSaid, /Preparar o vídeo da demonstraçãoPronto/, demoSaid);
    assert.match(demoSaid, /Incorporar as fontes de título e corpoPronto/, demoSaid);
    assert.match(demoSaid, /Demonstração 1280×720: 2 cliques gravados no trecho\./, demoSaid);
    assert.match(
      demoSaid,
      /Criar os elementos prontos \(seta, balão, destaque e clique\)Pronto/,
      demoSaid,
    );
    await pipelines.getByRole("button", { name: "Fechar pipelines" }).click();
    const closeDemoAssistant = editor.getByRole("button", { name: "Fechar assistente" });
    if (await closeDemoAssistant.isVisible()) await closeDemoAssistant.click();
    // The demonstration plays under the layer (the light H.264 copy decodes in Electron).
    await editor.evaluate(
      () =>
        new Promise<void>((done, fail) => {
          const video = document.querySelector<HTMLVideoElement>("video[data-reference]");
          if (!video) return fail(new Error("no reference video"));
          if (video.readyState >= 2) return done();
          setTimeout(() => fail(new Error("reference video did not load in 15 s")), 15_000);
          video.addEventListener("loadeddata", () => done(), { once: true });
          video.addEventListener("error", () => fail(new Error("reference video did not decode")), {
            once: true,
          });
        }),
    );
    await editor.screenshot({ path: screenshot.replace(/\.png$/, "-demonstracao.png") });
    // The transparent layer: the narration's animation as WebM with alpha, named for the lesson.
    const layer = join(root, "pipeline-camada.webm");
    await answerSave(layer);
    await editor.locator('[data-action="export"]').click();
    await editor.locator('[name="format"][value="alpha-webm"]').check();
    await editor.getByLabel("Largura da exportação").fill("640");
    await editor.getByLabel("Largura da exportação").press("Tab");
    await editor.getByLabel("Confirmar conversão em imagens").check();
    const animationOnly = editor.getByLabel("Confirmar exportação somente da timeline");
    if (await animationOnly.isVisible()) await animationOnly.check();
    await editor.locator("#download").click();
    await editor.locator("#export-dialog").waitFor({ state: "hidden", timeout: 240_000 });
    const ffprobe = resolve(".cache/edi-native-media/windows-x64/bin/ffprobe.exe");
    const { stdout } = await run(ffprobe, [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_name:stream_tags=alpha_mode",
      "-of",
      "csv=p=0",
      layer,
    ]);
    assert.match(stdout.trim(), /^vp9,1$/, `layer stream: ${stdout}`);
    console.log(
      "Verified the screen demonstration pipeline and its transparent layer under Electron: edisvg",
    );

    // Undone back to the project as it was: the next journeys start from the same document.
    for (let step = 0; step < 20; step++) {
      if ((await editor.evaluate(() => localStorage.getItem("edisvg-project"))) === before) break;
      // The keyboard: in the narrow native layout the menu's Desfazer button is hidden.
      await editor
        .locator(".scene-artwork")
        .first()
        .click({ position: { x: 2, y: 2 } });
      await editor.keyboard.press("Control+z");
    }
    assert.equal(
      await editor.evaluate(() => localStorage.getItem("edisvg-project")),
      before,
      "the pipeline's edits were not all undone",
    );
  } finally {
    await restore();
  }
}
