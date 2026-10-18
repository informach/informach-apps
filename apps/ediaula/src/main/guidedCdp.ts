import type { WebContents } from "electron";
import { z } from "zod";
import type { FrameClock } from "../shared/frameClock.ts";
import type { GuidedLogLine } from "../shared/guidedCursor.ts";
import type {
  Chord,
  GuidedCondition,
  GuidedStepTarget,
  GuidedStepV2,
  GuidedViewport,
} from "../shared/guidedPlan.ts";
import { smoothPointer } from "../shared/guidedRecording.ts";
import { type GuidedDriver, type PointerButton, STOPPED } from "../shared/guidedRunner.ts";
import { LOCATOR_PAGE_SCRIPT } from "../shared/locatorPage.ts";
import {
  actionPoint,
  type BlocklyBlock,
  type BlocklyCanvas,
  type BlocklyNode,
  blocklyBlocks,
  blocklyCandidates,
  blocklyCanvas,
  blocklyDropBelow,
  blocklyMatches,
  buildLocator,
  type Candidate,
  conditionMet,
  type ElementDescription,
  type Locator,
  locateMessage,
  locatorLabel,
  type Point,
  pageToWorkspace,
  rankCandidates,
  type StrategyMatches,
  urlMatches,
  type ViewSize,
  workspaceToPage,
} from "../shared/locators.ts";

/**
 * The lesson page driven through the Chrome DevTools Protocol (D2): no real pointer moves.
 * CdpDriver is the protocol itself on a window's webContents: mouse and keyboard events,
 * an isolated world where shared/locatorPage.ts reports what the page has, the Accessibility
 * domain for role and name, element marking through the inspect mode, screenshots. WebDriver is
 * the guided runner's driver on top of it: one pointer event per frame of the video's clock, so
 * a drag in Blockly gets every pointer event, and everything it does goes to guided-log.jsonl.
 */

const WORLD = "ediaula-guided";

const rectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
const candidateSchema = z.object({
  tag: z.string().max(64),
  text: z.string().max(400),
  rect: rectSchema,
  visible: z.boolean(),
  enabled: z.boolean(),
  covered: z.boolean(),
  inView: z.boolean(),
  cursor: z.string().max(2000),
});
const blocklyNodeSchema: z.ZodType<BlocklyNode> = z.lazy(() =>
  z.object({
    tag: z.string().max(64),
    cls: z.array(z.string().max(200)).max(50).optional(),
    key: z.string().max(400).optional(),
    text: z.string().max(2000).optional(),
    rect: rectSchema.optional(),
    transform: z.string().max(400).optional(),
    children: z.array(blocklyNodeSchema).max(5000).optional(),
  }),
);
const viewSchema = z.object({ width: z.number().positive(), height: z.number().positive() });
const reportSchema = z.object({
  url: z.string(),
  view: viewSchema,
  scoped: z.boolean(),
  matches: z.array(
    z.object({ strategy: z.int().nonnegative(), candidates: z.array(candidateSchema).max(50) }),
  ),
  blockly: z.array(blocklyNodeSchema).max(50).nullable(),
});
const describeSchema = z.object({
  tag: z.string().max(64),
  text: z.string().max(400),
  testid: z.string().max(400).optional(),
  data: z.array(z.object({ name: z.string().max(100), value: z.string().max(400) })).max(10),
  id: z.string().max(400).optional(),
  role: z.string().max(60).optional(),
  label: z.string().max(400).optional(),
  css: z.string().max(4000).optional(),
  path: z.string().max(8000).optional(),
  blockly: z
    .object({
      key: z.string().max(400).nullable(),
      area: z.enum(["flyout", "workspace", "toolbox"]),
    })
    .nullable(),
  workspace: z.boolean(),
  kind: z.enum(["element", "canvas", "frame"]),
  rect: rectSchema,
  cursor: z.string().max(2000),
  view: viewSchema,
  url: z.string().max(8192),
  point: z.object({ u: z.number(), v: z.number() }),
});
const cursorSchema = z.object({ cursor: z.string().max(2000), editable: z.boolean() });

