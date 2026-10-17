import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("native helper replies to read-only target sampling and rejects unknown commands", {
  skip: process.platform !== "win32",
  timeout: 20000,
}, async () => {
  const child = spawn(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      fileURLToPath(new URL("../resources/guided-input.ps1", import.meta.url)),
    ],
    { windowsHide: true },
  );
  try {
    const replies: Record<string, unknown>[] = [];
    await new Promise<void>((resolve, reject) => {
      let buffer = "";
      child.on("error", reject);
      child.on("exit", () => {
        if (replies.length < 2) reject(new Error("Helper exited before replying"));
      });
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        buffer += chunk;
        for (;;) {
          const index = buffer.indexOf("\n");
          if (index < 0) break;
          const line = buffer.slice(0, index).trim();
          buffer = buffer.slice(index + 1);
          try {
            const reply = JSON.parse(line);
            if (reply.ready) {
              child.stdin.write(JSON.stringify({ id: 1, op: "sample" }) + "\n");
              child.stdin.write(JSON.stringify({ id: 2, op: "not-an-action" }) + "\n");
            } else {
              replies.push(reply);
              if (replies.length === 2) resolve();
            }
          } catch (err) {
            reject(err);
          }
        }
      });
    });
    assert.equal(replies[0].ok, true);
    const target = replies[0].result as Record<string, unknown>;
    assert.equal(typeof target.x, "number");
    assert.equal(typeof target.window, "string");
    assert.equal(replies[1].ok, false);
  } finally {
    child.kill();
  }
});
