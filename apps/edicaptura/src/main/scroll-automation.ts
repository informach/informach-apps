import { randomUUID } from "node:crypto";
import {
  assertNativeTarget,
  type NativeWindow,
  nativeFocusSchema,
  nativeWindowSchema,
  prepareWindowsCapture,
} from "@informach/edi-desktop/windows-capture";
import { z } from "zod";
import { axisSchema } from "../domain/scroll.ts";

type Bridge = Awaited<ReturnType<typeof prepareWindowsCapture>>;
export const autoRequestSchema = z
  .object({
    token: z.string().uuid(),
    axis: axisSchema,
    authorized: z.literal(true),
    maxSteps: z.number().int().min(1).max(120).default(60),
  })
  .strict();
export class ScrollAutomation {
  private targets = new Map<string, NativeWindow>();
  private abort: AbortController | undefined;
  private bridge: Bridge | undefined;
  private active:
    | {
        target: NativeWindow;
        axis: "vertical" | "horizontal";
        steps: number;
        maxSteps: number;
        started: number;
        waiting: boolean;
      }
    | undefined;
  private prepare: typeof prepareWindowsCapture;
  private now: () => number;
  constructor(
    prepare: typeof prepareWindowsCapture = prepareWindowsCapture,
    now = () => performance.now(),
  ) {
    this.prepare = prepare;
    this.now = now;
  }
  get running(): boolean {
    return !!this.active && !this.active.waiting;
  }
  get waiting(): boolean {
    return !!this.active?.waiting;
  }
  get steps(): number {
    return this.active?.steps ?? 0;
  }
  async list(
    handles: string[],
    region: NativeWindow["bounds"],
  ): Promise<{ token: string; handle: string }[]> {
    this.stop();
    const abort = new AbortController();
    this.abort = abort;
    const bridge = await this.prepare(abort.signal);
    if (this.abort !== abort) {
      bridge.close();
      throw new Error("Autorização cancelada.");
    }
    this.bridge = bridge;
    const targets = z
      .array(nativeWindowSchema)
      .parse(await bridge.query({ op: "windows", handles }));
    abort.signal.throwIfAborted();
    this.targets.clear();
    const result = [];
    for (const target of targets)
      if (contains(target.bounds, region)) {
        const token = randomUUID();
        this.targets.set(token, target);
        result.push({ token, handle: target.handle });
      }
    return result;
  }
  async start(input: unknown, region: NativeWindow["bounds"]): Promise<void> {
    const request = autoRequestSchema.parse(input),
      target = this.targets.get(request.token),
      bridge = this.bridge,
      abort = this.abort;
    if (!target || !bridge || !abort || abort.signal.aborted || !contains(target.bounds, region))
      throw new Error("Escolha novamente uma janela que contenha toda a área móvel.");
    if (this.active) throw new Error("Rolagem automática já iniciada.");
    const actual = nativeFocusSchema.parse(await bridge.query({ op: "focus", target }));
    abort.signal.throwIfAborted();
    assertNativeTarget(target, actual.window);
    this.active = {
      target,
      axis: request.axis,
      steps: 0,
      maxSteps: request.maxSteps,
      started: this.now(),
      waiting: !actual.focused,
    };
  }
  async waitForTarget(): Promise<boolean> {
    const active = this.active,
      bridge = this.bridge,
      abort = this.abort;
    if (!active?.waiting || !bridge || !abort) throw new Error("Automação encerrada.");
    try {
      if (this.now() - active.started >= 30000)
        throw new Error(
          "Ativação não confirmada em 30 segundos; trechos preservados. Ative a janela e autorize novamente ou use o modo assistido.",
        );
      const bounds = nativeWindowSchema.parse(
        await bridge.query({ op: "bounds", handle: active.target.handle }),
      );
      abort.signal.throwIfAborted();
      assertNativeTarget(active.target, bounds);
      const foreground = nativeWindowSchema.parse(await bridge.query({ op: "foreground" }));
      abort.signal.throwIfAborted();
      if (this.active !== active) throw new Error("Automação cancelada.");
      if (foreground.handle !== active.target.handle) return false;
      assertNativeTarget(active.target, foreground);
      active.waiting = false;
      active.started = this.now();
      return true;
    } catch (error) {
      this.stop();
      throw error;
    }
  }
  async wheel(
    region: NativeWindow["bounds"],
    direction: "forward" | "backward" = "forward",
  ): Promise<void> {
    const active = this.active,
      bridge = this.bridge,
      abort = this.abort;
    if (!active || active.waiting || !bridge || !abort || abort.signal.aborted)
      throw new Error("Automação encerrada.");
    if (active.steps >= active.maxSteps || this.now() - active.started >= 120000) {
      this.stop();
      throw new Error("Limite automático atingido; trechos preservados.");
    }
    if (!contains(active.target.bounds, region)) {
      this.stop();
      throw new Error("Área móvel fora da janela autorizada.");
    }
    const sign = active.axis === "vertical" ? -120 : 120;
    const delta = direction === "forward" ? sign : sign === 120 ? -120 : 120;
    try {
      const actual = nativeWindowSchema.parse(
        await bridge.query({
          op: "wheel",
          target: active.target,
          region,
          axis: active.axis,
          delta,
        }),
      );
      abort.signal.throwIfAborted();
      if (this.active !== active) throw new Error("Automação cancelada.");
      assertNativeTarget(active.target, actual);
      active.steps++;
    } catch (error) {
      this.stop();
      throw error;
    }
  }
  async verify(): Promise<void> {
    const active = this.active,
      bridge = this.bridge,
      abort = this.abort;
    if (!active || !bridge || !abort) throw new Error("Automação encerrada.");
    const actual = nativeWindowSchema.parse(await bridge.query({ op: "foreground" }));
    abort.signal.throwIfAborted();
    assertNativeTarget(active.target, actual);
  }
  stop(): void {
    this.active = undefined;
    this.abort?.abort();
    this.abort = undefined;
    this.bridge?.close();
    this.bridge = undefined;
    this.targets.clear();
  }
}
function contains(outer: NativeWindow["bounds"], inner: NativeWindow["bounds"]): boolean {
  nativeWindowSchema.shape.bounds.parse(inner);
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}
