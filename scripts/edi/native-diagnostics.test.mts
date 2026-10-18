import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  nativeFailure,
  nativeStage,
  sanitizeNativeDiagnostic,
  trackNativeChild,
  verifyNativeClose,
} from "./native-diagnostics.mts";

describe("native startup diagnostics", () => {
  it.each([0, 1])(
    "requires actual child exit success even when app.close resolves: %i",
    async (code) => {
      const child = spawn(process.execPath, ["-e", `process.exit(${code})`], { windowsHide: true });
      const tracked = trackNativeChild(child);
      const events: object[] = [];
      const verdict = nativeStage(
        "fixture",
        "cleanup",
        [],
        () => verifyNativeClose(child, tracked.completion, Promise.resolve()),
        (event) => events.push(event),
      );
      if (code) await expect(verdict).rejects.toThrow('"code":1');
      else await expect(verdict).resolves.toBeUndefined();
      expect(tracked.isClosed()).toBe(true);
      expect(events[1]).toMatchObject({ event: code ? "failed" : "complete" });
    },
  );

  it("preserves cleanup rejection and deadline instead of declaring success", async () => {
    const child = spawn(process.execPath, ["-e", "process.exit(0)"], { windowsHide: true });
    const tracked = trackNativeChild(child);
    await tracked.completion;
    await expect(
      verifyNativeClose(
        child,
        tracked.completion,
        Promise.reject(new Error("owned-close-failure")),
      ),
    ).rejects.toThrow("owned-close-failure");
    await expect(
      verifyNativeClose(child, tracked.completion, new Promise(() => {}), 20),
    ).rejects.toThrow("Native cleanup deadline exceeded");
  });

  it("removes test paths, credentials and URL data while retaining error codes", () => {
    const diagnostic = sanitizeNativeDiagnostic(
      "EACCES C:\\test\\profile\\session.bin https://example.test/path?token=sensitive " +
        'Authorization: Bearer credential {"access_token":"access","refresh_token":"refresh"} ' +
        "password=private secret=value privateKey=encoded",
      ["C:\\test", "C:\\test\\profile"],
    );
    expect(diagnostic).toContain("EACCES <test-path>\\session.bin");
    expect(diagnostic).not.toMatch(
      /sensitive|credential|"access"|"refresh"|private\b|value|encoded/,
    );
    expect(diagnostic).toContain("<url>");
  });

  it("removes multiline private keys from stderr", () => {
    expect(
      sanitizeNativeDiagnostic(
        "failure\n-----BEGIN PRIVATE KEY-----\nprivate-content\n-----END PRIVATE KEY-----\nend",
        [],
      ),
    ).toBe("failure\n<private-key>\nend");
  });

  it("attributes a real failed build child and retains its code and both output streams", async () => {
    const events: object[] = [];
    await expect(
      nativeStage(
        "fixture",
        "build",
        [],
        () =>
          promisify(execFile)(
            process.execPath,
            [
              "-e",
              "process.stdout.write('owned-build-output');process.stderr.write('owned-build-error');process.exit(7)",
            ],
            { windowsHide: true },
          ),
        (event) => events.push(event),
      ),
    ).rejects.toThrow('"code":7');
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      nativeStage: "build",
      event: "failed",
      error: { code: 7, stdout: "owned-build-output", stderr: "owned-build-error" },
    });
    expect(JSON.stringify(events)).not.toContain("process.stdout.write");
  });

  it("attributes pre-observer launch rejection without exporting arbitrary metadata", async () => {
    const events: object[] = [];
    const failure = Object.assign(new Error("owned launch rejected"), {
      code: 3221226505,
      signal: null,
      env: { secret: "fixture-secret" },
      spawnargs: ["fixture-secret"],
      stdout: "launch output",
      stderr: "GetFrame failed",
    });
    await expect(
      nativeStage(
        "fixture",
        "launch",
        [],
        async () => {
          throw failure;
        },
        (event) => events.push(event),
      ),
    ).rejects.toThrow('"nativeStage":"launch"');
    expect(events[1]).toMatchObject({
      nativeStage: "launch",
      event: "failed",
      error: { code: 3221226505, stderr: "GetFrame failed" },
    });
    expect(JSON.stringify(events)).not.toContain("fixture-secret");
  });

  it("bounds and sanitizes output, and does not claim unknown exit attribution", () => {
    const failure = nativeFailure(
      Object.assign(new Error("launch failed"), {
        stderr: `${"x".repeat(20000)} secret=hidden`,
        arbitraryPid: 9,
      }),
      [],
    );
    expect(failure.stderr?.length).toBe(16384);
    expect(failure.stderr).not.toContain("hidden");
    expect(failure.code).toBeUndefined();
    expect(failure).not.toHaveProperty("arbitraryPid");
  });
});
