// A stand-in for Claude Code or Codex: reports its arguments and what arrived on standard input,
// starts a grandchild (as the npm and bun launchers do) and waits to be stopped. With --tick it
// prints a line every 200 ms meanwhile, as Claude Code does while it thinks; with --tick-stderr,
// on its errors only (as while it retries the API).
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
  if (process.argv.includes("--tick"))
    setInterval(() => process.stdout.write(`${JSON.stringify({ type: "tick" })}\n`), 200);
  else if (process.argv.includes("--tick-stderr"))
    setInterval(() => process.stderr.write("API retry\n"), 200);
  else setInterval(() => {}, 1000);
});
