import type { WebContents } from "electron";
import { z } from "zod";
import type { FrameClock } from "../shared/frameClock.ts";
import type { GuidedLogLine } from "../shared/guidedCursor.ts";
import {
  type Chord,
  type GuidedCondition,
  type GuidedStepTarget,
  type GuidedStepV2,
  type GuidedViewport,
  parseChord,
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
  | {
      ready: false;
      message: string;
      /** The page is still loading: anything can still change. */
      loading: boolean;
    };

export type Found =
  | {
      ok: true;
      point: Point;
      candidate: Candidate;
      block?: BlocklyBlock;
      canvas: BlocklyCanvas | null;
    }
  | { ok: false; message: string; navigating: boolean };

/** The page took longer than this to answer a command: it counts as busy, not broken. */
const SEND_TIMEOUT = 10000;

/** A command the page did not answer in time (it is loading, or a script holds it). */
export class CdpTimeout extends Error {
  constructor(method: string) {
    super(`A página da aula não respondeu a tempo (${method}).`);
    this.name = "CdpTimeout";
  }
}

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
  /** Something the teacher should know about the mark (a frame of another site). */
  notice?: string;
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
  /** A confirmation the page asked for and the app refused, until a step reports it. */
  private dialog: string | null = null;

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
          "Não consegui controlar a janela da aula. Feche as ferramentas de desenvolvedor dela e tente de novo.",
          { cause },
        );
      }
    this.attached = true;
    debug.on("detach", this.onDetach);
    debug.on("message", this.onMessage);
    await this.send("Page.enable");
    await this.send("DOM.enable");
  }

  /**
   * A box the page opened (alert, confirm, prompt, leaving the page) stops its scripts until it
   * is answered. A message or leaving is accepted; a question is refused and the step says so:
   * a guided take cannot show it, and choosing for the teacher would be a guess.
   */
  private answerDialog(params: Record<string, unknown>): void {
    const type = typeof params.type === "string" ? params.type : "";
    const message = typeof params.message === "string" ? params.message.slice(0, 200) : "";
    const accept = type === "alert" || type === "beforeunload";
    if (!accept)
      this.dialog = `A página abriu uma pergunta (“${message}”) e o EdiAula a recusou. No modo guiado, use um caminho sem caixas de confirmação.`;
    void this.send("Page.handleJavaScriptDialog", { accept }).catch((cause: unknown) => {
      // The box stays open and the page waits on it: the next step says so.
      this.dialog ??= `A página abriu uma caixa (“${message}”) e não consegui respondê-la (${cause instanceof Error ? cause.message : String(cause)}).`;
    });
  }

  /** The question the page asked since the last call, if any. */
  takeDialog(): string | null {
    const dialog = this.dialog;
    this.dialog = null;
    return dialog;
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
        ? "As ferramentas de desenvolvedor foram abertas na janela da aula e desligaram a automação. Feche-as e tente de novo."
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
    else if (method === "Page.javascriptDialogOpening") this.answerDialog(params);
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

  /** A command, given up after `timeout` ms (CdpTimeout): a page that hangs never hangs a step. */
  async send<T = unknown>(
    method: string,
    params?: Record<string, unknown>,
    timeout = SEND_TIMEOUT,
  ): Promise<T> {
    if (this.detached) throw this.detached;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.wc.debugger.sendCommand(method, params),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new CdpTimeout(method)), timeout);
        }),
      ]);
    } catch (error) {
      if (this.detached) throw this.detached;
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  url(): string {
    return this.wc.isDestroyed() ? "" : this.wc.getURL();
  }

  /** A navigation is under way: the next page has not answered yet. */
  loading(): boolean {
    return !this.wc.isDestroyed() && this.wc.isWaitingForResponse();
  }

  /**
   * The page laid out at the plan's viewport inside a window of another size, scaled to fit:
   * marking sees the same layout the take will. Returns the scale (window pixels per page pixel).
   */
  async emulateToFit(viewport: GuidedViewport, content: { width: number; height: number }) {
    const scale = Math.min(1, content.width / viewport.width, content.height / viewport.height);
    await this.send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 0,
      mobile: false,
      scale,
    });
    return scale;
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

  /** One typed character: the key down with its text, then up (code and vk when a key has it). */
  async typed(char: string, code = "", vk = 0, modifiers = 0): Promise<void> {
    const key = { key: char, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
    await this.send("Input.dispatchKeyEvent", {
      ...key,
      type: "keyDown",
      text: char,
      unmodifiedText: char,
    });
    await this.send("Input.dispatchKeyEvent", { ...key, type: "keyUp" });
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
    // An object of a page that navigated away is gone already: nothing to release.
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
      return {
        ready: false,
        message: "A página desta etapa ainda não abriu.",
        loading: this.loading(),
      };
    const frame = await this.frameFor(locator.frame);
    if (!frame)
      return {
        ready: false,
        message: "O quadro da página desta etapa ainda não abriu.",
        loading: this.loading(),
      };
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
    const ranked = rankCandidates(locator, facts.matches, facts.view, facts.canvas);
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

  /**
   * The condition holds now. While a navigation is under way nothing holds yet (not even
   * "hidden": the old page is still there); once another page came, the element is indeed hidden.
   */
  async check(condition: GuidedCondition): Promise<boolean> {
    const facts = await this.facts(condition.locator);
    if (!facts.ready) return !facts.loading && condition.state === "hidden";
    if (condition.state === "hidden" && this.loading()) return false;
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

  /**
   * The node the inspect mode handed over, described in its own frame: the frames are tried from
   * the innermost out, and a frame's world only takes a node of its own document (an element of a
   * same-site frame would otherwise be read in the page around it). Among equal matches the
   * marked one is remembered by its order (`nth`) and, for a block, by its place in the workspace.
   */
  async mark(backendNodeId: number, page: Point): Promise<MarkedElement> {
    const url = this.url();
    const tree = await this.frames();
    const all: FrameTree["frame"][] = [];
    const walk = (node: FrameTree): void => {
      all.push(node.frame);
      for (const child of node.childFrames ?? []) walk(child);
    };
    walk(tree);
    for (const frame of all.reverse()) {
      const contextId = await this.world(frame.id);
      let objectId: string | undefined;
      try {
        const { object } = await this.send<{ object: RemoteObject }>("DOM.resolveNode", {
          backendNodeId,
          executionContextId: contextId,
        });
        objectId = object.objectId;
      } catch {
        // A node of another frame's document does not resolve in this one's world.
        continue;
      }
      if (!objectId) continue;
      const own = await this.call(
        objectId,
        "function() { return globalThis.__ediaulaGuided.own(this); }",
        [],
      );
      if (own.value !== true) {
        this.release(objectId);
        continue;
      }
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
        return await this.describeMarked(frame, promoted.objectId, local, page, url);
      } finally {
        this.release(promoted.objectId);
      }
    }
    return { page, url, problem: "Esse elemento não está mais na página. Marque de novo." };
  }

  private async describeMarked(
    frame: FrameTree["frame"],
    objectId: string,
    local: Point,
    page: Point,
    url: string,
  ): Promise<MarkedElement> {
    const raw = describeSchema.parse(
      (
        await this.call(
          objectId,
          "function(p) { return globalThis.__ediaulaGuided.describe(this, p); }",
          [local],
        )
      ).value,
    );
    const { node } = await this.send<{ node: { backendNodeId: number } }>("DOM.describeNode", {
      objectId,
    });
    // Without the accessibility tree the role comes from the element's own attributes.
    const ax = await this.send<{ nodes: AXNode[] }>("Accessibility.getPartialAXTree", {
      backendNodeId: node.backendNodeId,
      fetchRelatives: false,
    }).catch(() => ({ nodes: [] }));
    const roleValue = ax.nodes[0]?.role?.value;
    const nameValue = ax.nodes[0]?.name?.value;
    const role =
      typeof roleValue === "string" && !AX_IGNORED.has(roleValue) ? roleValue : undefined;
    const name = typeof nameValue === "string" ? nameValue.slice(0, 200) : undefined;
    let blockly: ElementDescription["blockly"];
    let place: Point | undefined;
    let blockKey: string | undefined;
    if (raw.blockly || raw.workspace) {
      const nodes = z
        .array(blocklyNodeSchema)
        .parse(await this.evaluate(frame.id, "globalThis.__ediaulaGuided.blockly()"));
      const canvas = blocklyCanvas(nodes);
      if (raw.blockly) {
        const block = blocklyBlocks(nodes).find((b) => b.key === raw.blockly?.key);
        if (block) {
          blockly = { text: block.label || block.text, area: block.area };
          blockKey = block.key;
          if (canvas && block.area === "workspace")
            place = pageToWorkspace(canvas, {
              x: block.rect.x + block.rect.width / 2,
              y: block.rect.y + block.rect.height / 2,
            });
        }
      } else if (canvas) return { page, url, workspace: pageToWorkspace(canvas, local) };
    }
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
      ...(place ? { workspace: place } : {}),
      kind: raw.kind,
      rect: raw.rect,
      cursor: raw.cursor,
      view: raw.view,
      url: frame.parentId ? url : raw.url,
      ...(frame.parentId ? { frameUrl: raw.url } : {}),
      point: raw.point,
    };
    let locator: Locator;
    try {
      locator = buildLocator(description);
    } catch (error) {
      return { page, url, problem: error instanceof Error ? error.message : String(error) };
    }
    // Equal matches now: which of them it is, in their order. Without an answer the nearest to
    // the marked rectangle still tells them apart.
    const facts = await this.facts(locator).catch(() => null);
    if (facts?.ready)
      for (const m of [...facts.matches].sort((a, b) => a.strategy - b.strategy)) {
        const usable = m.candidates.filter((c) => c.visible && c.inView && c.enabled && !c.covered);
        if (!usable.length) continue;
        if (usable.length > 1) {
          const index = usable.findIndex((c) =>
            blockKey
              ? c.key === blockKey
              : Math.abs(c.rect.x - raw.rect.x) < 1.5 &&
                Math.abs(c.rect.y - raw.rect.y) < 1.5 &&
                Math.abs(c.rect.width - raw.rect.width) < 1.5,
          );
          if (index >= 0) locator.nth = index;
        }
        break;
      }
    return {
      page,
      url,
      locator,
      ...(raw.kind === "frame"
        ? {
            notice:
              "Isto é um quadro de outro site dentro da página. O EdiAula vai agir no mesmo ponto dele, sem reconhecer os elementos de dentro.",
          }
        : {}),
    };
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

/** Seconds a click holds the button, and between the two clicks of a double click. */
export const CLICK_HOLD = 0.08;
export const DOUBLE_GAP = 0.08;

/**
 * The runner's driver in the lesson window. With a clock, every movement is one pointer event
 * per frame of the video and goes to the log; without one (preparing a take that starts later,
 * verifying a plan) movements are immediate and nothing is logged.
 *
 * A lookup that fails for a moment (the page busy or between two documents, a command that took
 * too long) counts as "not yet" until the step's deadline; only the protocol going away, a
 * question the page asked or the run being stopped end it at once. Time the take spends paused
 * does not count against a deadline.
 */
export class WebDriver implements GuidedDriver {
  readonly space = "page";
  pointer: Point;
  private readonly cdp: CdpDriver;
  private readonly clock: FrameClock | null;
  private readonly signal: AbortSignal;
  private readonly log: ((line: GuidedLogLine) => void) | null;
  private readonly paintAfter: (() => Promise<void>) | null;
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
      /** Resolves at the page's next picture (or a little later when it does not change). */
      paintAfter?: () => Promise<void>;
    },
  ) {
    this.cdp = cdp;
    this.clock = options.clock ?? null;
    this.signal = options.signal;
    this.log = options.clock ? (options.log ?? null) : null;
    this.paintAfter = options.paintAfter ?? null;
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

  /** Seconds left before `timeout` runs out, not counting the time the take spent paused. */
  private deadline(timeout: number): () => boolean {
    const start = Date.now();
    const paused = this.clock?.pausedTotal() ?? 0;
    return () => Date.now() - start - ((this.clock?.pausedTotal() ?? 0) - paused) >= timeout * 1000;
  }

  /** What ends a step at once; anything else is the page not being ready yet. */
  private fatal(error: unknown): boolean {
    return (
      this.signal.aborted ||
      (error instanceof Error && (error === this.cdp.detachedError || error.message === STOPPED))
    );
  }

  private question(): void {
    const dialog = this.cdp.takeDialog();
    if (dialog) throw new Error(dialog);
  }

  /** Looks the element up until it is there and usable, or `timeout` seconds pass. */
  private async found(locator: Locator, timeout: number) {
    const over = this.deadline(timeout);
    for (;;) {
      if (this.signal.aborted) throw new Error(STOPPED);
      this.question();
      let message: string;
      let navigating = false;
      try {
        const found = await this.cdp.find(locator);
        if (found.ok) return found;
        message = found.message;
        navigating = found.navigating;
      } catch (error) {
        if (this.fatal(error)) throw error;
        message = "A página da aula não respondeu a tempo.";
        navigating = true;
      }
      if (navigating) this.clock?.relabel("navigation");
      if (over()) throw new Error(navigating ? `${message} Esperei ${timeout} s.` : message);
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
      const over = this.deadline(timeout);
      for (;;) {
        const canvas = await this.cdp.blocklyCanvas().catch((error: unknown) => {
          if (this.fatal(error)) throw error;
          return null;
        });
        if (canvas) return workspaceToPage(canvas, to.point);
        if (over()) throw new Error("A área de blocos não está na página.");
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
      // The page did not say: the drawn pointer keeps its last shape, and the next lookup finds
      // out whether the page is gone.
      () => undefined,
    );
  }

  /**
   * One pointer event per frame. In a drag the page draws each step a little after the event (it
   * answers it, then paints), and the drawn hand must stay with the block it carries: so each
   * frame sends the position of the next one and the video holds until the page has painted it
   * ("paint"). Every frame then shows the block where the log puts the pointer, however slow the
   * page is; the take only takes longer in wall time.
   */
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
    /** The second of the frame after the one at `t`, as the clock will give it. */
    const next = (t: number): number => (Math.round(t * clock.fps) + 1) / clock.fps;
    const paints = drag ? this.paintAfter : null;
    const at = (t: number): Point => {
      const u = Math.min(1, (t - t0) / duration);
      if (u >= 1) return to;
      const k = smoothPointer(u);
      return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
    };
    this.log?.({ k: "glide", t: t0, until: t0 + duration, from, to, ...(drag ? { drag } : {}) });
    return new Promise<void>((resolve, reject) => {
      let painting = false;
      const settle = (): void => {
        off();
        this.signal.removeEventListener("abort", stop);
        if (painting) clock.resume("paint");
        painting = false;
      };
      const fail = (error: unknown): void => {
        settle();
        reject(error);
      };
      const stop = (): void => fail(new Error(STOPPED));
      const off = clock.onFrame((t) => {
        const u = Math.min(1, (t - t0) / duration);
        this.pointer = at(t);
        if (paints) {
          // This frame shows what the page painted for it; the next position goes out now.
          if (u < 1) {
            painting = true;
            clock.hold("paint");
            this.cdp
              .mouse("mouseMoved", at(next(t)), buttons)
              .then(() => paints())
              .then(() => {
                if (!painting) return;
                painting = false;
                clock.resume("paint");
              }, fail);
          }
        } else this.cdp.mouse("mouseMoved", this.pointer, buttons).catch(fail);
        if (u < 1) return false;
        settle();
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
    this.question();
  }

  /** Holds for `seconds` of the video (nothing when untimed). */
  private async hold(seconds: number): Promise<void> {
    if (this.clock) await this.clock.wait(this.clock.time() + seconds);
  }

  /**
   * Buttons are logged at the second they go out, not when the page acknowledges them: the
   * protocol keeps the events in order. A click holds the button a moment, and the two clicks of
   * a double click are apart, as a hand would make them, so both show on the drawn pointer.
   */
  async click(p: Point, button: PointerButton, count: 1 | 2): Promise<void> {
    const pressed = button === "left" ? 1 : 2;
    const b = button === "left" ? 0 : 1;
    for (let i = 1; i <= count; i++) {
      if (i > 1) await this.hold(DOUBLE_GAP);
      this.log?.({ k: "down", t: this.now(), x: p.x, y: p.y, b });
      const down = this.cdp.mouse("mousePressed", p, { button, buttons: pressed, clickCount: i });
      down.catch(() => undefined);
      await this.hold(CLICK_HOLD);
      this.log?.({ k: "up", t: this.now(), x: p.x, y: p.y, b });
      await down;
      await this.cdp.mouse("mouseReleased", p, { button, buttons: 0, clickCount: i });
    }
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

  /** The button goes up where the drag ended, at the second it goes out. */
  async release(p: Point): Promise<void> {
    const at = this.now();
    const pressed = this.pressing;
    this.pressing = null;
    await pressed;
    await this.cdp.mouse("mouseReleased", p, { button: "left", buttons: 0, clickCount: 1 });
    this.log?.({ k: "up", t: at, x: p.x, y: p.y, b: 0 });
    this.noteShape(p, at);
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

  /** A character typed as a key: down with its text, then up, as the page expects from a keyboard. */
  async text(char: string): Promise<void> {
    if (/^[a-z]$/i.test(char)) {
      const upper = char.toUpperCase();
      // Shift is held for a capital, as on a keyboard.
      await this.cdp.typed(char, `Key${upper}`, upper.charCodeAt(0), char === upper ? 8 : 0);
      return;
    }
    const chord = parseChord(char === " " ? "Space" : char === "\n" ? "Enter" : char);
    if (chord && !chord.ctrl && !chord.alt && !chord.meta && chord.text) {
      await this.cdp.chord(chord);
      return;
    }
    await this.cdp.typed(char);
  }

  async check(condition: GuidedCondition): Promise<boolean> {
    this.question();
    try {
      return await this.cdp.check(condition);
    } catch (error) {
      if (this.fatal(error)) throw error;
      return false;
    }
  }

  async until(condition: GuidedCondition, timeout: number): Promise<void> {
    const over = this.deadline(timeout);
    while (!(await this.check(condition))) {
      if (over())
        throw new Error(
          `Esperei ${timeout} s e “${locatorLabel(condition.locator)}” não ficou ${STATE_TEXT[condition.state]}.`,
        );
      await sleep(100, this.signal);
    }
  }
}
