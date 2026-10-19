import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { ElectronApplication, Page } from "playwright";
import {
  createNativeHarness,
  nativeTooling,
  raiseFailures,
  waitForStatus,
} from "../../../scripts/edi/native-harness.mts";
import { createPdfNativeFixture } from "./native-journey.mts";
import { closePdfNativeFixture } from "./native-process.mts";

const { packageManager } = nativeTooling(),
  harness = await createNativeHarness("edi-native-", packageManager);
const userData = join(harness.root, "edipdf", "user-data"),
  suiteData = join(harness.root, "edipdf", "suite"),
  documents = join(userData, "documents");
const failures: unknown[] = [];
let application: ElectronApplication | undefined,
  reader: Page | undefined,
  closed = false;
try {
  await mkdir(documents, { recursive: true });
  await mkdir(suiteData, { recursive: true });
  const fixture = await createPdfNativeFixture(documents);
  await harness.build("edipdf");
  application = await harness.launch("edipdf", { userData, suiteData }, {}, [fixture]);
  application.once("close", () => {
    closed = true;
  });
  const gate = await application.firstWindow();
  await gate.waitForFunction(() => !!window.ediSuite);
  const pending = application.waitForEvent("window").then(
    (page) => ({ page }),
    (error: unknown) => ({ error }),
  );
  await harness.seedLease(application, 300);
  const opened = await pending;
  if (!("page" in opened)) throw opened.error;
  const editor = opened.page;
  await editor.waitForFunction(() => !!window.ediSuite && !!Reflect.get(window, "api"));
  reader = editor;
  await waitForStatus(editor, "licensed");
  await editor.locator(".tab-name").filter({ hasText: "audit.pdf" }).waitFor();
  await editor.evaluate(() => {
    const stage = document.querySelector(".stage");
    if (!stage) throw new Error("Missing owned stage");
    const trace: unknown[] = [];
    const record = (kind: string) => {
      trace.push({
        kind,
        top: stage.scrollTop,
        width: stage.clientWidth,
        input: document.querySelector<HTMLInputElement>('input[aria-label="Página"]')?.value,
        page: document.querySelector(".page.current")?.getAttribute("data-page-id"),
      });
      if (trace.length > 60) trace.shift();
      document.documentElement.dataset.fixtureViewportTrace = JSON.stringify(trace);
    };
    for (const kind of ["input", "keydown"])
      document.addEventListener(
        kind,
        (event) => {
          if (
            event.target instanceof HTMLInputElement &&
            event.target.getAttribute("aria-label") === "Página"
          )
            record(kind);
        },
        true,
      );
    stage.addEventListener("scroll", () => record("scroll"));
    new ResizeObserver(() => record("resize")).observe(stage);
    new MutationObserver(() => record("geometry")).observe(stage, {
      attributes: true,
      subtree: true,
      attributeFilter: ["style", "class"],
    });
  });
  for (const width of [1100, 1280, 1500]) {
    await application.evaluate(({ BrowserWindow }, width) => {
      const window = BrowserWindow.getAllWindows().find((item) => !item.isDestroyed());
      if (!window) throw new Error("Missing owned editor window");
      window.unmaximize();
      window.setBounds({ width, height: 760 });
    }, width);
    for (let attempt = 0; attempt < 5; attempt++) {
      const pageInput = editor.getByRole("textbox", { name: "Página", exact: true });
      await pageInput.fill("2");
      assert.equal(await pageInput.inputValue(), "2");
      await pageInput.press("Enter");
      await editor.waitForFunction(() => {
        const stage = document.querySelector<HTMLElement>(".stage"),
          page = document.querySelector(".page.current");
        return (
          !!stage &&
          !!page &&
          (page.querySelector(".textLayer")?.textContent ?? "").includes("SEGUNDA_PAGINA") &&
          Math.abs(page.getBoundingClientRect().top - stage.getBoundingClientRect().top - 12) < 3
        );
      });
      const before = await editor.locator(".stage").evaluate((element) => element.scrollTop);
      await editor.getByTitle("Início", { exact: true }).click();
      await editor.locator(".tab-name").filter({ hasText: "audit.pdf" }).click();
      await editor.waitForFunction(
        (expected) =>
          Math.abs((document.querySelector(".stage")?.scrollTop ?? -9999) - expected) < 3,
        before,
      );
      assert.equal(await pageInput.inputValue(), "2");
    }
    console.log(
      `Verified five exact Home/document scroll restorations at ${width}px using measured viewport geometry`,
    );
  }
  await closePdfNativeFixture(application, suiteData, editor);
  console.log("Verified normal SDK shutdown leaves neither runtime nor protected-session locks");
} catch (failure) {
  failures.push(failure);
  if (reader && !reader.isClosed()) {
    try {
      console.error(
        "Owned viewport probe state",
        await reader.evaluate(() => {
          const stage = document.querySelector(".stage"),
            page = document.querySelector(".page.current");
          return {
            scrollTop: stage?.scrollTop,
            height: stage?.clientHeight,
            scrollHeight: stage?.scrollHeight,
            stageY: stage?.getBoundingClientRect().top,
            pageY: page?.getBoundingClientRect().top,
            pageText: page?.textContent?.slice(0, 160),
            input: document.querySelector<HTMLInputElement>('input[aria-label="Página"]')?.value,
            zoom: document.querySelector(".zoom-value")?.textContent,
            trace: JSON.parse(document.documentElement.dataset.fixtureViewportTrace ?? "[]"),
          };
        }),
      );
      await reader.screenshot({
        path: ".cache/edi-native-results/edipdf-viewport-probe-failure.png",
      });
    } catch (diagnosticFailure) {
      failures.push(diagnosticFailure);
    }
  }
} finally {
  if (application && !closed) {
    try {
      await closePdfNativeFixture(application, suiteData, reader);
    } catch (failure) {
      failures.push(failure);
    }
  }
  failures.push(...(await harness.dispose()));
}
raiseFailures(failures, "PDF viewport and shutdown probe");
