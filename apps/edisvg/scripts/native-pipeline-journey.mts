import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import type { ElectronApplication, Page } from "playwright";
import { game } from "../tests/szprojectFixture.ts";

const run = promisify(execFile);

/**
 * The game scene recipe under Electron, end to end in the main process: the picked studio project
 * is read, the picked EdiAula lesson gives its words on its clock, the narration of the stretch is
 * mixed by the suite's FFmpeg, and the scene animation opens with the narration over its timeline.
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
  const transcript = join(root, "pipeline-voz-transcricao.json");
  await writeFile(
    transcript,
    JSON.stringify({ words: words.map((w) => ({ ...w, start: w.start + 120, end: w.end + 120 })) }),
  );
  const lesson = join(root, "pipeline-aula.ediaula");
  await writeFile(
    lesson,
    JSON.stringify({
      version: 1,
      assets: [{ id: "voz", path: voice, transcript, transcriptStatus: "ready", hasAudio: true }],
      tracks: [{ id: "narracao", muted: false }],
      clips: [{ assetId: "voz", trackId: "narracao", start: 0, in: 0, duration: 160, volume: 1 }],
    }),
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
  const restore = () =>
    application.evaluate(({ dialog }) => {
      const holder = globalThis as unknown as { __originalOpen?: typeof dialog.showOpenDialog };
      if (holder.__originalOpen) Reflect.set(dialog, "showOpenDialog", holder.__originalOpen);
      holder.__originalOpen = undefined;
    });

  const runScene = async (audioButton: "Escolher aula…" | "Escolher áudio…", script: string) => {
    await editor.locator('[data-action="pipelines"]').first().click();
    const dialog = editor.getByRole("dialog", { name: "Pipelines" });
    await dialog
      .locator("li", { hasText: "Cena animada do jogo" })
      .getByRole("button", { name: "Rodar" })
      .click();
    await dialog.getByRole("button", { name: "Escolher…" }).click();
    await dialog.getByText("pipeline-projeto.szproject.json").waitFor();
    await dialog.getByRole("button", { name: audioButton }).click();
    await dialog.getByLabel("Roteiro do trecho (só a parte desta cena)").fill(script);
    await dialog.getByRole("button", { name: "Rodar pipeline" }).click();
    await dialog
      .getByText(/^(Pipeline concluído\.|O pipeline parou\.)$/)
      .waitFor({ timeout: 180_000 });
    const said = (await dialog.textContent()) ?? "";
    assert.ok(said.includes("Pipeline concluído."), said);
    await dialog.getByRole("button", { name: "Fechar pipelines" }).click();
    return said;
  };

  const before = await editor.evaluate(() => localStorage.getItem("edisvg-project"));
  try {
    await answer([project, lesson]);
    const said = await runScene(
      "Escolher aula…",
      "O personagem precisa encontrar a chave antes de chegar ao farol. Quando ele pegar a chave, o aviso muda.",
    );
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
    // Undone back to the project as it was: the next journeys start from the same document.
    for (let step = 0; step < 20; step++) {
      if ((await editor.evaluate(() => localStorage.getItem("edisvg-project"))) === before) break;
      // The keyboard: in the narrow native layout the menu's Desfazer button is hidden.
      await editor.locator(".scene-artwork").first().click({ position: { x: 2, y: 2 } });
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
