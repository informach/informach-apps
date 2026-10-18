import { z } from "zod";

/**
 * Finding an element of the lesson page again, as the page is when the step runs (G25). A target
 * is marked once (F8 in the lesson window) and kept as several strategies, from the most stable
 * (a test id, a data attribute, the accessible role and name) to the least (a CSS path). Each is
 * asked in turn; the first that names one element that is visible, enabled and not covered wins,
 * and several equal matches are told apart by the rectangle recorded when it was marked. A CSS
 * path made of `:nth-of-type` is the last resort and never stands alone: it only counts when the
 * element it finds still has the recorded tag and text.
 *
 * Blockly blocks are SVG groups (`g.blocklyDraggable`) found by the text of their own labels, in
 * the flyout, in the workspace or as a toolbox category; a block is grabbed by the left edge of
 * its own path, and dropped below another block or at a point of the workspace, converted through
 * the transform of `.blocklyBlockCanvas` so it survives scrolling and zoom.
 *
 * This module is pure: main/guidedCdp.ts runs locatorPage.ts in an isolated world of the page,
 * which reports facts (candidates, the Blockly SVG as JSON), and the choice is made here.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Point {
  x: number;
  y: number;
}
export interface ViewSize {
  width: number;
  height: number;
}

export const LOCATOR_KINDS = [
  "testid",
  "data",
  "id",
  "role",
  "label",
  "text",
  "blockly",
  "css",
] as const;
export type LocatorKind = (typeof LOCATOR_KINDS)[number];

export const BLOCKLY_AREAS = ["flyout", "workspace", "toolbox"] as const;
export type BlocklyArea = (typeof BLOCKLY_AREAS)[number];

export type LocatorStrategy =
  | { by: "testid"; value: string }
  | { by: "data"; name: string; value: string }
  | { by: "id"; value: string }
  | { by: "role"; role: string; name: string }
  | { by: "label"; value: string }
  | { by: "text"; value: string; tag?: string }
  /** A Blockly block by its label; `below`: as a drag destination, just under that block. */
  | { by: "blockly"; text: string; area: BlocklyArea; below?: boolean }
  | { by: "css"; value: string };

/** What the element was when it was marked: tells equal matches apart and says what changed. */
export interface LocatorFingerprint {
  tag: string;
  text: string;
  /** CSS pixels of the page when it was marked. */
  rect: Rect;
  /** Size of the page's viewport then, to compare rectangles across window sizes. */
  view: ViewSize;
  /** Computed CSS cursor over it (pointer, text, grab...). */
  cursor: string;
}

export interface Locator {
  strategies: LocatorStrategy[];
  /** Address the element belongs to (URLPattern syntax, without query or hash). */
  url?: string;
  /** Address pattern of the frame it lives in, when it is not the top page. */
  frame?: string;
  /** Only elements inside the single one this names. */
  within?: LocatorStrategy;
  /** Which of several equal matches, in document order, when that was the intent. */
  nth?: number;
  /** Where to act inside it, 0..1 of its box: the middle, or the marked spot of a canvas. */
  point: { u: number; v: number };
  fingerprint: LocatorFingerprint;
}

const label = z.string().max(500);
const tagName = z.string().regex(/^[a-z][a-z0-9-]{0,40}$/);
export const locatorStrategySchema = z.discriminatedUnion("by", [
  z.object({ by: z.literal("testid"), value: label.min(1) }),
  z.object({
    by: z.literal("data"),
    name: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
    value: label,
  }),
  z.object({ by: z.literal("id"), value: label.min(1) }),
  z.object({ by: z.literal("role"), role: z.string().regex(/^[A-Za-z]{2,40}$/), name: label }),
  z.object({ by: z.literal("label"), value: label.min(1) }),
  z.object({ by: z.literal("text"), value: label.min(1), tag: tagName.optional() }),
  z.object({
    by: z.literal("blockly"),
    text: label.min(1),
    area: z.enum(BLOCKLY_AREAS),
    below: z.boolean().optional(),
  }),
  z.object({ by: z.literal("css"), value: z.string().min(1).max(2000) }),
]);
const finite = z.number().finite().min(-1e6).max(1e6);
const rectSchema = z.object({
  x: finite,
  y: finite,
  width: finite.nonnegative(),
  height: finite.nonnegative(),
});
const viewSchema = z.object({
  width: z.number().positive().max(16384),
  height: z.number().positive().max(16384),
});
export const locatorSchema = z.object({
  strategies: z.array(locatorStrategySchema).min(1).max(12),
  url: z.string().max(4096).optional(),
  frame: z.string().max(4096).optional(),
  within: locatorStrategySchema.optional(),
  nth: z.int().nonnegative().max(1000).optional(),
  point: z.object({ u: z.number().min(0).max(1), v: z.number().min(0).max(1) }),
  fingerprint: z.object({
    tag: z.string().max(64),
    text: label,
    rect: rectSchema,
    view: viewSchema,
    cursor: z.string().max(64),
  }),
}) satisfies z.ZodType<Locator>;

