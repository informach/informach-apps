import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
import { _electron, type ElectronApplication, type Page } from "playwright";
import { z } from "zod";
import { EDI_DESKTOP_APPS, EDI_TOOLS } from "../../packages/config/src/edi-tools.ts";
import { desktopAppIdSchema, leaseClaimsSchema } from "../../packages/edi-contracts/src/index.ts";
import type { VaultData } from "../../packages/edi-desktop/src/vault";

declare const ediNativeFixture: {
  readIdentity(): Promise<unknown>;
  writeLease(fixture: {
    session: NonNullable<VaultData["session"]>;
    lease: string;
    tools: string[];
    time: number;
  }): Promise<void>;
};

if (process.platform !== "win32") throw new Error("Native suite tests require Windows");
const execute = promisify(execFile);
const selected = process.argv.slice(2).map((id) => desktopAppIdSchema.parse(id));
const applications = selected.length ? selected : EDI_DESKTOP_APPS.map((app) => app.id);
const packageManager = process.env.npm_execpath;
if (!packageManager || !isAbsolute(packageManager) || basename(packageManager) !== "pnpm.cjs")
  throw new Error("Run native tests through the pinned pnpm workspace script");
const toolingRequire = createRequire(import.meta.url);
const electronPath: unknown = toolingRequire("electron");
if (typeof electronPath !== "string") throw new Error("Electron executable was not resolved");
const root = await mkdtemp(join(tmpdir(), "edi-native-"));
const results = resolve(".cache/edi-native-results");
await mkdir(results, { recursive: true });
const signingKeys = generateKeyPairSync("ed25519");
const publicKey = signingKeys.publicKey.export({ type: "spki", format: "pem" }).toString();
const server = createServer((_request, response) => {
  response.writeHead(503, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ error: "temporarily_unavailable" }));
});
await new Promise<void>((ready, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", ready);
});
const address = server.address();
if (!address || typeof address === "string") throw new Error("Loopback fixture did not bind");
const issuer = `http://127.0.0.1:${address.port}`;
const baseEnvironment: Record<string, string> = {};
for (const [name, value] of Object.entries(process.env))
  if (
    typeof value === "string" &&
    !name.startsWith("EDI_") &&
    !["NODE_OPTIONS", "ELECTRON_RUN_AS_NODE", "ELECTRON_RENDERER_URL"].includes(name)
  )
    baseEnvironment[name] = value;
const buildEnvironment = {
  ...baseEnvironment,
  EDI_COMMERCIAL_BUILD: "false",
  EDI_PORTAL_URL: issuer,
  EDI_DESKTOP_CLIENT_ID: "ephemeral-native-test",
  EDI_LICENSE_PUBLIC_KEYS: JSON.stringify({ "native-test": publicKey }),
  EDI_UPDATE_PUBLIC_KEYS: "{}",
};

async function seedLease(application: ElectronApplication, ttl: number) {
  const identity = z
    .object({ deviceId: z.uuid(), keyThumbprint: z.string().regex(/^[a-f0-9]{64}$/) })
    .parse(await application.evaluate(() => ediNativeFixture.readIdentity()));
  const time = Date.now();
  const now = Math.floor(time / 1000);
  const activationId = randomUUID();
  const sessionId = randomUUID();
  const claims = leaseClaimsSchema.parse({
    version: 1,
    iss: issuer,
    aud: "edi-desktop",
    environment: "development",
    sub: "native-fixture-account",
    ...identity,
    activationId,
    revision: 0,
    tools: EDI_TOOLS.map((tool) => tool.id),
    iat: now,
    nbf: now,
    exp: now + ttl,
    paidThrough: now + 3600,
    jti: randomUUID(),
  });
  const header = Buffer.from(
    JSON.stringify({ alg: "EdDSA", typ: "edi-license+jwt", kid: "native-test" }),
  ).toString("base64url");
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const payload = `${header}.${body}`;
  const lease = `${payload}.${sign(null, Buffer.from(payload), signingKeys.privateKey).toString("base64url")}`;
  const session = {
    userId: claims.sub,
    activationId,
    sessionId,
    keyThumbprint: identity.keyThumbprint,
    accessToken: "ephemeral-native-access",
    refreshToken: "ephemeral-native-refresh",
    accessExpiresAt: time + 300000,
    sessionExpiresAt: new Date(time + 86400000).toISOString(),
  };
  await application.evaluate((_electron, fixture) => ediNativeFixture.writeLease(fixture), {
    session,
    lease,
    tools: claims.tools,
    time,
  });
}