interface FrameTree {
  frame: { id: string; url: string; parentId?: string };
  childFrames?: FrameTree[];
}
interface RemoteObject {
  objectId?: string;
  value?: unknown;
}
interface EvaluateResult {
  result: RemoteObject;
  exceptionDetails?: { text: string; exception?: { description?: string } };
}
interface AXNode {
  ignored?: boolean;
  backendDOMNodeId?: number;
  role?: { value?: unknown };
  name?: { value?: unknown };
}

/** What the page has for a locator right now, or why it cannot say yet. */
export type PageFacts =
  | {
      ready: true;
      matches: StrategyMatches[];
      view: ViewSize;
      blocks: BlocklyBlock[] | null;
      canvas: BlocklyCanvas | null;
      /** Top-left of the frame the element lives in, in page pixels. */
      offset: Point;
    }
  | { ready: false; message: string };

export type Found =
  | {
      ok: true;
      point: Point;
      candidate: Candidate;
      block?: BlocklyBlock;
      canvas: BlocklyCanvas | null;
    }
  | { ok: false; message: string; navigating: boolean };

/** A marked element: its locator, and the point of the workspace when it was the background. */
export interface MarkedElement {
  locator?: Locator;
  /** The Blockly workspace's background was marked: this point, in workspace units. */
  workspace?: Point;
  /** Where the pointer was, page pixels. */
  page: Point;
  url: string;
  /** Why no locator could be made. */
  problem?: string;
}

const AX_IGNORED = new Set([
  "generic",
  "none",
  "presentation",
  "StaticText",
  "InlineTextBox",
  "GenericContainer",
  "Section",
  "group",
  "RootWebArea",
]);

export class CdpDriver {
  private readonly wc: WebContents;
  private readonly worlds = new Map<string, number>();
  private readonly listeners = new Map<string, Set<(params: Record<string, unknown>) => void>>();
  private detached: Error | null = null;
  private attached = false;

  constructor(wc: WebContents) {
    this.wc = wc;
  }

  get detachedError(): Error | null {
    return this.detached;
  }

  async attach(): Promise<void> {
    const debug = this.wc.debugger;
    if (!debug.isAttached())
      try {
        debug.attach("1.3");
      } catch (cause) {
        throw new Error(
          "Não consegui controlar a janela da aula. Feche o DevTools dela e tente de novo.",
          { cause },
        );
      }
    this.attached = true;
    debug.on("detach", this.onDetach);
    debug.on("message", this.onMessage);
    await this.send("Page.enable");
    await this.send("DOM.enable");
  }

  detach(): void {
    this.worlds.clear();
    const was = this.attached;
    this.attached = false;
    // A window already closed took its debugger with it.
    if (this.wc.isDestroyed()) return;
    const debug = this.wc.debugger;
    debug.off("detach", this.onDetach);
    debug.off("message", this.onMessage);
    if (was && debug.isAttached()) debug.detach();
  }

  private readonly onDetach = (_event: Electron.Event, reason: string): void => {
    this.attached = false;
    this.detached = new Error(
      /devtools/i.test(reason)
        ? "O DevTools foi aberto na janela da aula e desligou a automação. Feche o DevTools e tente de novo."
        : `A automação da janela da aula foi desligada (${reason}).`,
    );
    for (const fns of this.listeners.values()) for (const fn of fns) fn({ __detached: true });
  };

  private readonly onMessage = (
    _event: Electron.Event,
    method: string,
    params: Record<string, unknown>,
  ): void => {
    if (method === "Page.frameNavigated") {
      const frame = params.frame as { id?: unknown } | undefined;
      if (typeof frame?.id === "string") this.worlds.delete(frame.id);
    } else if (method === "Page.frameDetached" && typeof params.frameId === "string")
      this.worlds.delete(params.frameId);
    for (const fn of this.listeners.get(method) ?? []) fn(params);
  };

  /** A protocol event; the listener also hears `{__detached: true}` when the protocol goes away. */
  on(method: string, fn: (params: Record<string, unknown>) => void): () => void {
    let set = this.listeners.get(method);
    if (!set) {
      set = new Set();
      this.listeners.set(method, set);
    }
    set.add(fn);
    return () => set.delete(fn);
  }