/** Text as the page shows it: one space between words, trimmed. */
export const normalizeText = (value: string): string =>
  value.normalize("NFC").replace(/\s+/g, " ").trim();
const sameText = (a: string, b: string): boolean =>
  normalizeText(a).toLocaleLowerCase("pt-BR") === normalizeText(b).toLocaleLowerCase("pt-BR");

/** A CSS path that depends on the position among siblings. */
export const isStructural = (css: string): boolean => /:nth-(?:of-type|child)\(/.test(css);

/** Ids and data values that frameworks generate (they change on every load). */
const GENERATED =
  /^\d|\d{4,}|[0-9a-f]{8,}|^[:_]|^(?:ember|react|mui|radix|headlessui|rc-|mat-|ng-|yui|ext-|gwt-|j_id|blockly)/i;
export const stableValue = (value: string): boolean =>
  value.length > 0 && value.length <= 64 && !GENERATED.test(value);
const UNSTABLE_DATA = new Set(["reactid", "id", "index", "key", "uid", "rowindex", "state", "v"]);

/** What the page says about the element the teacher marked (locatorPage.ts, `describe`). */
export interface ElementDescription {
  tag: string;
  text: string;
  /** data-testid and its usual spellings. */
  testid?: string;
  data: { name: string; value: string }[];
  id?: string;
  /** Role and accessible name as Chromium computes them (Accessibility domain). */
  role?: string;
  name?: string;
  /** aria-label, the text of its label, placeholder or title. */
  label?: string;
  /** Tag and stable classes or attributes, unique in the page when it was marked. */
  css?: string;
  /** Structural path (the last resort). */
  path?: string;
  /** Inside a Blockly block or toolbox category: its label and where it is. */
  blockly?: { text: string; area: BlocklyArea };
  kind: "element" | "canvas" | "frame";
  rect: Rect;
  cursor: string;
  view: ViewSize;
  url: string;
  /** Address of the frame, when the element is inside one. */
  frameUrl?: string;
  /** Where the teacher aimed inside it, 0..1. */
  point: { u: number; v: number };
}

/** "http://host:port/path" with the characters URLPattern reads as syntax escaped. */
export function urlPatternOf(href: string): string {
  const url = new URL(href);
  const path = url.pathname.replace(/[:*?+(){}\\]/g, (c) => `\\${c}`);
  return `${url.protocol}//${url.host}${path}`;
}

/** The page is the one the pattern names; query and hash never count. */
export function urlMatches(pattern: string, href: string): boolean {
  try {
    return new URLPattern(pattern).test(href);
  } catch {
    return false;
  }
}

/** The strategies of a marked element, most stable first. Throws when none is reliable. */
export function buildLocator(d: ElementDescription): Locator {
  const strategies: LocatorStrategy[] = [];
  const text = normalizeText(d.text).slice(0, 200);
  if (d.blockly) strategies.push({ by: "blockly", text: d.blockly.text, area: d.blockly.area });
  if (d.testid) strategies.push({ by: "testid", value: d.testid });
  for (const attr of d.data)
    if (!UNSTABLE_DATA.has(attr.name) && !attr.name.startsWith("v-") && stableValue(attr.value))
      if (strategies.filter((s) => s.by === "data").length < 2)
        strategies.push({ by: "data", name: attr.name, value: attr.value });
  if (d.id && stableValue(d.id)) strategies.push({ by: "id", value: d.id });
  if (!d.blockly && d.role && d.name && normalizeText(d.name).length <= 120)
    strategies.push({ by: "role", role: d.role, name: normalizeText(d.name) });
  if (!d.blockly && d.label && !sameText(d.label, d.name ?? ""))
    strategies.push({ by: "label", value: normalizeText(d.label).slice(0, 200) });
  if (!d.blockly && text && text.length <= 80)
    strategies.push({ by: "text", value: text, tag: d.tag });
  if (!d.blockly && d.css && !isStructural(d.css)) strategies.push({ by: "css", value: d.css });
  const reliable = strategies.length > 0;
  if (!d.blockly && d.path) strategies.push({ by: "css", value: d.path });
  if (!reliable)
    throw new Error(
      "Não achei uma forma estável de reencontrar este elemento. Marque um botão, um campo ou um texto.",
    );
  return {
    strategies: strategies.slice(0, 12),
    url: urlPatternOf(d.url),
    ...(d.frameUrl ? { frame: urlPatternOf(d.frameUrl) } : {}),
    point: d.kind === "element" || d.blockly ? { u: 0.5, v: 0.5 } : d.point,
    fingerprint: {
      tag: d.tag,
      text,
      rect: d.rect,
      view: d.view,
      cursor: d.cursor,
    },
  };
}

/** The old guided plans kept a CSS selector and the button's text (shared/guidedRecording.ts). */
export function legacyLocator(browser: {
  selector: string;
  url: string;
  kind: "element" | "canvas" | "frame";
  u: number;
  v: number;
  label: string;
}): Locator {
  const strategies: LocatorStrategy[] = [];
  if (browser.label) strategies.push({ by: "text", value: normalizeText(browser.label) });
  strategies.push({ by: "css", value: browser.selector });
  let url: string | undefined;
  try {
    url = urlPatternOf(browser.url);
  } catch {
    url = undefined;
  }
  return {
    strategies,
    ...(url ? { url } : {}),
    point: { u: browser.u, v: browser.v },
    fingerprint: {
      tag: "",
      text: normalizeText(browser.label),
      rect: { x: 0, y: 0, width: 0, height: 0 },
      view: { width: 1, height: 1 },
      cursor: "",
    },
  };
}

// ---- choosing among candidates ------------------------------------------------------------

/** One element a strategy found, as the page reported it. */
export interface Candidate {
  tag: string;
  text: string;
  rect: Rect;
  visible: boolean;
  enabled: boolean;
  /** The element itself does not get the pointer at its action point. */
  covered: boolean;
  inView: boolean;
  cursor: string;
  /** Blockly block id or category label. */
  key?: string;
  /** Where a Blockly block is grabbed. */
  grab?: Point;
}

export interface StrategyMatches {
  /** Index into Locator.strategies. */
  strategy: number;
  candidates: Candidate[];
}

export const LOCATOR_PROBLEMS = [
  "covered",
  "disabled",
  "offscreen",
  "hidden",
  "ambiguous",
  "absent",
] as const;
export type LocatorProblem = (typeof LOCATOR_PROBLEMS)[number];

export type LocateOutcome =
  | { ok: true; candidate: Candidate; strategy: number; changed: boolean }
  | { ok: false; problem: LocatorProblem };

const center = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

/** The marked rectangle as it would sit in a viewport of this size. */
export function expectedRect(fingerprint: LocatorFingerprint, view: ViewSize): Rect {
  const kx = view.width / fingerprint.view.width;
  const ky = view.height / fingerprint.view.height;
  const r = fingerprint.rect;
  return { x: r.x * kx, y: r.y * ky, width: r.width * kx, height: r.height * ky };
}

/**
 * The element a locator names now: the first strategy that finds a single usable one. Several
 * usable matches go to `nth` when the locator has one, else to the one nearest the marked
 * rectangle when it is clearly nearer than the others; otherwise the strategy is ambiguous and
 * the next one is asked. Without a usable element, the problem closest to one is reported.
 */
export function rankCandidates(
  locator: Locator,
  matches: readonly StrategyMatches[],
  view: ViewSize,
): LocateOutcome {
  const problems = new Set<LocatorProblem>();
  const marked = locator.fingerprint;
  const hasRect = marked.rect.width > 0 && marked.rect.height > 0;
  const expected = center(expectedRect(marked, view));
  const tolerance = Math.max(48, Math.hypot(marked.rect.width, marked.rect.height));
  const ordered = [...matches].sort((a, b) => a.strategy - b.strategy);
  for (const match of ordered) {
    const strategy = locator.strategies[match.strategy];
    if (!strategy) continue;
    let found = match.candidates;
    // A structural path only counts for the element that still looks like the marked one.
    if (strategy.by === "css" && isStructural(strategy.value))
      found = found.filter(
        (c) => (!marked.tag || c.tag === marked.tag) && sameText(c.text, marked.text),
      );
    if (!found.length) {
      problems.add("absent");
      continue;
    }
    const usable = found.filter((c) => c.visible && c.inView && c.enabled && !c.covered);
    if (!usable.length) {
      for (const c of found)
        problems.add(
          !c.visible ? "hidden" : !c.inView ? "offscreen" : !c.enabled ? "disabled" : "covered",
        );
      continue;
    }
    let chosen: Candidate | undefined;
    if (usable.length === 1) chosen = usable[0];
    else if (locator.nth !== undefined) chosen = usable[locator.nth];
    else if (hasRect) {
      const near = usable
        .map((c) => ({
          c,
          d: Math.hypot(center(c.rect).x - expected.x, center(c.rect).y - expected.y),
        }))
        .sort((a, b) => a.d - b.d);
      if (near[0].d <= tolerance && near[1].d >= near[0].d * 2 + 8) chosen = near[0].c;
    }
    if (!chosen) {
      problems.add("ambiguous");
      continue;
    }
    const changed =
      (!!marked.tag && chosen.tag !== marked.tag) ||
      (!!marked.text && !sameText(chosen.text, marked.text));
    return { ok: true, candidate: chosen, strategy: match.strategy, changed };
  }
  for (const problem of LOCATOR_PROBLEMS) if (problems.has(problem)) return { ok: false, problem };
  return { ok: false, problem: "absent" };
}

/** What a locator is called in messages: its marked text, or the first strategy's value. */
export function locatorLabel(locator: Locator): string {
  if (locator.fingerprint.text) return locator.fingerprint.text.slice(0, 60);
  const first = locator.strategies[0];
  if (!first) return "alvo";
  const value =
    first.by === "role"
      ? first.name || first.role
      : first.by === "blockly"
        ? first.text
        : first.by === "data"
          ? first.value
          : first.value;
  return value.slice(0, 60) || locator.fingerprint.tag || "alvo";
}

const PROBLEM_TEXT: Record<LocatorProblem, (name: string) => string> = {
  absent: (name) => `Não encontrei “${name}” na página.`,
  ambiguous: (name) => `Há mais de um “${name}” na página. Marque o alvo de novo para diferenciar.`,
  hidden: (name) => `“${name}” está escondido na página.`,
  disabled: (name) => `“${name}” está desativado.`,
  covered: (name) => `“${name}” está coberto por outro elemento.`,
  offscreen: (name) =>
    `“${name}” está fora da área visível. Adicione uma etapa de rolagem antes desta.`,
};
export const locateMessage = (locator: Locator, problem: LocatorProblem): string =>
  PROBLEM_TEXT[problem](locatorLabel(locator));

/** Where to act on a chosen element: a block's grab point, or the locator's point in its box. */
export function actionPoint(locator: Locator, candidate: Candidate): Point {
  if (candidate.grab) return candidate.grab;
  return {
    x: candidate.rect.x + candidate.rect.width * locator.point.u,
    y: candidate.rect.y + candidate.rect.height * locator.point.v,
  };
}

export const TARGET_STATES = ["visible", "hidden", "enabled"] as const;
export type TargetState = (typeof TARGET_STATES)[number];

/**
 * A wait or an expectation, judged on the most specific strategy that finds anything: "visible"
 * when one of its elements shows, "enabled" when one shows and can be used, "hidden" when none
 * shows (or nothing is found at all).
 */
export function conditionMet(state: TargetState, matches: readonly StrategyMatches[]): boolean {
  const first = [...matches]
    .sort((a, b) => a.strategy - b.strategy)
    .find((m) => m.candidates.length > 0);
  const shown = (first?.candidates ?? []).filter((c) => c.visible && c.inView);
  if (state === "hidden") return shown.length === 0;
  if (state === "visible") return shown.length > 0;
  return shown.some((c) => c.enabled);
}

// ---- Blockly ------------------------------------------------------------------------------

/** The Blockly part of the page as locatorPage.ts serializes it (and as test fixtures keep it). */
export interface BlocklyNode {
  tag: string;
  cls?: string[];
  /** data-id of a block. */
  key?: string;
  /** Text of a <text> or label element. */
  text?: string;
  rect?: Rect;
  /** transform of `.blocklyBlockCanvas` (attribute or style). */
  transform?: string;
  children?: BlocklyNode[];
}

export interface BlocklyBlock {
  key: string;
  /** Its own labels, without the values of its fields. */
  label: string;
  /** Labels and field values. */
  text: string;
  area: BlocklyArea;
  /** Its own path (blocks inside it are not part of it). */
  rect: Rect;
  grab: Point;
  disabled: boolean;
}

const has = (node: BlocklyNode, cls: string): boolean => !!node.cls?.includes(cls);

/** Every block and toolbox category in the serialized tree. */
export function blocklyBlocks(roots: readonly BlocklyNode[]): BlocklyBlock[] {
  const out: BlocklyBlock[] = [];
  const texts = (
    node: BlocklyNode,
    editable: boolean,
    into: { text: string; editable: boolean; rect?: Rect }[],
  ) => {
    for (const child of node.children ?? []) {
      if (has(child, "blocklyDraggable")) continue;
      if (child.tag === "text" && child.text)
        into.push({ text: child.text, editable, ...(child.rect ? { rect: child.rect } : {}) });
      texts(child, editable || has(child, "blocklyEditableText"), into);
    }
  };
  const visit = (node: BlocklyNode, area: BlocklyArea | null): void => {
    let here = area;
    if (node.tag === "svg") here = has(node, "blocklyFlyout") ? "flyout" : "workspace";
    if (has(node, "blocklyToolboxDiv") || has(node, "blocklyToolbox")) here = "toolbox";
    if (here !== "toolbox" && has(node, "blocklyDraggable") && node.key) {
      const path = (node.children ?? []).find((c) => c.tag === "path" && has(c, "blocklyPath"));
      const rect = path?.rect ?? node.rect;
      if (rect && here) {
        const own: { text: string; editable: boolean; rect?: Rect }[] = [];
        texts(node, false, own);
        const firstText = own.find((t) => t.rect)?.rect;
        const row = Math.min(rect.height, 40);
        const y = firstText
          ? Math.min(Math.max(firstText.y + firstText.height / 2, rect.y + 4), rect.y + row - 4)
          : rect.y + Math.min(rect.height / 2, 16);
        out.push({
          key: node.key,
          label: normalizeText(
            own
              .filter((t) => !t.editable)
              .map((t) => t.text)
              .join(" "),
          ),
          text: normalizeText(own.map((t) => t.text).join(" ")),
          area: here,
          rect,
          grab: { x: rect.x + Math.min(8, rect.width / 4), y },
          disabled: has(node, "blocklyDisabled"),
        });
      }
    }
    if (
      here === "toolbox" &&
      (has(node, "blocklyToolboxCategory") || has(node, "blocklyTreeRow"))
    ) {
      const labelNode = findNode(
        node,
        (n) => has(n, "blocklyTreeLabel") || has(n, "blocklyToolboxCategoryLabel"),
      );
      const text = normalizeText(labelNode?.text ?? node.text ?? "");
      if (text && node.rect && !out.some((b) => b.area === "toolbox" && b.label === text))
        out.push({
          key: `toolbox:${text}`,
          label: text,
          text,
          area: "toolbox",
          rect: node.rect,
          grab: center(node.rect),
          disabled: false,
        });
      return;
    }
    for (const child of node.children ?? []) visit(child, here);
  };
  for (const root of roots) visit(root, null);
  return out;
}

function findNode(node: BlocklyNode, test: (n: BlocklyNode) => boolean): BlocklyNode | undefined {
  for (const child of node.children ?? []) {
    if (test(child)) return child;
    const deeper = findNode(child, test);
    if (deeper) return deeper;
  }
  return undefined;
}

/** "translate(10, 20) scale(0.9)" or "translate(10px, 20px) scale(0.9)". */
export function parseTransform(value: string | undefined): { x: number; y: number; scale: number } {
  const translate = /translate\(\s*(-?[\d.]+)(?:px)?\s*[, ]\s*(-?[\d.]+)(?:px)?\s*\)/.exec(
    value ?? "",
  );
  const scale = /scale\(\s*(-?[\d.]+)/.exec(value ?? "");
  return {
    x: translate ? Number(translate[1]) : 0,
    y: translate ? Number(translate[2]) : 0,
    scale: scale ? Number(scale[1]) || 1 : 1,
  };
}

/** The main workspace's origin and scale in page pixels: workspace units to the page and back. */
export interface BlocklyCanvas {
  x: number;
  y: number;
  scale: number;
}

export function blocklyCanvas(roots: readonly BlocklyNode[]): BlocklyCanvas | null {
  for (const root of roots) {
    if (root.tag !== "svg" || has(root, "blocklyFlyout") || !root.rect) continue;
    const canvas = findNode(root, (n) => has(n, "blocklyBlockCanvas"));
    if (!canvas) continue;
    const t = parseTransform(canvas.transform);
    return { x: root.rect.x + t.x, y: root.rect.y + t.y, scale: t.scale };
  }
  return null;
}

export const workspaceToPage = (canvas: BlocklyCanvas, p: Point): Point => ({
  x: canvas.x + p.x * canvas.scale,
  y: canvas.y + p.y * canvas.scale,
});
export const pageToWorkspace = (canvas: BlocklyCanvas, p: Point): Point => ({
  x: (p.x - canvas.x) / canvas.scale,
  y: (p.y - canvas.y) / canvas.scale,
});

/** Blocks a strategy names: by their own labels first, then with the values of their fields. */
export function blocklyMatches(
  blocks: readonly BlocklyBlock[],
  strategy: Extract<LocatorStrategy, { by: "blockly" }>,
): BlocklyBlock[] {
  const inArea = blocks.filter((b) => b.area === strategy.area);
  const byLabel = inArea.filter((b) => sameText(b.label, strategy.text));
  return byLabel.length ? byLabel : inArea.filter((b) => sameText(b.text, strategy.text));
}

/** Blocks as candidates; `hit` is the block id the page has on top at each grab point. */
export function blocklyCandidates(
  blocks: readonly BlocklyBlock[],
  hits: readonly (string | null)[],
  view: ViewSize,
): Candidate[] {
  return blocks.map((b, i) => ({
    tag: "g",
    text: b.text,
    rect: b.rect,
    visible: b.rect.width > 0 && b.rect.height > 0,
    enabled: !b.disabled,
    covered: hits[i] !== b.key,
    inView: b.grab.x >= 0 && b.grab.y >= 0 && b.grab.x < view.width && b.grab.y < view.height,
    cursor: "",
    key: b.key,
    grab: b.grab,
  }));
}

/**
 * Where the grab point of `dragged` goes for it to snap under `target`: its top-left corner at
 * the bottom-left of the target's own path (Blockly connects within a snap radius of that).
 */
export function blocklyDropBelow(dragged: BlocklyBlock, target: BlocklyBlock): Point {
  return {
    x: target.rect.x + (dragged.grab.x - dragged.rect.x),
    y: target.rect.y + target.rect.height + (dragged.grab.y - dragged.rect.y),
  };
}
