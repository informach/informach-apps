import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { glideResultSchema } from "../src/shared/helperProtocol.ts";

const executable = fileURLToPath(
  new URL("../resources/native/ediaula-helper.exe", import.meta.url),
);
const skip =
  process.platform !== "win32"
    ? "Windows only"
    : !existsSync(executable)
      ? "helper not built (run the package test script)"
      : false;

const replySchema = z.union([
  z.strictObject({ ready: z.literal(true) }),
  z.strictObject({
    id: z.int(),
    ok: z.literal(true),
    result: z.unknown(),
  }),
  z.strictObject({ id: z.int().nullable(), ok: z.literal(false), error: z.string() }),
]);
type Reply = z.infer<typeof replySchema>;

function startHelper(signal: AbortSignal) {
  const child = spawn(executable, ["input"], { windowsHide: true, signal });
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
  const replies: Reply[] = [];
  const waiters: (() => void)[] = [];
  lines.on("line", (line) => {
    replies.push(replySchema.parse(JSON.parse(line)));
    for (const wake of waiters.splice(0)) wake();
  });
  /** Resolves with the reply to `id`, or with the ready line when no id is given. */
  const reply = async (id?: number | null): Promise<Reply> => {
    for (;;) {
      const found = replies.find((r) =>
        id === undefined ? "ready" in r : "id" in r && r.id === id,
      );
      if (found) return found;
      await new Promise<void>((resolve) => waiters.push(resolve));
    }
  };
  const send = (command: Record<string, unknown>) =>
    child.stdin.write(`${JSON.stringify(command)}\n`);
  return {
    child,
    closed,
    reply,
    send,
    describe: () =>
      `Guided helper pid=${child.pid}; exit=${child.exitCode}; stderr=${stderr || "<empty>"}`,
  };
}

test("native helper replies to read-only target sampling and rejects unknown commands", {
  skip,
  timeout: 20000,
}, async (context) => {
  const helper = startHelper(context.signal);
  try {
    await helper.reply();
    helper.send({ id: 1, op: "sample" });
    helper.send({ id: 2, op: "not-an-action" });
    helper.send({
      id: 3,
      op: "verify",
      x: 1,
      y: 1,
      window: "1",
      left: 0,
      top: 0,
      width: 1,
      height: 1,
    });
    helper.child.stdin.write("not json\n");
    const sample = await helper.reply(1);
    assert.ok("result" in sample);
    const target = z
      .strictObject({
        x: z.int(),
        y: z.int(),
        window: z.string().regex(/^\d+$/),
        title: z.string(),
        left: z.int(),
        top: z.int(),
        width: z.int(),
        height: z.int(),
      })
      .parse(sample.result);
    assert.equal(typeof target.x, "number");
    assert.deepEqual(await helper.reply(2), { id: 2, ok: false, error: "Comando inválido." });
    const moved = await helper.reply(3);
    assert.ok("error" in moved && /mudou de janela/.test(moved.error));
    assert.deepEqual(await helper.reply(null), { id: null, ok: false, error: "Comando inválido." });
  } catch (error) {
    context.diagnostic(helper.describe());
    throw error;
  } finally {
    helper.child.stdin.end();
  }
  assert.equal((await helper.closed).code, 0);
});

test("a glide answers when it ends and halt stops it where it is", {
  skip,
  timeout: 20000,
}, async (context) => {
  const helper = startHelper(context.signal);
  try {
    await helper.reply();
    helper.send({ id: 1, op: "sample" });
    const here = await helper.reply(1);
    assert.ok("result" in here);
    const { x, y } = z.object({ x: z.int(), y: z.int() }).parse(here.result);
    // A movement to where the pointer already is: the whole loop runs without moving it.
    const from = { x, y };
    const started = performance.now();
    helper.send({ id: 2, op: "glide", x, y, from, duration: 0.3 });
    const done = await helper.reply(2);
    assert.ok("result" in done);
    assert.deepEqual(glideResultSchema.parse(done.result), { x, y, at: 1 });
    assert.ok(performance.now() - started >= 250, "takes the requested time");
    helper.send({ id: 3, op: "glide", x, y, from, duration: 2, at: 0.25 });
    await new Promise((resolve) => setTimeout(resolve, 300));
    helper.send({ id: 4, op: "halt" });
    assert.deepEqual(await helper.reply(4), { id: 4, ok: true, result: { halted: true } });
    const halted = await helper.reply(3);
    assert.ok("result" in halted);
    const result = glideResultSchema.parse(halted.result);
    assert.equal(result.halted, true);
    assert.ok(result.at > 0.25 && result.at < 1, `resumes from ${result.at}`);
    helper.send({ id: 5, op: "glide", x, y, duration: 0 });
    assert.deepEqual(await helper.reply(5), { id: 5, ok: false, error: "Movimento inválido." });
  } catch (error) {
    context.diagnostic(helper.describe());
    throw error;
  } finally {
    helper.child.stdin.end();
  }
  assert.equal((await helper.closed).code, 0);
});

test("aborting native helper startup waits for its process to exit", {
  skip,
  timeout: 20000,
}, async (context) => {
  const controller = new AbortController();
  const helper = startHelper(AbortSignal.any([context.signal, controller.signal]));
  try {
    await new Promise((resolve) => helper.child.once("spawn", resolve));
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