  async send<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    if (this.detached) throw this.detached;
    try {
      return await this.wc.debugger.sendCommand(method, params);
    } catch (error) {
      if (this.detached) throw this.detached;
      throw error;
    }
  }

  url(): string {
    return this.wc.isDestroyed() ? "" : this.wc.getURL();
  }

  async emulate(viewport: GuidedViewport): Promise<void> {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: false,
    });
  }

  // ---- input --------------------------------------------------------------------------

  mouse(
    type: "mouseMoved" | "mousePressed" | "mouseReleased" | "mouseWheel",
    p: Point,
    options: {
      button?: "none" | "left" | "right";
      buttons?: number;
      clickCount?: number;
      deltaX?: number;
      deltaY?: number;
    } = {},
  ): Promise<unknown> {
    return this.send("Input.dispatchMouseEvent", {
      type,
      x: p.x,
      y: p.y,
      button: options.button ?? "none",
      buttons: options.buttons ?? 0,
      clickCount: options.clickCount ?? 0,
      modifiers: 0,
      pointerType: "mouse",
      ...(type === "mouseWheel"
        ? { deltaX: options.deltaX ?? 0, deltaY: options.deltaY ?? 0 }
        : {}),
    });
  }

  /** Modifiers go down first and up last, each with the flags held at that point. */
  async chord(chord: Chord): Promise<void> {
    const held: { key: string; code: string; vk: number; bit: number }[] = [];
    if (chord.ctrl) held.push({ key: "Control", code: "ControlLeft", vk: 17, bit: 2 });
    if (chord.alt) held.push({ key: "Alt", code: "AltLeft", vk: 18, bit: 1 });
    if (chord.shift) held.push({ key: "Shift", code: "ShiftLeft", vk: 16, bit: 8 });
    if (chord.meta) held.push({ key: "Meta", code: "MetaLeft", vk: 91, bit: 4 });
    let modifiers = 0;
    for (const m of held) {
      modifiers |= m.bit;
      await this.send("Input.dispatchKeyEvent", {
        type: "rawKeyDown",
        key: m.key,
        code: m.code,
        windowsVirtualKeyCode: m.vk,
        modifiers,
      });
    }
    const main = {
      key: chord.key,
      code: chord.code,
      windowsVirtualKeyCode: chord.vk,
      nativeVirtualKeyCode: chord.vk,
      modifiers,
    };
    await this.send("Input.dispatchKeyEvent", {
      ...main,
      type: chord.text ? "keyDown" : "rawKeyDown",
      ...(chord.text ? { text: chord.text, unmodifiedText: chord.text } : {}),
    });
    await this.send("Input.dispatchKeyEvent", { ...main, type: "keyUp" });
    for (const m of [...held].reverse()) {
      modifiers &= ~m.bit;
      await this.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: m.key,
        code: m.code,
        windowsVirtualKeyCode: m.vk,
        modifiers,
      });
    }
  }

  insertText(text: string): Promise<unknown> {
    return this.send("Input.insertText", { text });
  }

  // ---- the isolated world -------------------------------------------------------------

  private async frames(): Promise<FrameTree> {
    const { frameTree } = await this.send<{ frameTree: FrameTree }>("Page.getFrameTree");
    return frameTree;
  }

  /** The frame a pattern names (the top one without a pattern), or null while it is not there. */
  private async frameFor(pattern: string | undefined): Promise<FrameTree["frame"] | null> {
    const tree = await this.frames();
    if (!pattern) return tree.frame;
    const walk = (node: FrameTree): FrameTree["frame"] | null => {
      for (const child of node.childFrames ?? []) {
        if (urlMatches(pattern, child.frame.url)) return child.frame;
        const deeper = walk(child);
        if (deeper) return deeper;
      }
      return null;
    };
    return walk(tree);
  }

  /** Top-left of a frame's content in page pixels (the top page is at 0, 0). */
  private async frameOffset(frame: FrameTree["frame"]): Promise<Point> {
    if (!frame.parentId) return { x: 0, y: 0 };
    const { backendNodeId } = await this.send<{ backendNodeId: number }>("DOM.getFrameOwner", {
      frameId: frame.id,
    });
    const { model } = await this.send<{ model: { content: number[] } }>("DOM.getBoxModel", {
      backendNodeId,
    });
    return { x: model.content[0] ?? 0, y: model.content[1] ?? 0 };
  }

  private async world(frameId: string): Promise<number> {
    const known = this.worlds.get(frameId);
    if (known !== undefined) return known;
    const { executionContextId } = await this.send<{ executionContextId: number }>(
      "Page.createIsolatedWorld",
      { frameId, worldName: WORLD, grantUniveralAccess: false },
    );
    const done = await this.send<EvaluateResult>("Runtime.evaluate", {
      expression: LOCATOR_PAGE_SCRIPT,
      contextId: executionContextId,
      returnByValue: true,
    });
    if (done.exceptionDetails) throw new Error("Não consegui ler a página da aula.");
    this.worlds.set(frameId, executionContextId);
    return executionContextId;
  }

  /** Runs an expression in the isolated world of a frame; a world lost to a navigation is made again. */
  private async evaluate(frameId: string, expression: string): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      const contextId = await this.world(frameId);
      try {
        const r = await this.send<EvaluateResult>("Runtime.evaluate", {
          expression,
          contextId,
          returnByValue: true,
        });
        if (r.exceptionDetails)
          throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
        return r.result.value;
      } catch (error) {
        if (attempt === 0 && /context/i.test(String(error))) {
          this.worlds.delete(frameId);
          continue;
        }
        throw error;
      }
    }
  }

  private async call(
    objectId: string,
    declaration: string,
    args: unknown[],
    byValue = true,
  ): Promise<RemoteObject> {
    const r = await this.send<EvaluateResult>("Runtime.callFunctionOn", {
      objectId,
      functionDeclaration: declaration,
      arguments: args.map((value) => ({ value })),
      returnByValue: byValue,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result;
  }

  private release(objectId: string | undefined): void {
    if (objectId) void this.send("Runtime.releaseObject", { objectId }).catch(() => undefined);
  }

  /** Candidates of a role strategy, from the Accessibility domain's role and name. */
  private async byRole(
    frameId: string,
    locator: Locator,
    role: string,
    name: string,
  ): Promise<Candidate[]> {
    const contextId = await this.world(frameId);
    const doc = await this.send<EvaluateResult>("Runtime.evaluate", {
      expression: "document",
      contextId,
    });
    const root = doc.result.objectId;
    if (!root) return [];
    try {
      const { nodes } = await this.send<{ nodes: AXNode[] }>("Accessibility.queryAXTree", {
        objectId: root,
        accessibleName: name,
        role,
      });
      const found: Candidate[] = [];
      for (const node of nodes.slice(0, 20)) {
        if (node.ignored || !node.backendDOMNodeId) continue;
        const { object } = await this.send<{ object: RemoteObject }>("DOM.resolveNode", {
          backendNodeId: node.backendDOMNodeId,
          executionContextId: contextId,
        });
        if (!object.objectId) continue;
        try {
          const facts = await this.call(
            object.objectId,
            "function(p, w) { return globalThis.__ediaulaGuided.factsIn(this, p, w); }",
            [locator.point, locator.within ?? null],
          );
          const parsed = candidateSchema.safeParse(facts.value);
          if (parsed.success) found.push(parsed.data);
        } finally {
          this.release(object.objectId);
        }
      }
      return found;
    } finally {
      this.release(root);
    }
  }

  /** What the page has for a locator now. */
  async facts(locator: Locator): Promise<PageFacts> {
    if (locator.url && !urlMatches(locator.url, this.url()))
      return { ready: false, message: "A página desta etapa ainda não abriu." };
    const frame = await this.frameFor(locator.frame);
    if (!frame) return { ready: false, message: "O quadro da página desta etapa ainda não abriu." };
    const report = reportSchema.parse(
      await this.evaluate(
        frame.id,
        `globalThis.__ediaulaGuided.locate(${JSON.stringify(locator)})`,
      ),
    );
    const matches: StrategyMatches[] = [...report.matches];
    for (const [index, s] of locator.strategies.entries())
      if (s.by === "role" && report.scoped)
        matches.push({
          strategy: index,
          candidates: await this.byRole(frame.id, locator, s.role, s.name),
        });
    let blocks: BlocklyBlock[] | null = null;
    let canvas: BlocklyCanvas | null = null;
    if (report.blockly) {
      blocks = blocklyBlocks(report.blockly);
      canvas = blocklyCanvas(report.blockly);
      for (const [index, s] of locator.strategies.entries()) {
        if (s.by !== "blockly") continue;
        const found = blocklyMatches(blocks, s);
        const hits = found.length
          ? z
              .array(z.string().nullable())
              .parse(
                await this.evaluate(
                  frame.id,
                  `globalThis.__ediaulaGuided.hits(${JSON.stringify(found.map((b) => b.grab))})`,
                ),
              )
          : [];
        matches.push({ strategy: index, candidates: blocklyCandidates(found, hits, report.view) });
      }
    }
    return {
      ready: true,
      matches,
      view: report.view,
      blocks,
      canvas,
      offset: await this.frameOffset(frame),
    };
  }

  /** The element a locator names now, and where to act on it in page pixels. */
  async find(locator: Locator): Promise<Found> {
    const facts = await this.facts(locator);
    if (!facts.ready) return { ok: false, message: facts.message, navigating: true };
    const ranked = rankCandidates(locator, facts.matches, facts.view);
    if (!ranked.ok)
      return { ok: false, message: locateMessage(locator, ranked.problem), navigating: false };
    const p = actionPoint(locator, ranked.candidate);
    const key = ranked.candidate.key;
    return {
      ok: true,
      point: { x: p.x + facts.offset.x, y: p.y + facts.offset.y },
      candidate: ranked.candidate,
      ...(key ? { block: facts.blocks?.find((b) => b.key === key) } : {}),
      canvas: facts.canvas,
    };
  }

  async check(condition: GuidedCondition): Promise<boolean> {
    const facts = await this.facts(condition.locator);
    if (!facts.ready) return condition.state === "hidden";
    return conditionMet(condition.state, facts.matches);
  }

  async blocklyCanvas(): Promise<BlocklyCanvas | null> {
    const frame = await this.frameFor(undefined);
    if (!frame) return null;
    const tree = z
      .array(blocklyNodeSchema)
      .parse(await this.evaluate(frame.id, "globalThis.__ediaulaGuided.blockly()"));
    return blocklyCanvas(tree);
  }

  async cursorAt(p: Point): Promise<{ cursor: string; editable: boolean }> {
    const frame = await this.frameFor(undefined);
    if (!frame) return { cursor: "default", editable: false };
    return cursorSchema.parse(
      await this.evaluate(frame.id, `globalThis.__ediaulaGuided.cursorAt(${p.x}, ${p.y})`),
    );
  }

  /** A small picture of the page as it is, for the list of broken steps. */
  async screenshot(view: ViewSize, scale = 0.3): Promise<string> {
    const { data } = await this.send<{ data: string }>("Page.captureScreenshot", {
      format: "jpeg",
      quality: 55,
      clip: { x: 0, y: 0, width: view.width, height: view.height, scale },
    });
    return `data:image/jpeg;base64,${data}`;
  }

  // ---- marking --------------------------------------------------------------------------

  async inspect(on: boolean): Promise<void> {
    if (on) await this.send("Overlay.enable");
    await this.send("Overlay.setInspectMode", {
      mode: on ? "searchForNode" : "none",
      highlightConfig: {
        showInfo: true,
        showAccessibilityInfo: true,
        contentColor: { r: 197, g: 242, b: 59, a: 0.22 },
        borderColor: { r: 140, g: 190, b: 20, a: 0.95 },
      },
    });
  }

  /** The node the inspect mode handed over, described in its own frame. */
  async mark(backendNodeId: number, page: Point): Promise<MarkedElement> {
    const url = this.url();
    const tree = await this.frames();
    const all: FrameTree["frame"][] = [];
    const walk = (node: FrameTree): void => {
      all.push(node.frame);
      for (const child of node.childFrames ?? []) walk(child);
    };
    walk(tree);
    for (const frame of all) {
      const contextId = await this.world(frame.id);
      let objectId: string | undefined;
      try {
        const { object } = await this.send<{ object: RemoteObject }>("DOM.resolveNode", {
          backendNodeId,
          executionContextId: contextId,
        });
        objectId = object.objectId;
      } catch {
        continue;
      }
      if (!objectId) continue;
      const offset = await this.frameOffset(frame);
      const local = { x: page.x - offset.x, y: page.y - offset.y };
      const promoted = await this.call(
        objectId,
        "function() { return globalThis.__ediaulaGuided.promote(this); }",
        [],
        false,
      );
      this.release(objectId);
      if (!promoted.objectId) return { page, url, problem: "Não consegui ler esse elemento." };
      try {
        const raw = describeSchema.parse(
          (
            await this.call(
              promoted.objectId,
              "function(p) { return globalThis.__ediaulaGuided.describe(this, p); }",
              [local],
            )
          ).value,
        );
        const { node } = await this.send<{ node: { backendNodeId: number } }>("DOM.describeNode", {
          objectId: promoted.objectId,
        });
        const ax = await this.send<{ nodes: AXNode[] }>("Accessibility.getPartialAXTree", {
          backendNodeId: node.backendNodeId,
          fetchRelatives: false,
        }).catch(() => ({ nodes: [] }));
        const roleValue = ax.nodes[0]?.role?.value;
        const nameValue = ax.nodes[0]?.name?.value;
        const role =
          typeof roleValue === "string" && !AX_IGNORED.has(roleValue) ? roleValue : undefined;
        const name = typeof nameValue === "string" ? nameValue : undefined;
        let blockly: ElementDescription["blockly"];
        let workspace: Point | undefined;
        if (raw.blockly || raw.workspace) {
          const nodes = z
            .array(blocklyNodeSchema)
            .parse(await this.evaluate(frame.id, "globalThis.__ediaulaGuided.blockly()"));
          if (raw.blockly) {
            const block = blocklyBlocks(nodes).find((b) => b.key === raw.blockly?.key);
            if (block) blockly = { text: block.label || block.text, area: block.area };
          } else {
            const canvas = blocklyCanvas(nodes);
            if (canvas) workspace = pageToWorkspace(canvas, local);
          }
        }
        if (workspace) return { page, url, workspace };
        const description: ElementDescription = {
          tag: raw.tag,
          text: raw.text,
          ...(raw.testid ? { testid: raw.testid } : {}),
          data: raw.data,
          ...(raw.id ? { id: raw.id } : {}),
          ...((role ?? raw.role) ? { role: role ?? raw.role } : {}),
          ...(name ? { name } : {}),
          ...(raw.label ? { label: raw.label } : {}),
          ...(raw.css ? { css: raw.css } : {}),
          ...(raw.path ? { path: raw.path } : {}),
          ...(blockly ? { blockly } : {}),
          kind: raw.kind,
          rect: raw.rect,
          cursor: raw.cursor,
          view: raw.view,
          url: frame.parentId ? url : raw.url,
          ...(frame.parentId ? { frameUrl: raw.url } : {}),
          point: raw.point,
        };
        try {
          return { page, url, locator: buildLocator(description) };
        } catch (error) {
          return { page, url, problem: error instanceof Error ? error.message : String(error) };
        }
      } finally {
        this.release(promoted.objectId);
      }
    }
    return { page, url, problem: "Esse elemento não está mais na página. Marque de novo." };
  }
}

const sleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error(STOPPED));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", stop);
      resolve();
    }, ms);
    const stop = (): void => {
      clearTimeout(timer);
      reject(new Error(STOPPED));
    };
    signal.addEventListener("abort", stop, { once: true });
  });

