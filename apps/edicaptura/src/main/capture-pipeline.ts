import { randomUUID } from "node:crypto";
import { setImmediate as yieldImmediate } from "node:timers/promises";
import {
  assertNativeTarget,
  type NativeCursor,
  type NativeWindow,
  nativeWindowSchema,
  prepareWindowsCapture,
} from "@informach/edi-desktop/windows-capture";
import type { DesktopCapturer, NativeImage as Image, NativeImage, Screen } from "electron";
import { z } from "zod";
import { paintCaptureCursor } from "../domain/capture-cursor.ts";
import {
  type CaptureDisplay,
  type CaptureRect,
  captureRectSchema,
  composeCaptureSteps,
  intersectRect,
  planCapture,
  topologyKey,
} from "../domain/capture-geometry.ts";
import {
  type Precision,
  precisionSchema,
  type SavedRegion,
  savedRegionSchema,
  validateSavedRegion,
} from "../domain/capture-preferences.ts";
import {
  acquireScreens,
  acquireWindow,
  listCaptureSources,
  windowHandle,
} from "./capture-sources.ts";

export const photoRequestSchema = z
  .object({
    mode: z.enum(["monitor", "all", "window", "active", "control", "region", "region-all"]),
    source: z.string().max(100).optional(),
    control: z.string().uuid().optional(),
    delay: z.number().int().min(0).max(30).default(0),
    cursor: z.boolean().default(false),
    timing: z.enum(["fresh", "frozen"]).default("fresh"),
    destination: z.enum(["editor", "library"]).default("editor"),
    precision: precisionSchema.optional(),
    savedRegion: savedRegionSchema.optional(),
  })
  .strict();
