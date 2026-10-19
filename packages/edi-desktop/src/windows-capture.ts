import { spawn } from "node:child_process";
import { join } from "node:path";
import { z } from "zod";
import { makeWindowsCaptureScript, windowsCaptureScript } from "./windows-capture-script.ts";
import { windowsPowerShellEnvironment } from "./windows-powershell.ts";

// The fixed bootstrap reads the bundled trusted source before request JSON. Keep large C#
// source off Windows' 32767-character command line; no renderer input becomes executable code.
const bootstrap =
  "[Console]::InputEncoding=[System.Text.UTF8Encoding]::new($false); $source=[Console]::ReadLine(); & ([scriptblock]::Create([System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($source))))";
const encodedBootstrap = Buffer.from(bootstrap, "utf16le").toString("base64");

export const nativeHandleSchema = z
  .string()
  .regex(/^[1-9]\d{0,18}$/)
  .refine((v) => BigInt(v) <= 9223372036854775807n);
const coordinate = z.number().int().min(-1_000_000).max(1_000_000);
export const nativeWindowSchema = z
  .object({
    handle: nativeHandleSchema,
    identity: z
      .string()
      .regex(/^\d+:\d+:\d+$/)
      .max(64),
    bounds: z
      .object({
        x: coordinate,
        y: coordinate,
        width: z.number().int().positive().max(100_000),
        height: z.number().int().positive().max(100_000),
      })
      .strict(),
  })
  .strict();
export type NativeWindow = z.infer<typeof nativeWindowSchema>;
export const nativeFocusSchema = z
  .object({ window: nativeWindowSchema, focused: z.boolean() })
  .strict();
const cursorSchema = z
  .object({
    visible: z.boolean(),
    x: coordinate,
    y: coordinate,
    hotspotX: z.number().int().min(0).max(511),
    hotspotY: z.number().int().min(0).max(511),
    width: z.number().int().min(0).max(512),
    height: z.number().int().min(0).max(512),
    blackPng: z
      .string()
      .max(1_500_000)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/)
      .nullable(),
    whitePng: z
      .string()
      .max(1_500_000)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/)
      .nullable(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      v.visible &&
      (!v.blackPng ||
        !v.whitePng ||
        !v.width ||
        !v.height ||
        v.hotspotX >= v.width ||
        v.hotspotY >= v.height)
    )
      ctx.addIssue({ code: "custom", message: "Cursor bitmap/hotspot inválido." });
    if (
      !v.visible &&
      (v.blackPng !== null || v.whitePng !== null || v.width !== 0 || v.height !== 0)
    )
      ctx.addIssue({ code: "custom", message: "Cursor oculto com pixels inesperados." });
    if (v.visible)
      for (const encoded of [v.blackPng, v.whitePng]) {
        if (!encoded) continue;
        const bytes = Buffer.from(encoded, "base64");
        if (
          bytes.length < 33 ||
          !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
          bytes.subarray(12, 16).toString("ascii") !== "IHDR" ||
          bytes.readUInt32BE(16) !== v.width ||
          bytes.readUInt32BE(20) !== v.height
        )
          ctx.addIssue({ code: "custom", message: "Bitmap PNG do cursor inválido." });
      }
  });
export type NativeCursor = z.infer<typeof cursorSchema>;
export const nativeCaptureRequestSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("foreground") }).strict(),
  z.object({ op: z.literal("bounds"), handle: nativeHandleSchema }).strict(),
  z.object({ op: z.literal("controls"), handle: nativeHandleSchema }).strict(),
  z.object({ op: z.literal("windows"), handles: z.array(nativeHandleSchema).max(128) }).strict(),
  z.object({ op: z.literal("cursor") }).strict(),
  z.object({ op: z.literal("focus"), target: nativeWindowSchema }).strict(),
  z
    .object({
      op: z.literal("wheel"),
      target: nativeWindowSchema,
      region: nativeWindowSchema.shape.bounds,
      axis: z.enum(["vertical", "horizontal"]),
      delta: z.union([z.literal(-120), z.literal(120)]),
    })
    .strict(),
]);
export type NativeCaptureRequest = z.infer<typeof nativeCaptureRequestSchema>;
type NativeResult =
  | NativeWindow
  | NativeWindow[]
  | NativeCursor
  | z.infer<typeof nativeFocusSchema>;