const STATE_TEXT = { visible: "visível", hidden: "oculto", enabled: "habilitado" } as const;

/**
 * The runner's driver in the lesson window. With a clock, every movement is one pointer event
 * per frame of the video and goes to the log; without one (preparing a take that starts later,
 * verifying a plan) movements are immediate and nothing is logged.
 */
export class WebDriver implements GuidedDriver {
  readonly space = "page";
  pointer: Point;
  private readonly cdp: CdpDriver;
  private readonly clock: FrameClock | null;
  private readonly signal: AbortSignal;
  private readonly log: ((line: GuidedLogLine) => void) | null;
  private lastShape = "";
  /** The button press of a drag, until its release. */
  private pressing: Promise<unknown> | null = null;

  constructor(
    cdp: CdpDriver,
    options: {
      viewport: GuidedViewport;
      signal: AbortSignal;
      clock?: FrameClock;
      log?: (line: GuidedLogLine) => void;
    },
  ) {
    this.cdp = cdp;
    this.clock = options.clock ?? null;
    this.signal = options.signal;
    this.log = options.clock ? (options.log ?? null) : null;
    this.pointer = {
      x: Math.round(options.viewport.width / 2),
      y: Math.round(options.viewport.height / 2),
    };
  }

  private now(): number {
    return this.clock?.time() ?? 0;
  }

