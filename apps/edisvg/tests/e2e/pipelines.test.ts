import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "playwright";
import { parseProject } from "../../src/shared/project";
import { rendererServer } from "../rendererServer";
import { game } from "../szprojectFixture";

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
      // The editor tells the app about every edit; nothing to do here.
      projectChanged: async () => undefined,
      pipelinesRead: async () => structuredClone(store),
      pipelinesWrite: async (value) => { window.__pipelineWrites++; store = structuredClone(value); return structuredClone(store); },
      pipelinePick: async (kind) => files[kind] ?? null,
      pipelineReadProject: async (token) => {
        if (token !== "file-projeto-0001") throw new Error("token");
        return ${JSON.stringify(project)};
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
    await dialog
      .getByLabel("Roteiro do trecho (só a parte desta cena)")
      .fill("O personagem precisa encontrar a chave antes de chegar ao farol.");
    await page.screenshot({ path: "test-results/pipelines-run.png" });
    await run.click();
    await dialog.getByText(/^(Pipeline concluído\.|O pipeline parou\.)$/).waitFor();
    const said = (await dialog.textContent()) ?? "";
    assert.ok(said.includes("Pipeline concluído."), said);
    await dialog.getByText(/3 imagens viraram pranchetas/).waitFor();
    const project = parseProject(
      JSON.parse((await page.evaluate(() => localStorage.getItem("edisvg-project"))) ?? "null"),
    );
    assert.equal(project.artboards.at(-1)?.name, "Cena · A Chave do Farol");
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