const envelope = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), result: z.unknown() }).strict(),
  z
    .object({
      ok: z.literal(false),
      error: z.enum([
        "WINDOW_UNAVAILABLE",
        "BOUNDS_UNAVAILABLE",
        "CURSOR_UNAVAILABLE",
        "CURSOR_LIMIT",
        "CONTROL_LIMIT",
        "TARGET_CHANGED",
        "DPI_UNAVAILABLE",
        "INVALID_ACTION",
        "NATIVE_FAILURE",
      ]),
    })
    .strict(),
]);
export function parseNativeCaptureResponse(
  request: NativeCaptureRequest,
  text: string,
): NativeResult {
  const reply = envelope.parse(JSON.parse(text));
  if (!reply.ok) throw new Error(reply.error);
  if (request.op === "cursor") return cursorSchema.parse(reply.result);
  if (request.op === "controls" || request.op === "windows") {
    const result = z
      .array(nativeWindowSchema)
      .max(request.op === "controls" ? 256 : 128)
      .parse(reply.result);
    if (new Set(result.map((w) => w.handle)).size !== result.length)
      throw new Error("NATIVE_DUPLICATE");
    if (request.op === "windows" && result.some((w) => !request.handles.includes(w.handle)))
      throw new Error("NATIVE_TARGET_MISMATCH");
    return result;
  }
  if (request.op === "focus") {
    const result = nativeFocusSchema.parse(reply.result);
    assertNativeTarget(request.target, result.window);
    return result;
  }
  const result = nativeWindowSchema.parse(reply.result);
  if (request.op === "wheel") assertNativeTarget(request.target, result);
  if (request.op === "bounds" && result.handle !== request.handle)
    throw new Error("NATIVE_TARGET_MISMATCH");
  return result;
}
export function assertNativeTarget(expected: NativeWindow, actual: NativeWindow): void {
  if (
    expected.identity !== actual.identity ||
    expected.handle !== actual.handle ||
    expected.bounds.x !== actual.bounds.x ||
    expected.bounds.y !== actual.bounds.y ||
    expected.bounds.width !== actual.bounds.width ||
    expected.bounds.height !== actual.bounds.height
  )
    throw new Error("TARGET_CHANGED");
}
/** Closed bounded actions. Focus/wheel require explicit caller authorization of the current target. */
export async function queryWindowsCapture(
  requestInput: NativeCaptureRequest,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<NativeResult> {
  const request = nativeCaptureRequestSchema.parse(requestInput);
  options.signal?.throwIfAborted();
  if (process.platform !== "win32") throw new Error("WINDOWS_UNAVAILABLE");
  const timeoutMs = z
    .number()
    .int()
    .min(1)
    .max(30_000)
    .parse(options.timeoutMs ?? 15_000);
  const root = process.env.SystemRoot;
  if (!root || !/^[A-Za-z]:\\/.test(root)) throw new Error("WINDOWS_UNAVAILABLE");
  const executable = join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  return new Promise((resolve, reject) => {
    const child = spawn(
      executable,
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encodedBootstrap],
      {
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
        env: windowsPowerShellEnvironment(),
      },
    );
    let output = "",
      bytes = 0,
      settled = false;
    const done = (error?: Error, result?: NativeResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      if (error) {
        child.kill();
        reject(error);
      } else if (result) resolve(result);
      else reject(new Error("NATIVE_EMPTY"));
    };
    const abort = () => done(new Error("CAPTURE_CANCELLED"));
    const timer = setTimeout(() => done(new Error("NATIVE_TIMEOUT")), timeoutMs);
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) {
      abort();
      return;
    }
    child.stdout.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > 3_100_000) return done(new Error("NATIVE_OUTPUT_LIMIT"));
      output += chunk.toString("utf8");
    });
    // Native diagnostics may contain paths: consume without logging or returning arbitrary text.
    child.stderr.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > 2_000_000) done(new Error("NATIVE_OUTPUT_LIMIT"));
    });
    child.on("error", () => done(new Error("NATIVE_LAUNCH_FAILED")));
    child.stdin.on("error", () => done(new Error("NATIVE_INPUT_FAILED")));
    child.on("close", (code) => {
      if (settled) return;
      try {
        const result = parseNativeCaptureResponse(request, output.trim());
        if (code !== 0) throw new Error("NATIVE_EXIT_FAILED");
        done(undefined, result);
      } catch (error) {
        done(error instanceof Error ? error : new Error("NATIVE_RESPONSE_INVALID"));
      }
    });
    child.stdin.end(
      `${Buffer.from(windowsCaptureScript, "utf8").toString("base64")}\n${JSON.stringify(request)}\n`,
    );
  });
}
export async function nativeWindowBounds(
  handle: string,
  signal?: AbortSignal,
): Promise<NativeWindow> {
  return nativeWindowSchema.parse(await queryWindowsCapture({ op: "bounds", handle }, { signal }));
}
export async function nativeForeground(signal?: AbortSignal): Promise<NativeWindow> {
  return nativeWindowSchema.parse(await queryWindowsCapture({ op: "foreground" }, { signal }));
}
export async function nativeControls(
  handle: string,
  signal?: AbortSignal,
): Promise<NativeWindow[]> {
  return z
    .array(nativeWindowSchema)
    .parse(await queryWindowsCapture({ op: "controls", handle }, { signal }));
}
export async function nativeEligibleWindows(
  handles: string[],
  signal?: AbortSignal,
): Promise<NativeWindow[]> {
  return z
    .array(nativeWindowSchema)
    .parse(await queryWindowsCapture({ op: "windows", handles }, { signal }));
}
export async function nativeCursor(signal?: AbortSignal): Promise<NativeCursor> {
  return cursorSchema.parse(await queryWindowsCapture({ op: "cursor" }, { signal }));
}

