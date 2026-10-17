import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { windowsPowerShellEnvironment } from "@informach/edi-desktop/windows-powershell";
import { z } from "zod";

const replySchema = z.union([
  z.strictObject({ ready: z.literal(true) }),
  z.strictObject({
    id: z.literal(1),
    ok: z.literal(true),
    result: z.object({ x: z.number(), window: z.string() }),
  }),
  z.strictObject({ id: z.literal(2), ok: z.literal(false), error: z.string() }),
]);

function startHelper(signal: AbortSignal) {
  const child = spawn(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      fileURLToPath(new URL("../resources/guided-input.ps1", import.meta.url)),
    ],
    { windowsHide: true, env: windowsPowerShellEnvironment(), signal },
  );
  const lines = createInterface({ input: child.stdout });
  let stderr = "";
  let processError: Error | undefined;
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr = (stderr + chunk).slice(-4096);
  });
  child.on("error", (error) => {
    processError = error;
  });
  const closed = new Promise<{ code: number | null; error: Error | undefined }>((resolve) => {
    child.once("close", (code) => resolve({ code, error: processError }));
  });
  return {
    child,
    lines,
    closed,
    describe: (phase: string) =>
      `Guided helper phase=${phase}; pid=${child.pid}; exit=${child.exitCode}; stderr=${stderr || "<empty>"}`,
  };
}

test("native helper replies to read-only target sampling and rejects unknown commands", {
  skip: process.platform !== "win32",
  timeout: 20000,
}, async (context) => {
  const helper = startHelper(context.signal);
  let phase = "waiting for ready";
  const diagnose = () => context.diagnostic(helper.describe(phase));
  context.signal.addEventListener("abort", diagnose, { once: true });
  try {
    const replies: z.infer<typeof replySchema>[] = [];
    await new Promise<void>((resolve, reject) => {
      helper.child.once("error", reject);
      helper.child.stdin.once("error", reject);
      helper.child.once("close", () => {
        if (replies.length < 2) reject(new Error("Helper exited before replying"));
      });
      helper.lines.on("line", (line) => {
        try {
          const reply = replySchema.parse(JSON.parse(line));
          if ("ready" in reply) {
            phase = "waiting for sample and rejected-command replies";
            helper.child.stdin.write(`${JSON.stringify({ id: 1, op: "sample" })}\n`);
            helper.child.stdin.write(`${JSON.stringify({ id: 2, op: "not-an-action" })}\n`);
          } else {
            replies.push(reply);
            phase = `received ${replies.length}/2 replies`;
            if (replies.length === 2) resolve();
          }
        } catch (error) {
          reject(error);
        }
      });
    });
    assert.ok(replies[0] && "result" in replies[0]);
    assert.equal(replies[0].id, 1);
    assert.equal(replies[0].ok, true);
    assert.equal(typeof replies[0].result.x, "number");
    assert.equal(typeof replies[0].result.window, "string");
    assert.ok(replies[1] && "error" in replies[1]);
    assert.equal(replies[1].id, 2);
    assert.equal(replies[1].ok, false);
    phase = "waiting for normal EOF shutdown";
  } catch (error) {
    diagnose();
    throw error;
  } finally {
    // Normal completion closes stdin; node:test cancellation aborts the owned
    // helper through spawn's signal. Both paths wait for the actual process exit.
    helper.child.stdin.end();
    await helper.closed;
    context.signal.removeEventListener("abort", diagnose);
  }
  assert.equal((await helper.closed).code, 0);
});

test("aborting native helper startup waits for its process to exit", {
  skip: process.platform !== "win32",
  timeout: 20000,
}, async (context) => {
  const controller = new AbortController();
  const helper = startHelper(AbortSignal.any([context.signal, controller.signal]));
  try {
    await once(helper.child, "spawn");
    controller.abort();
    const result = await helper.closed;
    assert.equal(result.error?.name, "AbortError");
    const pid = helper.child.pid;
    assert.ok(pid);
    assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
  } finally {
    controller.abort();
    await helper.closed;
  }
});
