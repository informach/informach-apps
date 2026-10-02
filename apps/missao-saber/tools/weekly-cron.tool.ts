import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";

it("runs the actual cron script through partial failure, following the next cursor and alerting locally", async () => {
  const paths: string[] = [];
  let alerts = 0;
  const server = createServer((request, response) => {
    if (request.url === "/alert") {
      alerts++;
      request.resume();
      response.end("recorded locally");
      return;
    }
    paths.push(request.url ?? "");
    if (request.headers.authorization !== "Bearer local-cron-test") {
      response.statusCode = 401;
      response.end();
      return;
    }
    response.setHeader("x-report-week", "2026-09-28");
    response.setHeader("x-next-cursor", paths.length === 1 ? "cursor%3A1" : "");
    response.statusCode = paths.length === 1 ? 503 : 200;
    response.end(
      JSON.stringify({
        processed: paths.length === 1 ? 20 : 2,
        falhas: paths.length === 1 ? 1 : 0,
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing local port");
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    const result = await new Promise<{ code: number | null; output: string }>(
      (resolveResult, reject) => {
        const command =
          process.platform === "win32"
            ? join(process.env.ProgramFiles ?? "C:/Program Files", "Git", "bin", "bash.exe")
            : "sh";
        const child = spawn(command, [resolve("scripts/weekly-report-cron.sh")], {
          windowsHide: true,
          env: {
            ...process.env,
            CRON_SECRET: "local-cron-test",
            APP_ORIGIN: origin,
            SENTRY_DSN: "local-only",
            SENTRY_ENVELOPE_URL: `${origin}/alert`,
          },
        });
        let output = "";
        child.stdout.on("data", (data) => {
          output += data;
        });
        child.stderr.on("data", (data) => {
          output += data;
        });
        child.on("error", reject);
        child.on("exit", (code) => resolveResult({ code, output }));
      },
    );
    expect(result.code, result.output).toBe(1);
    expect(paths).toEqual([
      "/api/jobs/weekly-report",
      "/api/jobs/weekly-report?after=cursor%3A1&week=2026-09-28",
    ]);
    expect(alerts).toBe(1);
    expect(result.output).toContain('"processed":2');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}, 15000);
