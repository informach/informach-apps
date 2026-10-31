import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "playwright";
import { newProject } from "../../src/shared/project";
import { rendererServer } from "../rendererServer";

// A 1×1 PNG, and a desktop bridge that keeps what the panel sends instead of starting a client.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const bridge = (project: string) => `
  window.__sent = [];
  window.desktop = {
    projectInitialize: async () => ({ project: ${project}, status: { name: "Sem arquivo", path: null, dirty: false } }),
    projectChanged: async () => ({ name: "Sem arquivo", path: null, dirty: true }),
    aiStatus: async () => ({ mcp: { ready: true }, clients: [{ id: "claude", installed: true }] }),
    aiConnect: async () => ({ message: "" }),
    aiStop: async () => {},
    aiSend: async (request) => {
      window.__sent.push({
        prompt: request.prompt,
        images: request.images.map((image) => ({ mediaType: image.mediaType, bytes: image.data.length })),
      });
      setTimeout(() => window.__assistantEvent({ type: "done" }), 0);
      return { started: true };
    },
    onAssistantEvent: (callback) => { window.__assistantEvent = callback; return () => {}; },
    handleAiTools: () => () => {},
    onCommand: () => () => {},
  };`;

test("O assistente aceita imagens de referência: anexar, remover, enviar e manter na conversa", {
  timeout: 60000,
}, async () => {
  const server = await rendererServer();
  const channel = process.env.EDISVG_TEST_BROWSER_CHANNEL;
  const browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 950 } }),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(bridge(JSON.stringify(newProject())));
    await page.goto(server.url);
    await page.locator('[data-action="assistant"]').click();
    const panel = page.locator(".assistant-panel");
    await panel.waitFor();
    const file = (name: string) => ({ name, mimeType: "image/png", buffer: PNG });
    await panel.locator("[data-file]").setInputFiles([file("a.png"), file("b.png")]);
    const pending = panel.locator("[data-attachments] img");
    await page.waitForFunction(
      () => document.querySelectorAll("[data-attachments] img").length === 2,
    );
    assert.equal(await pending.first().getAttribute("alt"), "Imagem de referência: a.png");
    await panel.getByRole("button", { name: "Remover a.png" }).click();
    assert.equal(await pending.count(), 1);
    // A message with only an image still goes, with a default request.
    await panel.locator("[type=submit]").click();
    await page.waitForFunction(
      () => (window as never as { __sent: unknown[] }).__sent.length === 1,
    );
    assert.equal(await panel.locator("[data-attachments]").isHidden(), true);
    assert.equal(await panel.locator(".chat-message.user .chat-images img").count(), 1);
    await page.waitForFunction(
      () => !document.querySelector<HTMLButtonElement>(".assistant-panel [type=submit]")?.disabled,
    );
    await panel.locator("textarea").fill("agora deixe mais parecido");
    await panel.locator("[type=submit]").click();
    await page.waitForFunction(
      () => (window as never as { __sent: unknown[] }).__sent.length === 2,
    );
    const sent = await page.evaluate(
      () =>
        (
          window as never as {
            __sent: { prompt: string; images: { mediaType: string; bytes: number }[] }[];
          }
        ).__sent,
    );
    assert.match(sent[0]?.prompt ?? "", /\[1 imagem de referência anexada\] Use a imagem anexada/);
    assert.deepEqual(sent[0]?.images, [{ mediaType: "image/png", bytes: PNG.length }]);
    // The follow-up keeps the reference of the conversation.
    assert.deepEqual(sent[1]?.images, [{ mediaType: "image/png", bytes: PNG.length }]);
    assert.match(sent[1]?.prompt ?? "", /Usuário: agora deixe mais parecido$/);
    // A file that is not an image is refused with a message, nothing attached.
    await panel
      .locator("[data-file]")
      .setInputFiles({ name: "x.png", mimeType: "image/png", buffer: Buffer.from("nope") });
    await page.getByText("Não foi possível ler a imagem.").waitFor();
    assert.equal(await pending.count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});
