import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "playwright";
import { newProject } from "../../src/shared/project";
import { rendererServer } from "../rendererServer";

// A desktop bridge whose run is driven by the test: events and editor tools are sent by hand.
const bridge = (project: string) => `
  window.desktop = {
    projectInitialize: async () => ({ project: ${project}, status: { name: "Sem arquivo", path: null, dirty: false } }),
    projectChanged: async () => ({ name: "Sem arquivo", path: null, dirty: true }),
    aiStatus: async () => ({ mcp: { ready: true }, clients: [{ id: "claude", installed: true }] }),
    aiConnect: async () => ({ message: "" }),
    aiStop: async () => {},
    aiSend: async () => ({ started: true }),
    onAssistantEvent: (callback) => { window.__event = callback; return () => {}; },
    handleAiTools: (handler) => { window.__tool = handler; return () => {}; },
    onCommand: () => () => {},
  };`;

type Driven = {
  __event: (event: { type: string; text?: string; stopped?: boolean }) => void;
  __tool: (call: { name: string; input: unknown }) => Promise<unknown>;
};

test("O assistente mostra o que está fazendo em palavras e resume as alterações no fim", {
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
    const panel = page.locator(".assistant-panel"),
      activity = panel.locator(".chat-activity");
    await panel.waitFor();
    await panel.locator("textarea").fill("renomeie o projeto");
    await panel.locator("[type=submit]").click();
    assert.equal(await activity.textContent(), "Pensando…");
    assert.equal(await panel.locator(".chat-message.assistant").isHidden(), true);

    await page.evaluate(() =>
      (window as never as Driven).__event({ type: "tool", text: "Lendo o projeto" }),
    );
    assert.equal(await activity.textContent(), "Lendo o projeto…");
    await page.evaluate(() =>
      (window as never as Driven).__tool({ name: "get_overview", input: {} }),
    );
    await page.evaluate(() =>
      (window as never as Driven).__event({ type: "tool", text: "Renomeando o projeto" }),
    );
    await page.evaluate(() =>
      (window as never as Driven).__tool({ name: "rename_project", input: { name: "Mascote" } }),
    );
    // One line for the whole reply: no tool names, no line per call.
    assert.equal(await activity.count(), 1);
    assert.equal(await activity.textContent(), "Renomeando o projeto…");
    await page.evaluate(() =>
      (window as never as Driven).__event({ type: "text", text: "Pronto." }),
    );
    assert.equal(await activity.isHidden(), true);
    await page.evaluate(() => (window as never as Driven).__event({ type: "done" }));
    assert.equal(await panel.locator(".chat-message.assistant").textContent(), "Pronto.");
    assert.equal(await activity.textContent(), "1 alteração aplicada ao projeto · Ctrl+Z desfaz");
    assert.equal(await activity.isVisible(), true);
    assert.doesNotMatch(
      (await panel.locator(".assistant-messages").textContent()) ?? "",
      /_|Ferramenta|Aplicado/,
    );

    // A reply that only reads leaves no line behind.
    await panel.locator("textarea").fill("o que tem no projeto?");
    await panel.locator("[type=submit]").click();
    await page.evaluate(() =>
      (window as never as Driven).__event({ type: "tool", text: "Lendo o projeto" }),
    );
    await page.evaluate(() =>
      (window as never as Driven).__tool({ name: "get_overview", input: {} }),
    );
    await page.evaluate(() =>
      (window as never as Driven).__event({ type: "text", text: "Um mascote." }),
    );
    await page.evaluate(() => (window as never as Driven).__event({ type: "done" }));
    assert.equal(await activity.count(), 1);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});