type Request = z.infer<typeof photoRequestSchema>;
type Bridge = Awaited<ReturnType<typeof prepareWindowsCapture>>;
type State = { phase: string; remaining?: number; error?: string; saved?: boolean };
type Active = {
  token: string;
  abort: AbortController;
  request: Request;
  topology: CaptureDisplay[];
  bridge?: Bridge;
  target?: NativeWindow;
  child?: NativeWindow;
  region?: CaptureRect;
  outputScale?: number;
  selectionReady?: boolean;
  image?: NativeImage;
  frozen?: { image: NativeImage; region: CaptureRect };
  saving?: Promise<void>;
  closeJob: () => void;
  started: number;
  acquisitionStarted?: number;
  acquired?: number;
  deadline?: number;
};
type Dependencies = {
  sources: Pick<DesktopCapturer, "getSources">;
  screen: Pick<Screen, "getAllDisplays" | "screenToDipRect">;
  images: {
    createFromBitmap: (bytes: Buffer, size: { width: number; height: number }) => NativeImage;
    createFromBuffer: (bytes: Buffer) => NativeImage;
  };
  assertAccess: () => void;
  allowed: () => boolean;
  beginJob: (stop: () => void) => { finish: () => void };
  hide: () => void;
  show: () => void;
  select: (
    image: Image,
    region: CaptureRect,
    timing: "fresh" | "frozen",
    precision?: Precision,
  ) => void;
  remember?: (region: SavedRegion) => Promise<void>;
  state: (state: State) => void;
  save: (image: Image) => Promise<string>;
  publish: (id: string, current: () => boolean) => Promise<void>;
  prepare?: typeof prepareWindowsCapture;
};
export class PhotoCapture {
  private active: Active | null = null;
  private catalog = new Map<string, { sourceId: string; target: NativeWindow }>();
  private controls = new Map<string, { source: string; child: NativeWindow }>();
  private listing: AbortController | null = null;
  private deps: Dependencies;
  constructor(deps: Dependencies) {
    this.deps = deps;
  }
  get busy() {
    return !!this.active || !!this.listing;
  }
  private topology(): CaptureDisplay[] {
    return this.deps.screen.getAllDisplays().map((d) => ({
      id: String(d.id),
      bounds: d.bounds,
      scaleFactor: d.scaleFactor,
      rotation: d.rotation,
    }));
  }
  private guard(a: Active) {
    a.abort.signal.throwIfAborted();
    if (this.active !== a || !this.deps.allowed()) throw new Error("Sessão encerrada.");
    this.deps.assertAccess();
    if (topologyKey(this.topology()) !== topologyKey(a.topology))
      throw new Error("Topologia alterada.");
  }
  async sources() {
    if (this.busy) throw new Error("Encerre a captura atual.");
    this.deps.assertAccess();
    const abort = new AbortController();
    this.listing = abort;
    this.catalog.clear();
    this.controls.clear();
    let bridge: Bridge | undefined;
    try {
      const sources = await listCaptureSources(this.deps.sources, "window", {
        preview: true,
        signal: abort.signal,
      });
      abort.signal.throwIfAborted();
      this.deps.assertAccess();
      if (sources.length > 128)
        throw new Error("Há mais de 128 janelas. Feche algumas antes de listar.");
      bridge = await (this.deps.prepare ?? prepareWindowsCapture)(abort.signal);
      abort.signal.throwIfAborted();
      this.deps.assertAccess();
      const targets = z.array(nativeWindowSchema).parse(
        await bridge.query({
          op: "windows",
          handles: sources.map((s) => windowHandle(s.id)),
        }),
      );
      abort.signal.throwIfAborted();
      this.deps.assertAccess();
      if (!this.deps.allowed()) throw new Error("Biblioteca indisponível.");
      this.catalog.clear();
      this.controls.clear();
      return sources.flatMap((s) => {
        const target = targets.find((t) => t.handle === windowHandle(s.id));
        if (!target) return [];
        const token = randomUUID();
        this.catalog.set(token, { sourceId: s.id, target });
        return [{ token, name: s.name, preview: s.preview?.toDataURL() ?? "" }];
      });
    } finally {
      bridge?.close();
      this.listing = null;
    }
  }
  async children(source: string) {
    if (this.busy) throw new Error("Encerre a captura atual.");
    const item = this.catalog.get(z.string().uuid().parse(source));
    if (!item) throw new Error("Selecione uma fonte atual.");
    this.deps.assertAccess();
    const abort = new AbortController();
    this.listing = abort;
    const bridge = await (this.deps.prepare ?? prepareWindowsCapture)(abort.signal).catch(
      (error) => {
        this.listing = null;
        throw error;
      },
    );
    try {
      abort.signal.throwIfAborted();
      this.deps.assertAccess();
      assertNativeTarget(
        item.target,
        nativeWindowSchema.parse(await bridge.query({ op: "bounds", handle: item.target.handle })),
      );
      abort.signal.throwIfAborted();
      this.deps.assertAccess();
      const children = z
        .array(nativeWindowSchema)
        .parse(await bridge.query({ op: "controls", handle: item.target.handle }));
      abort.signal.throwIfAborted();
      this.deps.assertAccess();
      if (!this.deps.allowed()) throw new Error("Biblioteca indisponível.");
      this.controls.clear();
      return children.map((child, index) => {
        const token = randomUUID();
        this.controls.set(token, { source, child });
        return {
          token,
          name: `Controle HWND ${index + 1}`,
          bounds: child.bounds,
          previewRect: {
            x: (child.bounds.x - item.target.bounds.x) / item.target.bounds.width,
            y: (child.bounds.y - item.target.bounds.y) / item.target.bounds.height,
            width: child.bounds.width / item.target.bounds.width,
            height: child.bounds.height / item.target.bounds.height,
          },
        };
      });
    } finally {
      bridge.close();
      this.listing = null;
    }
  }
  async start(input: unknown, monitor: string) {
    if (this.busy) throw new Error("Encerre ou salve a captura atual.");
    const request = photoRequestSchema.parse(input);
    if (request.timing === "frozen" && !["region", "region-all"].includes(request.mode))
      throw new Error("Congelamento exige seleção de região.");
    if (request.savedRegion && !["region", "region-all"].includes(request.mode))
      throw new Error("Região salva exige modo de região.");
    this.deps.assertAccess();
    if (!this.deps.allowed()) throw new Error("Biblioteca indisponível.");
    if (["window", "control"].includes(request.mode) && !this.catalog.has(request.source ?? ""))
      throw new Error("Selecione uma fonte atual.");
    const a: Active = {
      token: randomUUID(),
      abort: new AbortController(),
      request,
      topology: this.topology(),
      closeJob: () => {},
      started: performance.now(),
    };
    this.active = a;
    try {
      const job = this.deps.beginJob(() =>
        this.interrupt("Acesso interrompido. Trabalho adquirido preservado."),
      );
      a.closeJob = () => job.finish();
      this.deps.state({ phase: "preparing" });
      if (request.cursor || ["window", "active", "control"].includes(request.mode)) {
        a.bridge = await (this.deps.prepare ?? prepareWindowsCapture)(a.abort.signal);
        this.guard(a);
      }
      if (request.mode === "window" || request.mode === "control") {
        const item = this.catalog.get(request.source ?? "");
        if (!item) throw new Error("Selecione uma fonte atual.");
        a.target = item.target;
        if (request.mode === "control") {
          const child = this.controls.get(request.control ?? "");
          if (!child || child.source !== request.source)
            throw new Error("Controle não autorizado.");
          a.child = child.child;
        }
        await this.validateTarget(a);
        this.guard(a);
      }
      this.deps.hide();
      if (request.mode === "active") {
        if (!a.bridge) throw new Error("Ponte indisponível.");
        a.target = nativeWindowSchema.parse(await a.bridge.query({ op: "foreground" }));
        this.guard(a);
        const eligible = await listCaptureSources(this.deps.sources, "window", {
          signal: a.abort.signal,
        });
        this.guard(a);
        if (!eligible.some((s) => windowHandle(s.id) === a.target?.handle))
          throw new Error("Janela ativa indisponível.");
      }
      if (["monitor", "region"].includes(request.mode)) {
        a.region = a.topology.find((d) => d.id === monitor)?.bounds;
        if (!a.region) throw new Error("Monitor indisponível.");
      }
      if (request.mode === "region" || request.mode === "region-all") {
        if (request.savedRegion) {
          a.region = validateSavedRegion(request.savedRegion, a.topology);
          a.outputScale = request.savedRegion.scale;
          // Repeat obtains a new frame. Frozen repeat freezes at invocation, without delay.
          if (request.timing === "frozen") a.request.delay = 0;
          await this.capture(a);
          return;
        }
        const initial = await this.acquire(a);
        this.guard(a);
        a.frozen = request.timing === "frozen" ? initial : undefined;
        a.region = initial.region;
        a.outputScale = initial.image.getSize().width / initial.region.width;
        a.selectionReady = true;
        this.deps.select(initial.image, initial.region, request.timing, request.precision);
        this.deps.state({ phase: "selecting" });
        return;
      }
      await this.capture(a);
    } catch (error) {
      this.fail(a, error);
      throw error;
    }
  }
  async selected(input: unknown) {
    const a = this.active;
    if (!a?.selectionReady || !a.region || !["region", "region-all"].includes(a.request.mode))
      throw new Error("Seleção encerrada.");
    const rect = captureRectSchema.parse(input);
    // Compare bounds directly: subtracting intersection endpoints can change
    // a valid fractional-DIP width by an ULP. Keep the submitted pixel geometry.
    if (
      rect.x < a.region.x ||
      rect.y < a.region.y ||
      rect.x + rect.width > a.region.x + a.region.width ||
      rect.y + rect.height > a.region.y + a.region.height
    )
      throw new Error("Região inválida.");
    this.guard(a);
    const saved = { rect, topology: topologyKey(a.topology), scale: a.outputScale };
    validateSavedRegion(saved, a.topology);
    a.selectionReady = false;
    try {
      await this.deps.remember?.(saved);
      this.guard(a);
    } catch (error) {
      if (this.active === a && !a.abort.signal.aborted) a.selectionReady = true;
      throw error;
    }
    a.region = rect;
    this.deps.hide();
    try {
      if (a.frozen) {
        this.guard(a);
        const size = a.frozen.image.getSize(),
          base = a.frozen.region;
        const x = Math.round(((rect.x - base.x) * size.width) / base.width),
          y = Math.round(((rect.y - base.y) * size.height) / base.height);
        a.image = a.frozen.image.crop({
          x,
          y,
          width: Math.round(((rect.x + rect.width - base.x) * size.width) / base.width) - x,
          height: Math.round(((rect.y + rect.height - base.y) * size.height) / base.height) - y,
        });
        a.frozen = undefined;
        await this.save(a);
      } else await this.capture(a);
    } catch (error) {
      this.fail(a, error);
      throw error;
    }
  }
  private async validateTarget(a: Active) {
    if (!a.target || !a.bridge) return;
    assertNativeTarget(
      a.target,
      nativeWindowSchema.parse(await a.bridge.query({ op: "bounds", handle: a.target.handle })),
    );
    this.guard(a);
    if (a.child) {
      const children = z
        .array(nativeWindowSchema)
        .parse(await a.bridge.query({ op: "controls", handle: a.target.handle }));
      this.guard(a);
      const child = children.find((c) => c.handle === a.child?.handle);
      if (!child) throw new Error("Controle fechado.");
      assertNativeTarget(a.child, child);
    }
  }
  private async acquire(a: Active): Promise<{ image: NativeImage; region: CaptureRect }> {
    this.guard(a);
    await this.validateTarget(a);
    this.guard(a);
    a.acquisitionStarted = performance.now();
    let image: NativeImage, region: CaptureRect, cursor: NativeCursor | undefined;
    const sampleCursor = async () => {
      a.acquired = performance.now();
      if (a.request.cursor && a.bridge) {
        const result = await a.bridge.query({ op: "cursor" });
        this.guard(a);
        if (!("visible" in result)) throw new Error("Cursor inválido.");
        cursor = result;
      }
    };
    if (a.target) {
      const bridge = a.bridge;
      if (!bridge) throw new Error("Ponte indisponível.");
      image = await acquireWindow(this.deps.sources, a.target, {
        signal: a.abort.signal,
        readTarget: async (handle) =>
          nativeWindowSchema.parse(await bridge.query({ op: "bounds", handle })),
      });
      this.guard(a);
      await sampleCursor();
      if (a.child) {
        const parent = a.target.bounds,
          child = a.child.bounds,
          size = image.getSize();
        const clipped = intersectRect(parent, child);
        if (!clipped) throw new Error("Controle fora da janela.");
        const x = Math.round(((clipped.x - parent.x) * size.width) / parent.width),
          y = Math.round(((clipped.y - parent.y) * size.height) / parent.height);
        image = image.crop({
          x,
          y,
          width:
            Math.round(((clipped.x + clipped.width - parent.x) * size.width) / parent.width) - x,
          height:
            Math.round(((clipped.y + clipped.height - parent.y) * size.height) / parent.height) - y,
        });
        region = this.deps.screen.screenToDipRect(null, clipped);
      } else region = this.deps.screen.screenToDipRect(null, a.target.bounds);
    } else {
      region =
        a.region ??
        planCapture(
          a.topology,
          a.topology.map((d) => ({
            id: d.id,
            width: Math.round(d.bounds.width * d.scaleFactor),
            height: Math.round(d.bounds.height * d.scaleFactor),
          })),
        ).region;
      const screens = await acquireScreens(this.deps.sources, a.topology, {
        signal: a.abort.signal,
        currentTopology: () => this.topology(),
      });
      this.guard(a);
      await sampleCursor();
      const plan = planCapture(
        a.topology,
        screens.map((s) => ({ id: s.id, width: s.width, height: s.height })),
        region,
        a.outputScale,
      );
      const bitmaps = screens.map((s) => ({
        id: s.id,
        width: s.width,
        height: s.height,
        pixels: s.image.toBitmap(),
      }));
      screens.length = 0;
      this.deps.state({ phase: "composing" });
      const steps = composeCaptureSteps(plan, bitmaps);
      let step = steps.next();
      while (!step.done) {
        await yieldImmediate();
        this.guard(a);
        step = steps.next();
      }
      const pixels = step.value;
      image = this.deps.images.createFromBitmap(
        Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength),
        { width: plan.width, height: plan.height },
      );
    }
    this.guard(a);
    await this.validateTarget(a);
    this.guard(a);
    if (cursor) image = this.cursor(image, region, cursor);
    return { image, region };
  }
  private cursor(image: NativeImage, region: CaptureRect, c: NativeCursor) {
    if (!c.visible || !c.blackPng || !c.whitePng) return image;
    const dip = this.deps.screen.screenToDipRect(null, {
      x: c.x - c.hotspotX,
      y: c.y - c.hotspotY,
      width: c.width,
      height: c.height,
    });
    const { width, height } = image.getSize(),
      pixels = image.toBitmap();
    paintCaptureCursor(pixels, width, height, {
      width: c.width,
      height: c.height,
      black: this.deps.images.createFromBuffer(Buffer.from(c.blackPng, "base64")).toBitmap(),
      white: this.deps.images.createFromBuffer(Buffer.from(c.whitePng, "base64")).toBitmap(),
      destination: {
        x: ((dip.x - region.x) * width) / region.width,
        y: ((dip.y - region.y) * height) / region.height,
        width: (dip.width * width) / region.width,
        height: (dip.height * height) / region.height,
      },
    });
    return this.deps.images.createFromBitmap(pixels, { width, height });
  }
  private async capture(a: Active) {
    this.guard(a);
    a.deadline = performance.now() + a.request.delay * 1000;
    while (performance.now() < a.deadline) {
      this.guard(a);
      this.deps.state({
        phase: "countdown",
        remaining: Math.ceil((a.deadline - performance.now()) / 1000),
      });
      await new Promise<void>((resolve, reject) => {
        const abort = () => {
          clearTimeout(timer);
          reject(new Error("Captura cancelada."));
        };
        const timer = setTimeout(
          () => {
            a.abort.signal.removeEventListener("abort", abort);
            resolve();
          },
          Math.min(100, (a.deadline ?? 0) - performance.now()),
        );
        a.abort.signal.addEventListener("abort", abort, { once: true });
      });
    }
    this.guard(a);
    this.deps.state({ phase: "acquiring" });
    a.image = (await this.acquire(a)).image;
    this.guard(a);
    await this.save(a);
  }
  private async save(a: Active) {
    if (a.saving) return a.saving;
    if (!a.image) throw new Error("Não há imagem preservada.");
    const image = a.image;
    a.saving = (async () => {
      this.deps.state({ phase: "saving" });
      const id = await this.deps.save(image);
      if (this.active !== a) return;
      a.image = undefined;
      if (a.abort.signal.aborted) {
        this.finish(a);
        this.deps.state({ phase: "done", saved: true });
        return;
      }
      // Recheck before activation; persisted work remains in the library if access changed.
      this.guard(a);
      if (a.request.destination === "editor")
        await this.deps.publish(id, () => {
          try {
            this.guard(a);
            return true;
          } catch {
            return false;
          }
        });
      if (this.active !== a || a.abort.signal.aborted) return;
      this.finish(a);
      this.deps.state({ phase: "done", saved: true });
    })();
    try {
      await a.saving;
    } finally {
      a.saving = undefined;
    }
  }
  async retry() {
    const a = this.active;
    if (!a?.image) throw new Error("Não há imagem preservada.");
    // Existing pixels may be saved in recovery mode; never reacquire without access.
    try {
      await this.save(a);
    } catch (error) {
      this.fail(a, error);
      throw error;
    }
  }
  interrupt(message = "Captura cancelada.") {
    this.listing?.abort();
    this.catalog.clear();
    this.controls.clear();
    const a = this.active;
    if (!a) {
      this.deps.state({ phase: "cancelled" });
      return;
    }
    a.abort.abort();
    a.bridge?.close();
    a.closeJob();
    if (a.image) {
      this.deps.show();
      this.deps.state({ phase: "retained", error: message });
    } else {
      this.finish(a);
      this.deps.state({ phase: "cancelled" });
    }
  }
  discard() {
    if (this.active) this.finish(this.active);
    this.deps.state({ phase: "cancelled" });
  }
  private fail(a: Active, error: unknown) {
    if (this.active !== a) return;
    const message = error instanceof Error ? error.message : "Falha na captura.";
    if (a.image) {
      a.bridge?.close();
      this.deps.show();
      this.deps.state({ phase: "retained", error: message });
    } else {
      this.finish(a);
      this.deps.state({ phase: "error", error: message });
    }
  }
  private finish(a: Active) {
    this.catalog.clear();
    this.controls.clear();
    a.abort.abort();
    a.bridge?.close();
    a.closeJob();
    if (this.active === a) this.active = null;
    this.deps.show();
  }
}