  /** The pointer at its starting place, before the first frame. */
  async place(p: Point = this.pointer): Promise<void> {
    this.pointer = p;
    await this.cdp.mouse("mouseMoved", p);
    this.log?.({ k: "move", t: this.now(), x: p.x, y: p.y });
  }

  async sample(): Promise<Point> {
    return this.pointer;
  }

  /** Looks the element up until it is there and usable, or `timeout` seconds pass. */
  private async found(locator: Locator, timeout: number) {
    const deadline = Date.now() + timeout * 1000;
    for (;;) {
      if (this.signal.aborted) throw new Error(STOPPED);
      const found = await this.cdp.find(locator);
      if (found.ok) return found;
      if (found.navigating) this.clock?.relabel("navigation");
      if (Date.now() >= deadline)
        throw new Error(
          found.navigating ? `${found.message} Esperei ${timeout} s.` : found.message,
        );
      await sleep(100, this.signal);
    }
  }

  async locate(
    target: GuidedStepTarget,
    _phase: "approach" | "act",
    timeout: number,
  ): Promise<Point> {
    if (!target.locator) throw new Error("Marque o alvo desta etapa na janela da aula.");
    return (await this.found(target.locator, timeout)).point;
  }

  async destination(step: GuidedStepV2, _from: Point, timeout: number): Promise<Point> {
    const to = step.to;
    if (to?.point?.space === "page") return { x: to.point.x, y: to.point.y };
    if (to?.point?.space === "workspace") {
      const deadline = Date.now() + timeout * 1000;
      for (;;) {
        const canvas = await this.cdp.blocklyCanvas();
        if (canvas) return workspaceToPage(canvas, to.point);
        if (Date.now() >= deadline) throw new Error("A área de blocos não está na página.");
        await sleep(100, this.signal);
      }
    }
    const locator = to?.target?.locator;
    if (!locator) throw new Error("Marque onde o arrasto termina.");
    const target = await this.found(locator, timeout);
    const first = locator.strategies[0];
    if (first?.by === "blockly" && first.below && target.block && step.target?.locator) {
      const source = await this.found(step.target.locator, timeout);
      if (source.block) return blocklyDropBelow(source.block, target.block);
    }
    // Dropped on the element itself (a box, a slot), where it would be clicked.
    return target.point;
  }

