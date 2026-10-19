import assert from "node:assert/strict";
import { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, it } from "vitest";
import { z } from "zod";
import {
  nativeStage,
  observeNativeStartup,
  trackNativeChild,
  verifyNativeClose,
} from "./native-diagnostics.mts";

// Execute the runner's actual catch body without launching Electron or acquiring pixels.
const source = readFileSync(new URL("./test-native.mts", import.meta.url), "utf8");
const tree = ts.createSourceFile("test-native.mts", source, ts.ScriptTarget.Latest, true);
const handlers: string[] = [];
function visit(node: ts.Node) {
  if (ts.isCatchClause(node) && node.block.getText(tree).includes("diagnosticEditor.screenshot"))
    handlers.push(node.block.getText(tree));
  ts.forEachChild(node, visit);
}
visit(tree);
assert.equal(handlers.length, 1, "Find the actual per-app failure handler");
const handler = handlers[0];
assert.ok(handler);

async function fail(id: string, diagnosticEditor: unknown, error: Error) {
  const failures: unknown[] = [];
  await runInNewContext(`(async () => ${handler})()`, {
    id,
    diagnosticEditor,
    error,
    failures,
    results: "owned-results",
    join,
  });
  return failures;
}

describe("native failure diagnostic containment", () => {
  for (const message of [
    "Unexpected source origin",
    "Recorded dimensions differ from owned region",
  ])
    it(`stops all Captura page inspection after ${message}`, async () => {
      const error = new Error(message);
      let reads = 0;
      const page = new Proxy(
        {},
        {
          get() {
            reads++;
            throw new Error("Post-STOP page access is forbidden");
          },
        },
      );
      assert.deepEqual(await fail("edicaptura", page, error), [error]);
      assert.equal(reads, 0);
    });

  for (const id of ["edifoto", "ediaula", "edisvg", "edipdf", "edi-hub"])
    it(`preserves the owned error screenshot for ${id}`, async () => {
      const error = new Error("Synthetic verification failure");
      const paths: string[] = [];
      const page = {
        isClosed: () => false,
        screenshot: async ({ path }: { path: string }) => paths.push(path),
      };
      assert.deepEqual(await fail(id, page, error), [error]);
      assert.deepEqual(paths, [join("owned-results", `${id}-failure.png`)]);
    });

  it("retains both verification and screenshot failures", async () => {
    const error = new Error("Synthetic verification failure");
    const screenshotError = new Error("Synthetic screenshot failure");
    assert.deepEqual(
      await fail(
        "edifoto",
        {
          isClosed: () => false,
          screenshot: async () => {
            throw screenshotError;
          },
        },
        error,
      ),
      [error, screenshotError],
    );
  });

  it("does not acquire pixels from a closed or absent page", async () => {
    const error = new Error("Synthetic startup failure");
    const page = {
      isClosed: () => true,
      screenshot: async () => {
        throw new Error("Closed page must not be captured");
      },
    };
    assert.deepEqual(await fail("edifoto", page, error), [error]);
    assert.deepEqual(await fail("edifoto", undefined, error), [error]);
  });
});

it("preserves previous native evidence and includes nested runs in CI artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "edi-native-evidence-test-"));
  try {
    const start = source.indexOf("const resultsRoot =");
    const end = source.indexOf("const signingKeys =", start);
    assert.ok(start >= 0 && end > start, "Find the actual native results initialization");
    const initialization = source.slice(start, end);
    const initialize = () =>
      runInNewContext(`(async () => { ${initialization}; return results; })()`, {
        resolve: (path: string) => {
          assert.equal(path, ".cache/edi-native-results");
          return root;
        },
        mkdir,
        mkdtemp,
        join,
        basename,
        console: { log: () => {} },
      });
    const original = join(root, "historic.png");
    await writeFile(original, "owned historical evidence");
    const first: string = await initialize();
    await writeFile(join(first, "edifoto-licensed.png"), "owned first run");
    const second: string = await initialize();
    await writeFile(join(second, "edifoto-licensed.png"), "owned second run");
    assert.notEqual(first, second);
    for (const run of [first, second]) {
      assert.equal(dirname(run), root);
      assert.match(basename(run), /^run-/);
    }
    assert.equal(await readFile(original, "utf8"), "owned historical evidence");
    assert.equal(await readFile(join(first, "edifoto-licensed.png"), "utf8"), "owned first run");
    for (const workflow of ["edi-native.yml", "edi-release.yml"])
      assert.match(
        readFileSync(resolve(".github/workflows", workflow), "utf8"),
        /path: \.cache\/edi-native-results\/\*\*\/\*\.png/,
      );
  } finally {
    assert.equal(dirname(root), resolve(tmpdir()));
    assert.ok(basename(root).startsWith("edi-native-evidence-test-"));
    await rm(root, { recursive: true, force: true });
  }
});

