import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { dirname, relative, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { unzipSync } from "fflate";
import { chromium } from "playwright";
import { buildReactExport } from "../../src/renderer/src/behavior/react-export";
import { executeDocumentTransaction } from "../../src/shared/documentCommands";
import { newProject } from "../../src/shared/project";
import { editScene } from "../../src/shared/scene.js";

const execute = promisify(execFile);
async function freePort() {
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const address = probe.address();
  if (!address || typeof address === "string") throw new Error("Missing port");
  await new Promise<void>((done, reject) =>
    probe.close((error) => (error ? reject(error) : done())),
  );
  return address.port;
}
test("exported Next.js client example survives production Turbopack build, prerender and real hydration without workspace runtime imports", {
  timeout: 240000,
}, async (context) => {
  const fixtureRoot = resolve("tmp"),
    repoRoot = resolve("../.."),
    webRequire = createRequire(resolve("../edi/package.json"));
  await mkdir(fixtureRoot, { recursive: true });
  const fixture = await mkdtemp(resolve(fixtureRoot, "edi-next-")),
    nextLink = resolve(fixture, "node_modules/next");
  const fixtureName = relative(fixtureRoot, fixture);
  if (!/^edi-next-[\w-]+$/.test(fixtureName)) throw new Error("Unsafe fixture path");
  let server: ReturnType<typeof spawn> | undefined;
  const env = { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" };
  // Node's after hook reports cleanup failures without masking a failed test.
  context.after(async () => {
    if (server?.pid && server.exitCode === null && server.signalCode === null) {
      const ended = once(server, "exit", { signal: AbortSignal.timeout(10000) });
      server.kill();
      await ended;
    }
    try {
      const link = await lstat(nextLink);
      if (!link.isSymbolicLink())
        throw new Error("Refusing to remove unexpected Next fixture directory");
      await unlink(nextLink);
    } catch (error) {
      if (
        !(typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")
      )
        throw error;
    }
    if (relative(fixtureRoot, fixture) !== fixtureName || !/^edi-next-[\w-]+$/.test(fixtureName))
      throw new Error("Refusing unsafe fixture cleanup");
    await rm(fixture, { recursive: true, force: true });
  });
  const initial = newProject(),
    sessionId = crypto.randomUUID(),
    project = executeDocumentTransaction(
      { project: initial, revision: 0, sessionId },
      {
        projectId: initial.id,
        revision: 0,
        sessionId,
        commands: [
          {
            type: "rig",
            operation: "create-target",
            id: "node-joystick-next",
            name: "Next",
            x: 0,
            y: 0,
          },
        ],
      },
    ).project,
    board = project.artboards[0];
  if (!board) throw new Error("Missing board");
  const id = editScene(board.scene, null, "add", "text");
  if (!id) throw new Error("Missing text");
  editScene(board.scene, id, "text", "Ana");
  const nativeSource = editScene(board.scene, null, "add", {
      tag: "circle",
      attrs: { cx: "60", cy: "60", r: "35" },
    }),
    nativeTarget = editScene(board.scene, null, "add", {
      tag: "rect",
      attrs: { x: "10", y: "10", width: "100", height: "100", fill: "#00a080" },
    });
  if (!nativeSource || !nativeTarget) throw new Error("Missing native clipping fixture");
  editScene(board.scene, nativeSource, "visibility", false);
  editScene(board.scene, nativeTarget, "effects", {
    clip: { sourceId: nativeSource, rule: "nonzero" },
  });
  project.motion = {
    version: 2,
    animations: [
      {
        id: "animation-next",
        name: "Movimento",
        fps: 60,
        frames: 60,
        mode: "loop",
        tracks: [
          {
            id: "track-x",
            targetId: id,
            property: "x",
            keys: [
              { id: "key-a", frame: 0, value: 0, easing: "linear" },
              { id: "key-b", frame: 60, value: 100, easing: "linear" },
            ],
          },
        ],
      },
    ],
  };
  const trimId = editScene(board.scene, null, "add", {
    tag: "path",
    attrs: { d: "M0 140L200 140", fill: "none", stroke: "#222222" },
  });
  if (!trimId) throw new Error("Missing Next trim shape");
  const joystickTarget = "node-joystick-next";
  board.rig = {
    version: 4,
    bones: [],
    constraints: [],
    targets: [joystickTarget],
    joysticks: [
      {
        id: "joystick-next",
        name: "Next",
        targetId: joystickTarget,
        x: 0,
        y: 0,
        rangeX: 40,
        rangeY: 20,
        limit: "circle",
      },
    ],
    trims: [
      {
        id: "trim-next",
        targetId: trimId,
        start: 0,
        end: 1,
        offset: 0,
        tolerance: 0.001,
        mode: "parallel",
      },
    ],
    parameterClips: [
      {
        animationId: "animation-next",
        tracks: [
          ...(["x", "y"] as const).map((property) => ({
            id: `track-next-joystick-${property}`,
            targetId: "joystick-next",
            property,
            keys: [
              {
                id: `key-next-joystick-${property}-zero`,
                frame: 0,
                value: 0,
                easing: "linear" as const,
              },
              {
                id: `key-next-joystick-${property}-full`,
                frame: 60,
                value: property === "x" ? 1 : -0.5,
                easing: "linear" as const,
              },
            ],
          })),
          {
            id: "track-next-trim",
            targetId: "trim-next",
            property: "end",
            keys: [
              { id: "key-next-trim-zero", frame: 0, value: 0, easing: "linear" },
              { id: "key-next-trim-full", frame: 60, value: 1, easing: "linear" },
            ],
          },
        ],
      },
    ],
  };
  const result = buildReactExport(
    project,
    {
      format: "react",
      alt: "Arte Next",
      reduced: true,
      offscreen: true,
      animationId: "animation-next",
    },
    await readFile("out/renderer/edi-react-player.mjs", "utf8"),
    await readFile("out/renderer/edi-player.licenses.txt", "utf8"),
  );
  const files = unzipSync(result.content),
    allowed = new Set([
      "EdiAnimation.jsx",
      "EdiAnimation.d.ts",
      "edi-react-player.mjs",
      "README.md",
      "THIRD_PARTY_LICENSES.txt",
      "NextExample.tsx",
    ]);
  await mkdir(resolve(fixture, "app/animation"), { recursive: true });
  for (const [name, bytes] of Object.entries(files)) {
    if (!allowed.has(name)) throw new Error("Unexpected archive path");
    await writeFile(resolve(fixture, "app/animation", name), bytes);
  }
  const nextPackage = webRequire("next/package.json");
  await writeFile(
    resolve(fixture, "package.json"),
    JSON.stringify({
      name: "edi-next-proof",
      version: "0.0.0",
      private: true,
      type: "module",
      dependencies: { next: nextPackage.version, react: "19.3.1", "react-dom": "19.3.1" },
    }),
  );
  await writeFile(
    resolve(fixture, "next.config.mjs"),
    `export default {turbopack:{root:${JSON.stringify(repoRoot)}}};`,
  );
  await writeFile(
    resolve(fixture, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        lib: ["dom", "dom.iterable", "esnext"],
        allowJs: true,
        strict: true,
        noEmit: true,
        esModuleInterop: true,
        module: "esnext",
        moduleResolution: "bundler",
        resolveJsonModule: true,
        isolatedModules: true,
        jsx: "preserve",
        plugins: [{ name: "next" }],
      },
      include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
      exclude: ["node_modules"],
    }),
  );
  await writeFile(
    resolve(fixture, "app/layout.tsx"),
    'import type {ReactNode} from "react";export default function Layout({children}:{children:ReactNode}){return <html lang="pt-BR"><body>{children}</body></html>;}',
  );
  await writeFile(
    resolve(fixture, "app/page.tsx"),
    'import EdiAnimation from "./animation/EdiAnimation.jsx";import NextExample from "./animation/NextExample";export default function Page(){return <main><h1>Consumidor EdiSVG</h1><EdiAnimation title="Animação pré-renderizada" autoplay={false} style={{width:400,height:240}}/><NextExample/></main>;}',
  );
  await mkdir(dirname(nextLink), { recursive: true });
  await symlink(dirname(webRequire.resolve("next/package.json")), nextLink, "junction");
  const cli = webRequire.resolve("next/dist/bin/next");
  const build = await execute(process.execPath, [cli, "build"], {
    cwd: fixture,
    env,
    timeout: 180000,
    maxBuffer: 1000000,
    windowsHide: true,
  });
  assert.match(build.stdout, /Compiled successfully/);
  const port = await freePort();
  server = spawn(
    process.execPath,
    [cli, "start", "--hostname", "127.0.0.1", "--port", String(port)],
    { cwd: fixture, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
  );
  await new Promise<void>((done, reject) => {
    const deadline = setTimeout(() => reject(new Error("Next server did not become ready")), 20000);
    let logs = "";
    const output = (chunk: Buffer) => {
      logs = (logs + chunk.toString()).slice(-10000);
      if (logs.includes("Ready")) {
        clearTimeout(deadline);
        done();
      }
    };
    server?.stdout?.on("data", output);
    server?.stderr?.on("data", output);
    server?.once("error", (error) => {
      clearTimeout(deadline);
      reject(error);
    });
    server?.once("exit", (code) => {
      clearTimeout(deadline);
      reject(new Error(`Next exited before readiness: ${code}`));
    });
  });
  const url = `http://127.0.0.1:${port}`,
    response = await fetch(url),
    html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /Animação pré-renderizada/);
  assert.match(html, /Ana/);
  assert.match(html, /clipPath/);
  const channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage(),
      errors: string[] = [],
      external: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (new URL(request.url()).origin !== url) external.push(request.url());
    });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(url);
    const client = page.getByRole("region", { name: "Animação interativa", exact: true });
    await client.getByText("Player pronto", { exact: true }).waitFor();
    assert.equal(await client.locator(`[data-edi-object="${trimId}"]>path`).getAttribute("d"), "");
    assert.equal(
      await client.locator("[data-edi-live-effects] clipPath circle").getAttribute("r"),
      "35",
    );
    await client.getByRole("button", { name: "Avançar 0,1s", exact: true }).click();
    const trimLength = await client
      .locator(`[data-edi-object="${trimId}"]>path`)
      .evaluate((element) => {
        if (!(element instanceof SVGPathElement)) throw new Error("Missing hydrated trim shape");
        return element.getTotalLength();
      });
    assert.ok(Math.abs(trimLength - 20) < 0.001, String(trimLength));
    assert.match(
      (await client.locator(`[data-edi-object="${id}"]`).getAttribute("transform")) ?? "",
      /translate\(10 0\)/,
    );
    assert.match(
      (await client.locator(`[data-edi-object="${joystickTarget}"]`).getAttribute("transform")) ??
        "",
      /translate\(4 -1\)/,
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    console.log(
      `Verified Next ${nextPackage.version} production Turbopack build/SSR/hydration using exported files`,
    );
  } finally {
    await browser.close();
  }
});