/** One trusted child per capture session. Ready means compilation finished, not capture happened. */
export async function prepareWindowsCapture(signal?: AbortSignal) {
  signal?.throwIfAborted();
  const root = process.env.SystemRoot;
  if (process.platform !== "win32" || !root || !/^[A-Za-z]:\\/.test(root))
    throw new Error("WINDOWS_UNAVAILABLE");
  const started = performance.now();
  const child = spawn(
    join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encodedBootstrap],
    { windowsHide: true, stdio: ["pipe", "pipe", "pipe"], env: windowsPowerShellEnvironment() },
  );
  let closed = false,
    buffer = "",
    bytes = 0;
  let pending: {
    request?: NativeCaptureRequest;
    resolve: (value: NativeResult | null) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  const close = (reason = new Error("CAPTURE_CANCELLED")) => {
    if (closed) return;
    closed = true;
    signal?.removeEventListener("abort", abort);
    if (pending) {
      clearTimeout(pending.timer);
      pending.reject(reason);
      pending = null;
    }
    child.kill();
  };
  const abort = () => close();
  const response = (request?: NativeCaptureRequest) =>
    new Promise<NativeResult | null>((resolve, reject) => {
      if (closed || signal?.aborted) return reject(new Error("CAPTURE_CANCELLED"));
      if (pending) return reject(new Error("NATIVE_BUSY"));
      bytes = 0;
      pending = {
        request,
        resolve,
        reject,
        timer: setTimeout(() => close(new Error("NATIVE_TIMEOUT")), 15000),
      };
    });
  child.stdout.on("data", (chunk: Buffer) => {
    bytes += chunk.length;
    if (bytes > 3_100_000) return close(new Error("NATIVE_OUTPUT_LIMIT"));
    buffer += chunk.toString("utf8");
    let end = buffer.indexOf("\n");
    while (end !== -1) {
      const line = buffer.slice(0, end).trim();
      buffer = buffer.slice(end + 1);
      const current = pending;
      if (!current) return close(new Error("NATIVE_UNEXPECTED_RESPONSE"));
      try {
        const value = current.request ? parseNativeCaptureResponse(current.request, line) : null;
        if (!current.request && line !== "READY") throw new Error("NATIVE_PREPARATION_FAILED");
        clearTimeout(current.timer);
        pending = null;
        current.resolve(value);
        end = buffer.indexOf("\n");
      } catch (error) {
        close(error instanceof Error ? error : new Error("NATIVE_RESPONSE_INVALID"));
      }
    }
  });
  child.stderr.on("data", (chunk: Buffer) => {
    bytes += chunk.length;
    if (bytes > 3_100_000) close(new Error("NATIVE_OUTPUT_LIMIT"));
  });
  child.on("error", () => close(new Error("NATIVE_LAUNCH_FAILED")));
  child.stdin.on("error", () => close(new Error("NATIVE_INPUT_FAILED")));
  child.on("close", () => close(new Error("NATIVE_EXIT_FAILED")));
  const ready = response();
  child.stdin.write(`${Buffer.from(makeWindowsCaptureScript(true), "utf8").toString("base64")}\n`);
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  await ready;
  return {
    preparationMs: performance.now() - started,
    close: () => close(),
    async query(input: NativeCaptureRequest): Promise<NativeResult> {
      const request = nativeCaptureRequestSchema.parse(input);
      if (pending) throw new Error("NATIVE_BUSY");
      if (closed || signal?.aborted) throw new Error("CAPTURE_CANCELLED");
      const result = response(request);
      child.stdin.write(`${JSON.stringify(request)}\n`);
      const value = await result;
      if (value === null) throw new Error("NATIVE_EMPTY");
      return value;
    },
  };
}