describe("post-launch native setup lifecycle", () => {
  const raise = tree.statements.find(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === "raiseFailures",
  );
  assert.ok(raise);
  const start = source.indexOf("const runFailures:");
  assert.ok(start > 0);
  // The complete runner lifecycle executes unchanged. Only external operations
  // use inert doubles; tracking, error propagation and close verification are real.
  // import.meta is unavailable in this inert VM; SVG-only paths are not reached.
  const runnerBody = source.slice(start).replaceAll("import.meta.url", "nativeRunnerModuleUrl");
  const lifecycle = ts.transpileModule(`${raise.getText(tree)}\n${runnerBody}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;

  async function rejectedSetup(rejectClose: boolean) {
    const cause = new Error("Synthetic Pictures setup rejected");
    const closeCause = new Error("Synthetic normal close rejected");
    const events: string[] = [];
    let closeCalls = 0;
    let removals = 0;
    let tracked = 0;
    class InertChild extends ChildProcess {
      override readonly spawnfile = "owned-inert-fixture";
      override exitCode: number | null = null;
      override kill(): boolean {
        throw new Error("Forced termination is forbidden");
      }
    }
    const child = new InertChild();
    const application = Object.assign(new EventEmitter(), {
      process: () => child,
      windows: () => [],
      evaluate: async (operation: unknown, argument?: unknown) => {
        if (String(operation).includes("homedir"))
          return join(tmpdir(), "edi-native-inert-lifecycle", "edicaptura", "home");
        if (typeof argument === "string") {
          events.push("pictures-rejected");
          throw cause;
        }
        return 1;
      },
      close: async () => {
        closeCalls++;
        events.push("normal-close-requested");
        if (rejectClose) throw closeCause;
        queueMicrotask(() => {
          child.exitCode = 0;
          child.emit("close", 0, null);
          application.emit("close");
          events.push("child-closed");
        });
      },
    });
    let failure: unknown;
    try {
      await runInNewContext(`(async () => { ${lifecycle} })()`, {
        assert,
        basename,
        delimiter,
        dirname,
        isAbsolute,
        join,
        resolve,
        tmpdir,
        z,
        AggregateError,
        root: join(tmpdir(), "edi-native-inert-lifecycle"),
        nativeRunnerModuleUrl: "file:///owned-test-native.mts",
        applications: ["edicaptura"],
        electronPath: "owned-electron",
        packageManager: "owned-pnpm",
        process: { execPath: "owned-node" },
        buildEnvironment: { SystemRoot: join(tmpdir(), "owned-windows-fixture") },
        nativeStage: (
          app: string,
          stage: Parameters<typeof nativeStage>[1],
          paths: string[],
          run: () => Promise<unknown>,
        ) => nativeStage(app, stage, paths, run, () => {}),
        verifyNativeInstallationIntegrity: async () => {},
        mkdir: async () => {},
        access: async () => {},
        readFile: async () => JSON.stringify({ main: "owned-main.js" }),
        execute: () => Object.assign(Promise.resolve({}), { child: { pid: 2 } }),
        _electron: { launch: async () => application },
        trackNativeChild: () => {
          tracked++;
          return trackNativeChild(child);
        },
        observeNativeStartup,
        verifyNativeClose: async (...args: Parameters<typeof verifyNativeClose>) => {
          events.push("close-verification-started");
          await verifyNativeClose(...args);
          events.push("close-verified");
        },
        server: { close: (done: () => void) => done() },
        rm: async () => {
          assert.equal(child.exitCode, 0);
          assert.ok(events.includes("close-verified"));
          events.push("root-removed");
          removals++;
        },
        console: { log: () => {}, error: () => {} },
      });
    } catch (error) {
      failure = error;
    }
    return { cause, failure, closeCalls, removals, tracked, child, events };
  }

  it("closes once and verifies child exit before cleanup after Pictures rejects", async () => {
    const result = await rejectedSetup(false);
    assert.equal(result.tracked, 1);
    assert.equal(result.closeCalls, 1);
    assert.equal(result.failure, result.cause, "Setup failure must remain a failing result");
    assert.equal(result.removals, 1);
    assert.equal(result.child.exitCode, 0);
    assert.ok(result.events.indexOf("close-verified") > result.events.indexOf("child-closed"));
    assert.ok(result.events.indexOf("root-removed") > result.events.indexOf("close-verified"));
  });

  it("retains the root and both failures when normal close rejects with a live child", async () => {
    const result = await rejectedSetup(true);
    assert.equal(result.closeCalls, 1);
    assert.equal(result.removals, 0);
    assert.equal(result.child.exitCode, null);
    assert.ok(result.failure instanceof AggregateError);
    const perApp = result.failure.errors[0];
    assert.ok(perApp instanceof AggregateError);
    assert.equal(perApp.errors[0], result.cause);
    assert.match(perApp.errors[1].message, /Synthetic normal close rejected/);
    assert.match(result.failure.errors[1].message, /Known native child remains alive/);
    assert.ok(!result.events.includes("close-verified"));
  });
});