  /** Where the pointer rests now: its shape goes to the log at second `at`. */
  private noteShape(p: Point, at: number): void {
    if (!this.log) return;
    void this.cdp.cursorAt(p).then(
      ({ cursor, editable }) => {
        const key = `${cursor}|${editable}`;
        if (key === this.lastShape) return;
        this.lastShape = key;
        this.log?.({ k: "shape", t: at, cursor, ...(editable ? { editable } : {}) });
      },
      () => undefined,
    );
  }

  glide(from: Point, to: Point, duration: number, drag = false): Promise<void> {
    const clock = this.clock;
    const buttons = drag ? { button: "left" as const, buttons: 1 } : {};
    if (!clock || duration <= 0) {
      // Untimed: a drag still needs moves in between for the page to see one.
      const steps = drag ? 8 : 1;
      return (async () => {
        for (let i = 1; i <= steps; i++) {
          const k = i / steps;
          const p = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
          await this.cdp.mouse("mouseMoved", p, buttons);
        }
        this.pointer = to;
        if (this.log) this.log({ k: "move", t: this.now(), x: to.x, y: to.y });
      })();
    }
    const t0 = clock.time();
    this.log?.({
      k: "glide",
      t: t0,
      until: t0 + duration,
      from,
      to,
      ...(drag ? { drag: true as const } : {}),
    });
    return new Promise<void>((resolve, reject) => {
      const stop = (): void => {
        off();
        reject(new Error(STOPPED));
      };
      const off = clock.onFrame((t) => {
        const u = Math.min(1, (t - t0) / duration);
        const k = smoothPointer(u);
        const p = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
        this.pointer = u >= 1 ? to : p;
        this.cdp.mouse("mouseMoved", this.pointer, buttons).catch((error: unknown) => {
          off();
          this.signal.removeEventListener("abort", stop);
          reject(error);
        });
        if (u < 1) return false;
        off();
        this.signal.removeEventListener("abort", stop);
        this.noteShape(to, t);
        resolve();
        return true;
      });
      if (this.signal.aborted) stop();
      else this.signal.addEventListener("abort", stop, { once: true });
    });
  }