async function verifyDeniedBridge(page: Page, path: string[], args: unknown[] = []) {
  const result = await page.evaluate(
    async (call) => {
      let owner: unknown = window;
      for (const part of call.path.slice(0, -1)) {
        if (!owner || typeof owner !== "object") throw new Error("Missing editor bridge");
        owner = Reflect.get(owner, part);
      }
      const name = call.path.at(-1);
      if (!name || !owner || typeof owner !== "object") throw new Error("Missing editor operation");
      const operation: unknown = Reflect.get(owner, name);
      if (typeof operation !== "function") throw new Error("Missing editor operation");
      try {
        await Reflect.apply(operation, owner, call.args);
        return { allowed: true, error: null };
      } catch (error) {
        return { allowed: false, error: error instanceof Error ? error.message : "unknown" };
      }
    },
    { path, args },
  );
  assert.equal(result.allowed, false);
  assert.match(result.error ?? "", /edi_access_restricted/);
}

async function waitForStatus(page: Page, state: "licensed" | "restricted", reason?: string) {
  // waitForFunction polls synchronously; asynchronous IPC state is observed via
  // the actual subscription and a snapshot, with a bounded failure deadline.
  await page.evaluate(
    (expected) =>
      new Promise<void>((resolve, reject) => {
        let settled = false;
        const complete = (error?: unknown) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          unsubscribe();
          if (error) reject(error);
          else resolve();
        };
        const matches = (status: Awaited<ReturnType<typeof window.ediSuite.status>>) => {
          if (
            status.state === expected.state &&
            (!expected.reason || status.reason === expected.reason)
          )
            complete();
        };
        const timeout = window.setTimeout(
          () => complete(new Error("Native status transition timed out")),
          10000,
        );
        const unsubscribe = window.ediSuite.onStatus(matches);
        window.ediSuite.status().then(matches, complete);
      }),
    { state, reason },
  );
}

