// A stand-in for Claude Code or Codex: reports its arguments and what arrived on standard input,
// starts a grandchild (as the npm and bun launchers do) and waits to be stopped.
import { spawn } from "node:child_process";

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
});
process.stdin.on("end", () => {
  const grandchild = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    stdio: "ignore",
  });
  process.stdout.write(
    `${JSON.stringify({ type: "probe", argv: process.argv.slice(2), input, grandchild: grandchild.pid })}\n`,
  );
  setInterval(() => {}, 1000);
});