  async ready(): Promise<void> {
    if (this.cdp.detachedError) throw this.cdp.detachedError;
  }

  /**
   * Buttons are logged at the second they go out, not when the page acknowledges them: the
   * protocol keeps the events in order, and a busy page must not stretch a click or a drag.
   */
  async click(p: Point, button: PointerButton, count: 1 | 2): Promise<void> {
    const pressed = button === "left" ? 1 : 2;
    const b = button === "left" ? 0 : 1;
    const at = this.now();
    const sent: Promise<unknown>[] = [];
    for (let i = 1; i <= count; i++) {
      sent.push(this.cdp.mouse("mousePressed", p, { button, buttons: pressed, clickCount: i }));
      sent.push(this.cdp.mouse("mouseReleased", p, { button, buttons: 0, clickCount: i }));
      this.log?.({ k: "down", t: at, x: p.x, y: p.y, b });
      this.log?.({ k: "up", t: at, x: p.x, y: p.y, b });
    }
    await Promise.all(sent);
    this.noteShape(p, this.now());
  }

  /** The button goes down and the drag's movement may start on the same frame. */
  async press(p: Point): Promise<void> {
    this.log?.({ k: "down", t: this.now(), x: p.x, y: p.y, b: 0 });
    const sent = this.cdp.mouse("mousePressed", p, { button: "left", buttons: 1, clickCount: 1 });
    // Its answer is awaited by release(); a failure is not left unhandled meanwhile.
    sent.catch(() => undefined);
    this.pressing = sent;
  }

