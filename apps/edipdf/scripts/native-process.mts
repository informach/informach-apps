import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { _electron, type ElectronApplication, type Page } from "playwright";
import { observeNativeStartup } from "../../../scripts/edi/native-diagnostics.mts";
import type { EdiPdfApi } from "../src/shared/types.ts";

declare const window: Window & { api: EdiPdfApi };

/** Exercise the existing authorized window-close path, allowing will-quit cleanup to run. */
export async function closePdfNativeFixture(
  application: ElectronApplication,
  suiteProfile: string,
  editor?: Page,
): Promise<void> {
  const child = application.process(),
    diagnostic = observeNativeStartup(application, [suiteProfile]);
  const closed = application.waitForEvent("close", { timeout: 10000 }).then(
    () => ({ ok: true as const }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  const requested = (
    editor && !editor.isClosed()
      ? editor.evaluate(() => window.api.closeNow())
      : application.close()
  ).then(
    () => ({ ok: true as const }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  const result = await closed;
  if (!result.ok) {
    const failures: unknown[] = [result.error];
    console.error("Owned EdiPDF close failure", JSON.stringify(await diagnostic.snapshot()));
    diagnostic.dispose();
    if (child.pid && child.exitCode === null) {
      try {
        await new Promise<void>((done, reject) =>
          execFile(
            "powershell.exe",
            [
              "-NoProfile",
              "-File",
              resolve("scripts/edi/stop-owned-pdf-fixture.ps1"),
              "-LauncherProcessId",
              String(child.pid),
              "-RunnerProcessId",
              String(process.pid),
              "-SuiteProfile",
              suiteProfile,
            ],
            { windowsHide: true, timeout: 20000 },
            (error) => (error ? reject(error) : done()),
          ),
        );
      } catch (failure) {
        failures.push(failure);
      }
    }
    throw new AggregateError(failures, "The owned EdiPDF fixture did not close normally");
  }
  diagnostic.dispose();
  const request = await requested;
  if (!request.ok) throw request.error;
  if (child.exitCode !== 0)
    throw new Error(`The owned fixture exited with code ${child.exitCode}.`);
  for (const name of ["edipdf.runtime.lock", "session.v1.bin.lock"]) {
    try {
      await stat(join(suiteProfile, name));
    } catch (failure) {
      if (failure instanceof Error && "code" in failure && failure.code === "ENOENT") continue;
      throw failure;
    }
    throw new Error(`Normal EdiPDF fixture shutdown left ${name}; it was preserved for diagnosis.`);
  }
}

/** Keep abrupt-exit coverage separate from the normal close path; never delete a leftover lock. */
export async function verifyForcedPdfRestarts(options: {
  application: ElectronApplication;
  editor: Page;
  applicationRoot: string;
  userData: string;
  suiteData: string;
  environment: Record<string, string>;
  seedLease(application: ElectronApplication, ttl: number): Promise<void>;
  waitForStatus(editor: Page, status: "licensed" | "restricted"): Promise<void>;
}): Promise<void> {
  let application = options.application,
    editor = options.editor;
  for (let attempt = 1; attempt <= 3; attempt++) {
    await options.seedLease(application, 300);
    await options.waitForStatus(editor, "licensed");
    const closed = application.waitForEvent("close", { timeout: 10000 }).then(
      () => ({ ok: true as const }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    const requested = application
      .evaluate(({ app }) => app.exit())
      .then(
        () => ({ ok: true as const }),
        (error: unknown) => ({ ok: false as const, error }),
      );
    const exit = await closed;
    if (!exit.ok) {
      try {
        await closePdfNativeFixture(application, options.suiteData, editor);
      } catch (cleanupFailure) {
        throw new AggregateError(
          [exit.error, cleanupFailure],
          "Forced exit and fixture cleanup failed",
        );
      }
      throw exit.error;
    }
    const request = await requested;
    if (!request.ok) throw request.error;
    application = await _electron.launch({
      args: ["-r", resolve("scripts/edi/fixtures/native-vault.cjs"), options.applicationRoot],
      cwd: options.applicationRoot,
      env: {
        ...options.environment,
        EDI_SUITE_TEST_PROFILE: options.suiteData,
        EDI_NATIVE_TEST: "true",
        EDIPDF_USER_DATA: options.userData,
      },
    });
    const diagnostics = observeNativeStartup(application, [
      options.userData,
      options.suiteData,
      options.applicationRoot,
    ]);
    let reader: Page | undefined;
    let readerReady = false;
    try {
      reader = await application.firstWindow();
      await reader.waitForFunction(() => !!window.api || !!window.ediSuite);
      if (!(await reader.evaluate(() => !!window.api))) {
        const pending = application.waitForEvent("window").then(
          (page) => ({ ok: true as const, page }),
          (error: unknown) => ({ ok: false as const, error }),
        );
        await options.seedLease(application, 300);
        const opened = await pending;
        if (!opened.ok) throw opened.error;
        reader = opened.page;
      }
      await reader.waitForFunction(() => !!window.api);
      readerReady = true;
      await options.waitForStatus(reader, "licensed");
      await reader.waitForFunction(() => {
        const text = document.querySelector(".page .textLayer")?.textContent ?? "";
        return /SEGUNDA_PAGINA|OCR_RETOMADO|BUSCA_/.test(text);
      });
      const session = await reader.evaluate(() => window.api.session.load());
      if (!session.session.tabs.length)
        throw new Error("Forced restart lost the persisted fixture session");
      editor = reader;
      console.log(
        `Verified abrupt EdiPDF restart ${attempt}/3, licensed startup and restored synthetic document text`,
      );
    } catch (failure) {
      console.error(
        "Original abrupt EdiPDF restart failure",
        failure instanceof Error ? failure.name : "unknown",
      );
      console.error("Owned abrupt restart state", JSON.stringify(await diagnostics.snapshot()));
      try {
        await closePdfNativeFixture(
          application,
          options.suiteData,
          readerReady ? reader : undefined,
        );
      } catch (cleanupFailure) {
        throw new AggregateError(
          [failure, cleanupFailure],
          "Abrupt restart and fixture cleanup failed",
        );
      }
      throw failure;
    } finally {
      diagnostics.dispose();
    }
  }
  await closePdfNativeFixture(application, options.suiteData, editor);
}
