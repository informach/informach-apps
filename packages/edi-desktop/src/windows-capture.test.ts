import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertNativeTarget,
  configureWindowsCapture,
  nativeCaptureRequestSchema,
  parseNativeCaptureResponse,
  prepareWindowsCapture,
  queryWindowsCapture,
} from "./windows-capture.ts";

const window = {
  handle: "123",
  identity: "123:456:789",
  bounds: { x: -100, y: 20, width: 50, height: 60 },
};
describe("bounded Windows capture bridge", () => {
  it("focus/wheel require exact targets and a closed bounded input contract", () => {
    const request = {
      op: "wheel" as const,
      target: window,
      region: window.bounds,
      axis: "horizontal" as const,
      delta: 120 as const,
    };
    expect(nativeCaptureRequestSchema.parse(request)).toEqual(request);
    for (const invalid of [
      { ...request, delta: 240 },
      { ...request, axis: "diagonal" },
      { ...request, code: "anything" },
      { ...request, target: { ...window, identity: "wrong" } },
    ])
      expect(() => nativeCaptureRequestSchema.parse(invalid)).toThrow();
    expect(() =>
      parseNativeCaptureResponse(
        request,
        JSON.stringify({ ok: true, result: { ...window, identity: "123:9:9" } }),
      ),
    ).toThrow("TARGET_CHANGED");
    expect(
      parseNativeCaptureResponse(
        { op: "focus", target: window },
        JSON.stringify({ ok: true, result: { window, focused: false } }),
      ),
    ).toEqual({ window, focused: false });
  });
  it("accepts only fixed actions and numeric HWND identities", () => {
    expect(nativeCaptureRequestSchema.parse({ op: "bounds", handle: "123" })).toEqual({
      op: "bounds",
      handle: "123",
    });
    for (const request of [
      { op: "exec", code: "exit" },
      { op: "bounds", handle: "1;exit" },
      { op: "bounds", handle: "9223372036854775808" },
      { op: "cursor", path: "any" },
      { op: "windows", handles: Array(129).fill("1") },
    ])
      expect(() => nativeCaptureRequestSchema.parse(request)).toThrow();
  });
  it("validates result identity, shape, limits and native errors", () => {
    expect(
      parseNativeCaptureResponse(
        { op: "bounds", handle: "123" },
        JSON.stringify({ ok: true, result: window }),
      ),
    ).toEqual(window);
    expect(() =>
      parseNativeCaptureResponse(
        { op: "bounds", handle: "321" },
        JSON.stringify({ ok: true, result: window }),
      ),
    ).toThrow("MISMATCH");
    expect(() =>
      parseNativeCaptureResponse(
        { op: "bounds", handle: "123" },
        JSON.stringify({ ok: true, result: { ...window, title: "unexpected" } }),
      ),
    ).toThrow();
    expect(() =>
      parseNativeCaptureResponse(
        { op: "windows", handles: ["321"] },
        JSON.stringify({ ok: true, result: [window] }),
      ),
    ).toThrow("MISMATCH");
    expect(() =>
      parseNativeCaptureResponse(
        { op: "foreground" },
        JSON.stringify({ ok: false, error: "WINDOW_UNAVAILABLE" }),
      ),
    ).toThrow("WINDOW_UNAVAILABLE");
  });
  it("rejects replaced, moved or resized targets", () => {
    expect(() =>
      assertNativeTarget(window, { ...window, bounds: { ...window.bounds } }),
    ).not.toThrow();
    expect(() => assertNativeTarget(window, { ...window, identity: "123:2:3" })).toThrow(
      "TARGET_CHANGED",
    );
    expect(() =>
      assertNativeTarget(window, { ...window, bounds: { ...window.bounds, x: 0 } }),
    ).toThrow("TARGET_CHANGED");
  });
  it("rejects malformed or mismatched cursor pixels", () => {
    const cursor = {
      visible: false,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      hotspotX: 0,
      hotspotY: 0,
      blackPng: null,
      whitePng: null,
    };
    expect(
      parseNativeCaptureResponse({ op: "cursor" }, JSON.stringify({ ok: true, result: cursor })),
    ).toEqual(cursor);
    expect(() =>
      parseNativeCaptureResponse(
        { op: "cursor" },
        JSON.stringify({ ok: true, result: { ...cursor, visible: true } }),
      ),
    ).toThrow();
  });
  it("pre-abort prevents launch and invalid timeout cannot reach native execution", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      queryWindowsCapture({ op: "cursor" }, { signal: controller.signal }),
    ).rejects.toThrow();
    await expect(queryWindowsCapture({ op: "cursor" }, { timeoutMs: 30_001 })).rejects.toThrow();
  });
  it.runIf(process.platform === "win32")(
    "runs only the helper the main process configured, as a local absolute executable",
    async () => {
      await expect(queryWindowsCapture({ op: "cursor" })).rejects.toThrow(
        "NATIVE_HELPER_UNCONFIGURED",
      );
      await expect(prepareWindowsCapture()).rejects.toThrow("NATIVE_HELPER_UNCONFIGURED");
      for (const helper of [
        "edicaptura-helper.exe",
        "resources\\native\\edicaptura-helper.exe",
        "\\\\server\\share\\edicaptura-helper.exe",
        "C:\\Edi\\helper.cmd",
        "C:\\Edi\\helper.exe\0.cmd",
        'C:\\Edi\\"helper".exe',
      ])
        expect(() => configureWindowsCapture({ helper })).toThrow();
      await expect(queryWindowsCapture({ op: "cursor" })).rejects.toThrow(
        "NATIVE_HELPER_UNCONFIGURED",
      );
      const missing = join(tmpdir(), `edi-missing-${process.pid}`, "edicaptura-helper.exe");
      configureWindowsCapture({ helper: missing });
      await expect(queryWindowsCapture({ op: "cursor" })).rejects.toThrow("NATIVE_LAUNCH_FAILED");
      await expect(prepareWindowsCapture()).rejects.toThrow("NATIVE_LAUNCH_FAILED");
    },
  );
});
