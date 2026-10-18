import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { defaultLayoutContainer, defaultLayoutItem } from "@informach/edi-motion/layout";
import type { createInteractiveSvgPlayer } from "@informach/edi-motion/runtime";
import { chromium } from "playwright";
import { compileInteractiveArtboard } from "../../src/shared/interactive";
import { independentComponentsFixture } from "../componentFixture";
import { offlineBundle } from "../offlineBundle";
import { rendererServer } from "../rendererServer";

test("component instances have independent state/data/inputs, one coordinated clock, scoped events and transactional advance", {
  timeout: 60000,
}, async () => {
  const fixture = independentComponentsFixture(),
    compiled = compileInteractiveArtboard(fixture.project, fixture.rootId),
    children = compiled.document.components;
  if (children?.length !== 2) throw new Error("Missing components");
  const channel = process.env.EDISVG_TEST_BROWSER_CHANNEL;
  if (channel && !["msedge", "chrome"].includes(channel)) throw new Error("Invalid browser");
  const browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage(),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setContent(compiled.svg);
    await page.addScriptTag({ content: await offlineBundle() });
    const result = await page.evaluate(
      ({ document, paths }) => {
        const root = window.document.querySelector("svg"),
          api = window.EdiSVGRuntime;
        if (!(root instanceof SVGSVGElement) || !api) throw new Error("Missing runtime");
        const player: ReturnType<typeof createInteractiveSvgPlayer> =
            api.createInteractiveSvgPlayer(root, document, {
              autoplay: false,
              pauseOffscreen: false,
            }),
          a = player.getComponent(paths[0] ?? []),
          b = player.getComponent(paths[1] ?? []),
          events: { name: string; path?: string[] }[] = [];
        player.onEvent((event) => events.push({ name: event.name, path: event.instancePath }));
        a.setInput("input-name", "Bia");
        a.trigger("input-click");
        player.advance(0.2);
        const initial = {
          a: a.inspect(),
          b: b.inspect(),
          aData: a.getData("instance-person", ["field-name"]),
          bData: b.getData("instance-person", ["field-name"]),
          events,
          names: [...root.querySelectorAll("text")].map((text) => text.textContent),
        };
        player.pause();
        player.advance(0.1);
        const pausedManual = a.time;
        a.advance(0.1);
        const isolatedManual = { a: a.time, b: b.time, root: player.time };
        let guarded = false;
        const remove = a.onInputChange(() => {
          try {
            b.setInput("input-name", "illegal");
          } catch (error) {
            if (!(error instanceof Error) || !error.message.includes("callbacks")) throw error;
            guarded = true;
          }
        });
        a.setInput("input-name", "Caio");
        remove();
        const before = [player.time, a.time, b.time];
        let refused = false;
        try {
          player.advance(11);
        } catch (error) {
          if (!(error instanceof Error) || !error.message.includes("10")) throw error;
          refused = true;
        }
        const after = [player.time, a.time, b.time];
        player.reset();
        const reset = {
          a: a.inspect(),
          b: b.inspect(),
          names: [...root.querySelectorAll("text")].map((text) => text.textContent),
        };
        player.destroy();
        player.destroy();
        let destroyed = false;
        try {
          a.trigger("input-click");
        } catch (error) {
          if (!(error instanceof Error) || !error.message.includes("encerrado")) throw error;
          destroyed = true;
        }
        return {
          initial,
          pausedManual,
          isolatedManual,
          guarded,
          before,
          after,
          refused,
          reset,
          destroyed,
          roles: root.querySelectorAll('[role="button"]').length,
        };
      },
      { document: compiled.document, paths: children.map((child) => child.instancePath) },
    );
    assert.equal(result.initial.a.layers[0]?.stateId, "state-wave");
    assert.equal(result.initial.b.layers[0]?.stateId, "state-idle");
    assert.equal(result.initial.a.time, 0.2);
    assert.equal(result.initial.b.time, 0.2);
    assert.deepEqual(result.initial.names, ["Bia", "Ana"]);
    assert.equal(result.initial.aData, "Bia");
    assert.equal(result.initial.bData, "Ana");
    assert.deepEqual(result.initial.events, [{ name: "wave", path: children[0]?.instancePath }]);
    assert.ok(Math.abs(result.pausedManual - 0.3) < 1e-10);
    assert.ok(Math.abs(result.isolatedManual.a - 0.4) < 1e-10);
    assert.ok(Math.abs(result.isolatedManual.b - 0.3) < 1e-10);
    assert.deepEqual(result.after, result.before);
    assert.equal(result.refused, true);
    assert.equal(result.guarded, true);
    assert.equal(result.reset.a.layers[0]?.stateId, "state-idle");
    assert.equal(result.reset.b.time, 0);
    assert.deepEqual(result.reset.names, ["Ana", "Ana"]);
    assert.equal(result.destroyed, true);
    assert.equal(result.roles, 0);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("the real Testar panel edits component data without touching the project and exports nested interaction offline", {
  timeout: 60000,
}, async (context) => {
  const fixture = independentComponentsFixture(),
    server = await rendererServer();
  context.after(() => server.close());
  const channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    await page.addInitScript(
      (project) => localStorage.setItem("edisvg-project", JSON.stringify(project)),
      fixture.project,
    );
    await page.goto(server.url);
    await page.locator(".scene-artwork>svg").waitFor();
    const before = await page.evaluate(() => localStorage.getItem("edisvg-project"));
    await page.locator('[data-action="test"]').click();
    await page.getByRole("button", { name: "Pausar teste", exact: true }).click();
    const scopes = page.locator('section[aria-label="Sessões de componentes"] > details'),
      first = scopes.first();
    assert.equal(await scopes.count(), 2);
    await first.locator(":scope > summary").click();
    await first.getByRole("textbox", { name: "Name", exact: true }).fill("Bia");
    await first.getByRole("button", { name: "Aplicar Name", exact: true }).click();
    assert.deepEqual(await page.locator(".behavior-test-preview text").allTextContents(), [
      "Bia",
      "Ana",
    ]);
    const data = first.locator("details");
    await data.locator("summary").click();
    assert.equal(
      await data.getByRole("textbox", { name: "Name", exact: true }).inputValue(),
      "Bia",
    );
    await data.getByRole("textbox", { name: "Name", exact: true }).fill("Caio");
    await data.getByRole("button", { name: "Aplicar Name", exact: true }).click();
    assert.deepEqual(await page.locator(".behavior-test-preview text").allTextContents(), [
      "Caio",
      "Ana",
    ]);
    await first.getByRole("button", { name: "Resetar esta instância", exact: true }).click();
    assert.deepEqual(await page.locator(".behavior-test-preview text").allTextContents(), [
      "Ana",
      "Ana",
    ]);
    await page.getByRole("button", { name: "Fechar teste", exact: true }).click();
    assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), before);
    await page.locator('[data-action="export"]').click();
    assert.equal(await page.locator('[name="format"][value="interactive-html"]').isChecked(), true);
    const pending = page.waitForEvent("download");
    await page.locator("#download").click();
    const path = await (await pending).path();
    if (!path) throw new Error("Missing download");
    const standalone = await browser.newPage();
    standalone.on("pageerror", (error) => errors.push(error.message));
    await standalone.route("**/*", (route) => route.abort());
    await standalone.setContent(await readFile(path, "utf8"));
    await standalone.waitForFunction(() => !!window.ediSVGInteractivePlayer);
    await standalone.evaluate(
      (path) =>
        window.ediSVGInteractivePlayer?.getComponent(path).setInput("input-name", "Offline"),
      [fixture.instances[0] ?? ""],
    );
    assert.deepEqual(await standalone.locator("#edi-artwork text").allTextContents(), [
      "Offline",
      "Ana",
    ]);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("responsive components receive their allocated logical viewport and a failing child advance publishes no clock", {
  timeout: 60000,
}, async () => {
  const fixture = independentComponentsFixture(),
    root = fixture.project.artboards.find((board) => board.id === fixture.rootId),
    master = fixture.project.artboards.find((board) => board.id === fixture.masterId);
  if (!root || !master) throw new Error("Missing boards");
  root.layout = {
    version: 1,
    root: { ...defaultLayoutContainer(), flow: "row", gap: [0, 0] },
    containers: [],
    items: fixture.instances.map((id) => ({
      ...defaultLayoutItem(id),
      width: { kind: "fill", weight: 1 },
      height: { kind: "fill", weight: 1 },
    })),
  };
  master.layout = {
    version: 1,
    root: { ...defaultLayoutContainer(), flow: "column", padding: [10, 10, 10, 10] },
    containers: [],
    items: [fixture.body, fixture.text].map((id) => ({
      ...defaultLayoutItem(id),
      width: { kind: "fill", weight: 1 },
      height: { kind: "fixed", value: 30 },
    })),
  };
  const compiled = compileInteractiveArtboard(fixture.project, fixture.rootId),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage(),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setContent(`<main style="width:500px;height:200px">${compiled.svg}</main>`);
    await page.addScriptTag({ content: await offlineBundle() });
    await page.evaluate(async (document) => {
      const root = window.document.querySelector("svg"),
        api = window.EdiSVGRuntime;
      if (!(root instanceof SVGSVGElement) || !api) throw new Error("Missing runtime");
      window.interactivePlayer = await api.createInteractiveSvgPlayerAsync(root, document, {
        autoplay: false,
        pauseOffscreen: false,
      });
    }, compiled.document);
    const inspect = () =>
      page.evaluate(
        (paths) =>
          paths.map((path) => {
            const player = window.interactivePlayer?.getComponent(path);
            return [...(player?.inspectLayout()?.boxes.values() ?? [])].map((box) => box.width);
          }),
        compiled.document.components?.map((component) => component.instancePath) ?? [],
      );
    const initial = await inspect();
    assert.ok(
      initial.every((widths) => Math.abs((widths[0] ?? 0) - 230) < 0.01),
      JSON.stringify(initial),
    );
    await page.locator("main").evaluate((element) => {
      element.style.width = "300px";
    });
    await page.waitForFunction(() =>
      [...document.querySelectorAll("svg svg")].every((svg) =>
        svg.getAttribute("viewBox")?.endsWith("150 200"),
      ),
    );
    assert.ok((await inspect()).every((widths) => Math.abs((widths[0] ?? 0) - 130) < 0.01));
    const fault = await page.evaluate(async (blueprint) => {
      const root = document.querySelector("svg"),
        api = window.EdiSVGRuntime;
      if (!(root instanceof SVGSVGElement) || !api) throw new Error("Missing runtime");
      window.interactivePlayer?.destroy();
      const second = blueprint.components?.[1];
      if (!second) throw new Error("Missing child");
      second.speed = 100;
      const player = await api.createInteractiveSvgPlayerAsync(root, blueprint, {
        autoplay: false,
        pauseOffscreen: false,
      });
      let rejected = false;
      try {
        player.advance(0.2);
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes("efetivo")) throw error;
        rejected = true;
      }
      const times = [
        player.time,
        ...(blueprint.components ?? []).map(
          (component) => player.getComponent(component.instancePath).time,
        ),
      ];
      player.destroy();
      return { rejected, times, slots: root.querySelectorAll("[data-edi-layout]").length };
    }, compiled.document);
    assert.deepEqual(fault, { rejected: true, times: [0, 0, 0], slots: 0 });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