  async release(p: Point): Promise<void> {
    const at = this.now();
    const pressed = this.pressing;
    this.pressing = null;
    await pressed;
    await this.cdp.mouse("mouseReleased", p, { button: "left", buttons: 0, clickCount: 1 });
    this.log?.({ k: "up", t: at, x: p.x, y: p.y, b: 0 });
    this.noteShape(p, this.now());
  }

  async wheel(p: Point, dx: number, dy: number): Promise<void> {
    const at = this.now();
    await this.cdp.mouse("mouseWheel", p, { deltaX: dx, deltaY: dy });
    this.log?.({ k: "wheel", t: at, x: p.x, y: p.y, dx, dy });
  }

  async key(chord: Chord): Promise<void> {
    const at = this.now();
    await this.cdp.chord(chord);
    this.log?.({ k: "key", t: at, label: chord.label });
  }

  async text(char: string): Promise<void> {
    await this.cdp.insertText(char);
  }

  check(condition: GuidedCondition): Promise<boolean> {
    return this.cdp.check(condition);
  }

  async until(condition: GuidedCondition, timeout: number): Promise<void> {
    const deadline = Date.now() + timeout * 1000;
    while (!(await this.cdp.check(condition))) {
      if (Date.now() >= deadline)
        throw new Error(
          `Esperei ${timeout} s e “${locatorLabel(condition.locator)}” não ficou ${STATE_TEXT[condition.state]}.`,
        );
      await sleep(100, this.signal);
    }
  }
}