function raiseFailures(failures: unknown[], message: string) {
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, message);
}
async function verifyNativeDialog(page: Page, openerName: string, dialogName: string) {
  const opener = page.getByRole("button", { name: openerName }).first();
  await opener.focus();
  await opener.press("Enter");
  const dialog = page.getByRole("dialog", { name: dialogName, exact: true });
  await dialog.waitFor({ state: "visible" });
  assert.equal(await dialog.evaluate((element) => element.matches(":modal")), true);
  const focusable = dialog.locator(
    "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)",
  );
  const first = focusable.first();
  const last = focusable.last();
  await first.focus();
  await first.press("Shift+Tab");
  assert.equal(await last.evaluate((element) => element === document.activeElement), true);
  await last.press("Tab");
  assert.equal(await first.evaluate((element) => element === document.activeElement), true);
  await page.screenshot({ path: join(results, `${dialogName.replace(/\s+/g, "-")}-modal.png`) });
  await first.press("Escape");
  await dialog.waitFor({ state: "detached" });
  assert.equal(await opener.evaluate((element) => element === document.activeElement), true);
}
const runFailures: unknown[] = [];
try {
  for (const id of applications) {
    console.log(`Native verification: ${id}`);
    const applicationRoot = resolve("apps", id);
    const userData = join(root, id, "user-data");
    const suiteData = join(root, id, "suite");
    await mkdir(userData, { recursive: true });
    await mkdir(join(userData, "documents"), { recursive: true });
    await execute(process.execPath, [packageManager, "--filter", `@informach/${id}`, "build"], {
      env: buildEnvironment,
      windowsHide: true,
      timeout: 600000,
      maxBuffer: 2 * 1024 ** 2,
    });
    const manifest = z
      .object({ main: z.string().min(1) })
      .parse(JSON.parse(await readFile(join(applicationRoot, "package.json"), "utf8")));
    await access(join(applicationRoot, manifest.main));
    const application = await _electron.launch({
      executablePath: electronPath,
      args: ["-r", resolve("scripts/edi/fixtures/native-vault.cjs"), applicationRoot],
      cwd: applicationRoot,
      env: {
        ...buildEnvironment,
        EDI_SUITE_TEST_PROFILE: suiteData,
        EDI_NATIVE_TEST: "true",
        EDIAULA_USER_DATA: userData,
        EDIFOTO_USER_DATA: userData,
        EDIPDF_USER_DATA: userData,
        EDISVG_USER_DATA: userData,
        EDICAPTURA_TEST_PROFILE: userData,
      },
    });
    let closed = false;
    application.once("close", () => {
      closed = true;
    });
    const failures: unknown[] = [];
    try {
      const first = await application.firstWindow();
      await first.waitForFunction(() => typeof window.ediSuite !== "undefined");
      assert.equal(
        await first.evaluate(async () => (await window.ediSuite.status()).state),
        "restricted",
      );
      await first.screenshot({ path: join(results, `${id}-restricted-start.png`) });
      const editorReady = (
        id === "edi-hub" ? Promise.resolve(first) : application.waitForEvent("window")
      ).then(
        (page) => ({ page }),
        (error: unknown) => ({ error }),
      );
      await seedLease(application, 60);
      const editorResult = await editorReady;
      if (!("page" in editorResult)) throw editorResult.error;
      const editor = editorResult.page;
      const pageErrors: string[] = [];
      editor.on("pageerror", (error) => pageErrors.push(error.message));
      await editor.waitForFunction(() => typeof window.ediSuite !== "undefined");
      await waitForStatus(editor, "licensed");
      await editor.evaluate(() => window.ediSuite.refresh());
      assert.equal(
        await editor.evaluate(async () => (await window.ediSuite.status()).offline),
        true,
      );
      await editor.screenshot({ path: join(results, `${id}-licensed.png`) });
      if (id === "ediaula") await verifyNativeDialog(editor, "Novo projeto", "Novo projeto");
      if (id === "edifoto") await verifyNativeDialog(editor, "Novo…", "Novo documento");
      if (id === "ediaula") {
        const sentinel = join(userData, "documents", "unselected.mp4");
        await writeFile(sentinel, "preserve previous output");
        const error = await editor.evaluate(async (outPath) => {
          const bridge: unknown = Reflect.get(window, "api");
          if (!bridge || typeof bridge !== "object") throw new Error("Missing EdiAula bridge");
          const start: unknown = Reflect.get(bridge, "startExport");
          if (typeof start !== "function") throw new Error("Missing export operation");
          try {
            await Reflect.apply(start, bridge, [
              "native-regression",
              {
                version: 1,
                id: "native-regression",
                name: "Regression",
                createdAt: 0,
                updatedAt: 0,
                settings: { width: 128, height: 128, fps: 30 },
                assets: [],
                tracks: [],
                clips: [],
              },
              {
                outPath,
                width: 128,
                height: 128,
                fps: 30,
                videoBitrate: 100,
                normalizeLoudness: false,
                encoder: "x264",
              },
            ]);
            return null;
          } catch (failure) {
            return failure instanceof Error ? failure.message : String(failure);
          }
        }, sentinel);
        assert.match(error ?? "", /destino/);
        assert.equal(await readFile(sentinel, "utf8"), "preserve previous output");
      }
      if (id === "edi-hub") {
        await seedLease(application, 3);
        await waitForStatus(editor, "restricted");
        await verifyDeniedBridge(editor, ["ediHub", "open"], ["edifoto"]);
      } else {
        assert.equal(
          first.isClosed(),
          true,
          "The access gate must close only after the editor exists",
        );
        const modalName =
          id === "ediaula" ? "Novo projeto" : id === "edifoto" ? "Novo documento" : null;
        if (modalName) {
          await editor.evaluate(() => {
            const marker = document.createElement("div");
            marker.id = "native-inert-sentinel";
            marker.inert = true;
            document.body.append(marker);
          });
          await editor
            .getByRole("button", { name: id === "ediaula" ? "Novo projeto" : "Novo…" })
            .first()
            .click();
          await editor
            .getByRole("dialog", { name: modalName, exact: true })
            .waitFor({ state: "visible" });
        }
        await seedLease(application, 3);
        await waitForStatus(editor, "restricted");
        const shield = editor.getByRole("dialog", { name: "Acesso à Suíte Edi", exact: true });
        await shield.waitFor({ state: "visible" });
        assert.equal(
          await shield.evaluate(
            (element) =>
              element.matches(":modal") &&
              element.contains(document.elementFromPoint(innerWidth / 2, innerHeight / 2)),
          ),
          true,
          "License restriction must cover existing native modals",
        );
        await editor.keyboard.press("Escape");
        assert.equal(
          await shield.evaluate((element) => element.matches(":modal")),
          true,
          "Escape cannot dismiss license restrictions",
        );
        const connect = shield.getByRole("button", { name: "Conectar conta", exact: true });
        await connect.focus();
        await connect.press("Shift+Tab");
        assert.equal(
          await editor.evaluate(() => document.activeElement?.textContent),
          "Salvar trabalho existente",
        );
        const refresh = shield.getByRole("button", { name: "Verificar acesso", exact: true });
        await refresh.focus();
        await refresh.press("Enter");
        await waitForStatus(
          editor,
          "restricted",
          "Não foi possível validar o acesso. Conecte-se à internet.",
        );
        const operations = {
          ediaula: ["api", "listPalettes"],
          edifoto: ["api", "aiSettings"],
          edipdf: ["api", "signatures", "list"],
          edisvg: ["desktop", "projectNew"],
          edicaptura: ["edi", "monitors"],
        };
        await verifyDeniedBridge(editor, operations[id]);
        if (modalName) {
          await seedLease(application, 60);
          await waitForStatus(editor, "licensed");
          const preserved = editor.getByRole("dialog", { name: modalName, exact: true });
          assert.equal(
            await editor.evaluate(() => document.getElementById("native-inert-sentinel")?.inert),
            true,
            "License restoration must not enable a previously inert root",
          );
          await editor.evaluate(() => document.getElementById("native-inert-sentinel")?.remove());
          assert.equal(
            await preserved.evaluate((element) => element.matches(":modal")),
            true,
            "Restoring access must preserve the editor's open dialog",
          );
          await editor.keyboard.press("Escape");
          await preserved.waitFor({ state: "detached" });
          await seedLease(application, 3);
          await waitForStatus(editor, "restricted");
        }
      }
      await editor.screenshot({ path: join(results, `${id}-expired.png`) });
      assert.deepEqual(pageErrors, [], "Editor emitted an unhandled error");
      if (id === "edisvg") {
        const nativePid = await application.evaluate(() => process.pid);
        const nativeWindow = await application.browserWindow(editor);
        await nativeWindow.evaluate((window) => window.close());
        await execute(
          "powershell.exe",
          [
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-File",
            resolve("scripts/edi/respond-test-draft.ps1"),
            "-TestProcessId",
            String(nativePid),
            "-Choice",
            "Cancelar",
          ],
          { windowsHide: true, timeout: 30000, maxBuffer: 32768 },
        );
        assert.equal(editor.isClosed(), false, "Canceling close must preserve the existing draft");
        assert.ok(await editor.evaluate(() => localStorage.getItem("edisvg-project")));
      }
      console.log(`Verified gate, valid signed offline lease, expiration and IPC denial: ${id}`);
    } catch (error) {
      failures.push(error);
    } finally {
      try {
        if (!closed) {
          const nativePid = await application.evaluate(() => process.pid);
          const closing = application.close().then(
            () => ({}),
            (error: unknown) => ({ error }),
          );
          if (id === "edisvg")
            await execute(
              "powershell.exe",
              [
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-File",
                resolve("scripts/edi/respond-test-draft.ps1"),
                "-TestProcessId",
                String(nativePid),
              ],
              { windowsHide: true, timeout: 30000, maxBuffer: 32768 },
            );
          const result = await closing;
          if ("error" in result) failures.push(result.error);
        }
      } catch (error) {
        failures.push(error);
      }
    }
    raiseFailures(failures, `Native verification and cleanup failed: ${id}`);
  }
} catch (error) {
  runFailures.push(error);
} finally {
  try {
    await new Promise<void>((done, reject) =>
      server.close((error) => (error ? reject(error) : done())),
    );
  } catch (error) {
    runFailures.push(error);
  }
  try {
    assert.equal(dirname(root), resolve(tmpdir()));
    assert.ok(basename(root).startsWith("edi-native-"));
    await rm(root, { recursive: true, force: true });
  } catch (error) {
    runFailures.push(error);
  }
}
raiseFailures(runFailures, "Native verification and resource cleanup failed");
console.log(
  "Native tests completed with ephemeral keys and isolated profiles. No installer was installed or published.",
);
