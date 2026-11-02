import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  CURSOR_AT_SOURCE,
  cursorAtExpression,
  LOCATOR_PAGE_SCRIPT,
} from "../src/shared/locatorPage.ts";
import {
  actionPoint,
  type BlocklyNode,
  blocklyBlocks,
  blocklyCandidates,
  blocklyCanvas,
  blocklyDropBelow,
  blocklyMatches,
  buildLocator,
  type Candidate,
  conditionMet,
  cursorKeyword,
  type ElementDescription,
  type Locator,
  locateMessage,
  locatorSchema,
  pageToWorkspace,
  parseTransform,
  pointingSpot,
  rankCandidates,
  revealOf,
  urlMatches,
  urlPatternOf,
  workspaceToPage,
} from "../src/shared/locators.ts";

/** The Blockly part of a page as the isolated-world script serializes it. */
const tree: BlocklyNode[] = JSON.parse(
  readFileSync(new URL("./fixtures/blockly-svg.json", import.meta.url), "utf8"),
);
const view = { width: 1280, height: 720 };

const candidate = (patch: Partial<Candidate> = {}): Candidate => ({
  tag: "button",
  text: "Próxima",
  rect: { x: 100, y: 100, width: 80, height: 30 },
  visible: true,
  enabled: true,
  covered: false,
  inView: true,
  cursor: "pointer",
  ...patch,
});

const describe = (patch: Partial<ElementDescription> = {}): ElementDescription => ({
  tag: "button",
  text: "  Próxima\n parte ",
  data: [],
  kind: "element",
  rect: { x: 100, y: 100, width: 80, height: 30 },
  cursor: "pointer",
  view,
  url: "https://plataforma.example/curso/aula:3?aluno=7#topo",
  point: { u: 0.2, v: 0.9 },
  ...patch,
});

test("blocks are read from the serialized SVG: own labels, fields, areas and grab points", () => {
  const blocks = blocklyBlocks(tree);
  const byKey = new Map(blocks.map((b) => [b.key, b]));
  const hat = byKey.get("hat-1");
  const move = byKey.get("move-1");
  assert.ok(hat && move);
  // The nested block's texts belong to the nested block, not to its parent.
  assert.equal(hat.label, "quando clicar em");
  assert.equal(hat.area, "workspace");
  assert.equal(move.label, "mover passos");
  assert.equal(move.text, "mover 10 passos");
  // Grabbed at the left edge of its own path, on the row of its first label.
  assert.deepEqual(move.grab, { x: 248, y: 98 });
  assert.ok(move.grab.x - move.rect.x <= 8);
  assert.equal(byKey.get("flyout-move")?.area, "flyout");
  assert.equal(byKey.get("flyout-turn")?.disabled, true);
  const categories = blocks.filter((b) => b.area === "toolbox").map((b) => b.label);
  assert.deepEqual(categories, ["Movimento", "Aparência"]);
});

test("a block is found by its label in its area; field values only break ties of the text", () => {
  const blocks = blocklyBlocks(tree);
  assert.deepEqual(
    blocklyMatches(blocks, { by: "blockly", text: "Mover passos", area: "workspace" }).map(
      (b) => b.key,
    ),
    ["move-1", "move-2"],
  );
  assert.deepEqual(
    blocklyMatches(blocks, { by: "blockly", text: "mover passos", area: "flyout" }).map(
      (b) => b.key,
    ),
    ["flyout-move"],
  );
  assert.deepEqual(
    blocklyMatches(blocks, { by: "blockly", text: "mover 25 passos", area: "workspace" }).map(
      (b) => b.key,
    ),
    ["move-2"],
  );
  assert.deepEqual(
    blocklyMatches(blocks, { by: "blockly", text: "Movimento", area: "toolbox" }).map(
      (b) => b.label,
    ),
    ["Movimento"],
  );
});

test("equal blocks are told apart by the marked rectangle, then a covered block is refused", () => {
  const blocks = blocklyBlocks(tree);
  const strategy = { by: "blockly" as const, text: "mover passos", area: "workspace" as const };
  const found = blocklyMatches(blocks, strategy);
  const locator: Locator = {
    strategies: [strategy],
    point: { u: 0.5, v: 0.5 },
    fingerprint: {
      tag: "g",
      text: "mover 25 passos",
      rect: { x: 600, y: 400, width: 150, height: 40 },
      view,
      cursor: "",
    },
  };
  const hits = found.map((b) => b.key);
  const ranked = rankCandidates(
    locator,
    [{ strategy: 0, candidates: blocklyCandidates(found, hits, view) }],
    view,
  );
  assert.ok(ranked.ok);
  assert.equal(ranked.candidate.key, "move-2");
  assert.deepEqual(actionPoint(locator, ranked.candidate), found[1].grab);
  // Another block on top of its grab point: not usable.
  const covered = rankCandidates(
    locator,
    [{ strategy: 0, candidates: blocklyCandidates(found, ["move-1", "hat-1"], view) }],
    view,
  );
  assert.ok(covered.ok);
  assert.equal(covered.candidate.key, "move-1");
  const none = rankCandidates(
    locator,
    [{ strategy: 0, candidates: blocklyCandidates(found, [null, null], view) }],
    view,
  );
  assert.deepEqual(none, { ok: false, problem: "covered" });
  // A disabled block in the flyout cannot be dragged.
  const turn = blocks.filter((b) => b.key === "flyout-turn");
  assert.deepEqual(
    rankCandidates(
      { ...locator, strategies: [{ by: "blockly", text: "girar 15 graus", area: "flyout" }] },
      [{ strategy: 0, candidates: blocklyCandidates(turn, ["flyout-turn"], view) }],
      view,
    ),
    { ok: false, problem: "disabled" },
  );
});

test("three equal blocks stacked: the marked one is found in a page of other proportions", () => {
  // Marked at 1280 × 720, the middle one of three "mover passos" blocks stacked in the workspace.
  const marking = { x: 240, y: 30, scale: 1 };
  const ws = [40, 80, 120].map((y) => ({ x: 20, y }));
  const block = (canvas: { x: number; y: number; scale: number }, at: { x: number; y: number }) => {
    const p = workspaceToPage(canvas, at);
    return candidate({
      tag: "g",
      text: "mover 10 passos",
      rect: { x: p.x, y: p.y, width: 150 * canvas.scale, height: 40 * canvas.scale },
    });
  };
  const marked = block(marking, ws[1]);
  const strategy = { by: "blockly" as const, text: "mover passos", area: "workspace" as const };
  const locator = buildLocator(
    describe({
      tag: "g",
      text: "mover 10 passos",
      blockly: strategy,
      rect: marked.rect,
      view,
      workspace: pageToWorkspace(marking, { x: marked.rect.x + 75, y: marked.rect.y + 20 }),
    }),
  );
  assert.deepEqual(locator.fingerprint.workspace, { x: 95, y: 100 });
  // Recorded at 1280 × 1080 with the workspace zoomed in: the page grows, the blocks do not
  // follow its proportions. The marked rectangle scaled to the page falls on the third block.
  const tall = { width: 1280, height: 1080 };
  const now = { x: 240, y: 60, scale: 1.25 };
  const stacked = ws.map((at) => block(now, at));
  const matches = [{ strategy: 0, candidates: stacked }];
  const byPlace = rankCandidates(locator, matches, tall, now);
  assert.ok(byPlace.ok);
  assert.equal(byPlace.candidate, stacked[1]);
  const byRect = rankCandidates({ ...locator, nth: undefined }, matches, tall);
  assert.ok(!byRect.ok || byRect.candidate !== stacked[1], "the proportions alone mislead");
  // Without the workspace's transform, the order among the equal ones decides.
  assert.equal(locator.nth, undefined);
  const byOrder = rankCandidates({ ...locator, nth: 1 }, matches, tall);
  assert.ok(byOrder.ok && byOrder.candidate === stacked[1]);
  // Three equal buttons the same way: their order, whatever the page's size.
  const buttons = [100, 140, 180].map((y) =>
    candidate({ rect: { x: 100, y, width: 80, height: 30 } }),
  );
  const button = buildLocator(describe({ rect: buttons[1].rect, view }));
  const nth = rankCandidates({ ...button, nth: 1 }, [{ strategy: 0, candidates: buttons }], tall);
  assert.ok(nth.ok && nth.candidate === buttons[1]);
});

test("whatever a real page reports fits the plan: long values are cut or left out", () => {
  const locator = buildLocator(
    describe({
      tag: "x-painel.principal",
      role: "button link",
      name: "Próxima",
      data: [
        { name: "Weird_Name", value: "a" },
        { name: "step", value: "dois" },
      ],
      path: `main > ${Array.from({ length: 200 }, (_, i) => `div:nth-of-type(${i + 1})`).join(" > ")}`.slice(
        0,
        3900,
      ),
      cursor: 'url("data:image/png;base64,iVBORw0KGgo") 4 4, url(mao.cur), pointer',
      url: `https://plataforma.example/${"a(b)".repeat(900)}`,
    }),
  );
  assert.equal(locator.fingerprint.cursor, "pointer");
  assert.equal(cursorKeyword("auto"), "auto");
  // A data name a selector cannot hold and a role that is not one are left out.
  assert.deepEqual(
    locator.strategies.filter((s) => s.by === "data" || s.by === "role").map((s) => s.by),
    ["data"],
  );
  // The custom element's name does not fit a text strategy's tag: the text goes alone.
  const text = locator.strategies.find((s) => s.by === "text");
  assert.ok(text && !("tag" in text && text.tag));
  assert.ok(locatorSchema.safeParse(locator).success, "the plan saves it");
});

test("the workspace transform converts points both ways; drops land under the target block", () => {
  assert.deepEqual(parseTransform("translate(12.5px, -4px) scale(1.25)"), {
    x: 12.5,
    y: -4,
    scale: 1.25,
  });
  assert.deepEqual(parseTransform(undefined), { x: 0, y: 0, scale: 1 });
  const canvas = blocklyCanvas(tree);
  assert.ok(canvas);
  assert.deepEqual(canvas, { x: 240, y: 30, scale: 0.8 });
  const page = workspaceToPage(canvas, { x: 100, y: 50 });
  assert.deepEqual(page, { x: 320, y: 70 });
  assert.deepEqual(pageToWorkspace(canvas, page), { x: 100, y: 50 });
  const blocks = blocklyBlocks(tree);
  const dragged = blocks.find((b) => b.key === "flyout-move");
  const target = blocks.find((b) => b.key === "move-2");
  assert.ok(dragged && target);
  const drop = blocklyDropBelow(dragged, target);
  // The dragged block's top-left corner ends at the target's bottom-left corner.
  assert.equal(drop.x - (dragged.grab.x - dragged.rect.x), target.rect.x);
  assert.equal(drop.y - (dragged.grab.y - dragged.rect.y), target.rect.y + target.rect.height);
});

test("the locator keeps the stable strategies in order and refuses a structural path alone", () => {
  const locator = buildLocator(
    describe({
      testid: "next",
      data: [
        { name: "action", value: "avancar" },
        { name: "reactid", value: "x" },
        { name: "index", value: "3" },
      ],
      id: "react-select-3-input",
      role: "button",
      name: "Próxima parte",
      label: "Avançar para a próxima parte",
      css: "button.next",
      path: "body:nth-of-type(1) > button:nth-of-type(2)",
    }),
  );
  assert.deepEqual(
    locator.strategies.map((s) => s.by),
    ["testid", "data", "role", "label", "text", "css", "css"],
  );
  assert.deepEqual(locator.strategies[1], { by: "data", name: "action", value: "avancar" });
  assert.deepEqual(locator.strategies[4], { by: "text", value: "Próxima parte", tag: "button" });
  // Without query or hash, with URLPattern's syntax escaped.
  assert.equal(locator.url, "https://plataforma.example/curso/aula\\:3");
  const url = locator.url ?? "";
  assert.ok(urlMatches(url, "https://plataforma.example/curso/aula:3?aluno=9#fim"));
  assert.ok(!urlMatches(url, "https://plataforma.example/curso/aula:4"));
  // Buttons are clicked in the middle; canvases keep the marked spot.
  assert.deepEqual(locator.point, { u: 0.5, v: 0.5 });
  assert.deepEqual(
    buildLocator(describe({ kind: "canvas", tag: "canvas", text: "", css: "canvas" })).point,
    { u: 0.2, v: 0.9 },
  );
  assert.throws(
    () => buildLocator(describe({ text: "", path: "div:nth-of-type(3)" })),
    /forma estável/,
  );
  const block = buildLocator(
    describe({
      tag: "g",
      text: "mover 10 passos",
      blockly: { text: "mover passos", area: "flyout" },
    }),
  );
  assert.deepEqual(block.strategies, [{ by: "blockly", text: "mover passos", area: "flyout" }]);
  assert.ok(locatorSchema.safeParse(locator).success);
  assert.equal(urlPatternOf("http://127.0.0.1:8123/a(b)"), "http://127.0.0.1:8123/a\\(b\\)");
  // A frame its page wrote is named as it is.
  assert.equal(urlPatternOf("about:srcdoc"), "about:srcdoc");
  assert.ok(urlMatches(urlPatternOf("about:srcdoc"), "about:srcdoc"));
  assert.ok(!urlMatches("about:srcdoc", "about:blank"));
});

test("ranking: unique usable wins, ties go to nth or to the marked spot, else the next strategy", () => {
  const locator: Locator = {
    strategies: [
      { by: "text", value: "Próxima" },
      { by: "testid", value: "next" },
      { by: "css", value: "main > button:nth-of-type(2)" },
    ],
    point: { u: 0.5, v: 0.5 },
    fingerprint: {
      tag: "button",
      text: "Próxima",
      rect: { x: 640, y: 360, width: 80, height: 30 },
      view: { width: 2560, height: 1440 },
      cursor: "pointer",
    },
  };
  const far = candidate({ rect: { x: 1000, y: 600, width: 80, height: 30 } });
  // The marked rectangle is scaled to this viewport (half the size): near (320, 180).
  const near = candidate({ rect: { x: 300, y: 170, width: 80, height: 30 } });
  const two = rankCandidates(locator, [{ strategy: 0, candidates: [far, near] }], view);
  assert.ok(two.ok && two.candidate === near && !two.changed);
  const nth = rankCandidates(
    { ...locator, nth: 0 },
    [{ strategy: 0, candidates: [far, near] }],
    view,
  );
  assert.ok(nth.ok && nth.candidate === far);
  // Two at the same distance: ambiguous, so the next strategy decides.
  const twins = [
    candidate({ rect: { x: 260, y: 165, width: 80, height: 30 } }),
    candidate({ rect: { x: 340, y: 165, width: 80, height: 30 } }),
  ];
  const next = rankCandidates(
    locator,
    [
      { strategy: 0, candidates: twins },
      { strategy: 1, candidates: [twins[1]] },
    ],
    view,
  );
  assert.ok(next.ok && next.strategy === 1 && next.candidate === twins[1]);
  // A structural path only counts when the element still looks like the marked one.
  const changed = candidate({ text: "Voltar" });
  assert.deepEqual(rankCandidates(locator, [{ strategy: 2, candidates: [changed] }], view), {
    ok: false,
    problem: "absent",
  });
  const same = rankCandidates(locator, [{ strategy: 2, candidates: [candidate()] }], view);
  assert.ok(same.ok && same.strategy === 2);
  // What is closest to usable is reported.
  const problem = rankCandidates(
    locator,
    [
      { strategy: 0, candidates: [candidate({ visible: false })] },
      { strategy: 1, candidates: [candidate({ covered: true })] },
    ],
    view,
  );
  assert.ok(!problem.ok && problem.problem === "covered");
  // Covered only (a footer bar fixed at the bottom of the page): the robot scrolls it to the
  // middle, as it does an element out of view.
  assert.ok(!problem.ok && problem.away?.covered && problem.away.inView);
  assert.match(locateMessage(locator, "covered"), /“Próxima” está coberto/);
  assert.match(locateMessage(locator, "offscreen"), /rolagem/);
  // The copy never uses the em dash or the en dash.
  assert.doesNotMatch(locateMessage(locator, "ambiguous"), /[\u2013\u2014]/);
  const text = rankCandidates(
    locator,
    [{ strategy: 0, candidates: [candidate({ text: "Próxima!" })] }],
    view,
  );
  assert.ok(text.ok && text.changed);
});

test("conditions look at the most specific strategy that finds anything", () => {
  const shown = [{ strategy: 1, candidates: [candidate()] }];
  const hidden = [{ strategy: 0, candidates: [candidate({ visible: false })] }, ...shown];
  assert.equal(conditionMet("visible", shown), true);
  assert.equal(conditionMet("hidden", shown), false);
  assert.equal(conditionMet("hidden", hidden), true);
  assert.equal(conditionMet("hidden", []), true);
  assert.equal(
    conditionMet("enabled", [{ strategy: 0, candidates: [candidate({ enabled: false })] }]),
    false,
  );
  assert.equal(conditionMet("enabled", shown), true);
});

test("Blockly 11 and later mark fields as blocklyEditableField: still values, not labels", () => {
  const renamed: BlocklyNode[] = JSON.parse(
    JSON.stringify(tree).replaceAll("blocklyEditableText", "blocklyEditableField"),
  );
  const move = blocklyBlocks(renamed).find((b) => b.key === "move-1");
  assert.equal(move?.label, "mover passos");
  assert.equal(move?.text, "mover 10 passos");
});

test("apontar deixa a mão abaixo do que mostra, com folga para o cursor maior da edição", () => {
  // A word or a button: the tip under its bottom edge, with room.
  assert.deepEqual(pointingSpot({ x: 100, y: 200, width: 120, height: 40 }, { x: 160, y: 220 }), {
    x: 160,
    y: 258,
  });
  // A word on a big element (the number on a game): two lines under the point, never out of it.
  assert.deepEqual(pointingSpot({ x: 0, y: 0, width: 1500, height: 800 }, { x: 70, y: 50 }), {
    x: 70,
    y: 98,
  });
  assert.deepEqual(pointingSpot({ x: 0, y: 0, width: 1500, height: 800 }, { x: 70, y: 790 }), {
    x: 70,
    y: 796,
  });
});

test("um item escondido numa lista com rolagem própria: a roda gira sobre a lista", () => {
  const view = { width: 1920, height: 1080 };
  const item = {
    ...candidate({ covered: true }),
    rect: { x: 500, y: 700, width: 200, height: 40 },
    scroller: { x: 480, y: 300, width: 240, height: 240 },
  };
  assert.deepEqual(revealOf(item, view, { x: 0, y: 0 }), {
    dx: 0,
    dy: 300,
    at: { x: 600, y: 420 },
  });
  // Sem lista, a página rola e o item termina perto do meio dela.
  const away = { ...item, scroller: undefined };
  assert.deepEqual(revealOf(away, view, { x: 10, y: 20 }).at, { x: 970, y: 560 });
  assert.equal(revealOf(away, view, { x: 0, y: 0 }).dy, Math.round(720 - 1080 * 0.45));
});

test("o fim de um arrasto pode estar sob a paleta que o próprio arrasto fecha", () => {
  const locator: Locator = {
    strategies: [{ by: "css", value: '[data-palco-alvo="a1"]' }],
    point: { u: 0.6, v: 0.4 },
    fingerprint: {
      tag: "",
      text: "",
      rect: { x: 0, y: 0, width: 0, height: 0 },
      view: { width: 1920, height: 1080 },
      cursor: "",
    },
  };
  const under = [{ strategy: 0, candidates: [candidate({ covered: true })] }];
  const view = { width: 1920, height: 1080 };
  assert.equal(rankCandidates(locator, under, view).ok, false);
  assert.equal(rankCandidates(locator, under, view, null, true).ok, true);
});

test("a category inside another is a category too, named without its icon", () => {
  const row = (y: number, text: string) => ({
    tag: "div",
    cls: ["blocklyTreeRow"],
    rect: { x: 0, y, width: 160, height: 40 },
    children: [{ tag: "span", cls: ["blocklyToolboxCategoryLabel"], text }],
  });
  const nested: BlocklyNode[] = [
    {
      tag: "div",
      cls: ["blocklyToolboxDiv"],
      children: [
        {
          tag: "div",
          cls: ["blocklyToolboxCategory"],
          rect: { x: 0, y: 0, width: 160, height: 120 },
          children: [
            row(0, "Programação"),
            {
              tag: "div",
              cls: ["blocklyToolboxCategoryGroup"],
              children: [
                {
                  tag: "div",
                  cls: ["blocklyToolboxCategory"],
                  rect: { x: 0, y: 40, width: 160, height: 40 },
                  children: [row(40, "🏷️ Variáveis")],
                },
                {
                  tag: "div",
                  cls: ["blocklyToolboxCategory"],
                  rect: { x: 0, y: 80, width: 160, height: 40 },
                  children: [row(80, "❓ Lógica & Se")],
                },
              ],
            },
          ],
        },
      ],
    },
  ] as BlocklyNode[];
  const blocks = blocklyBlocks(nested);
  assert.deepEqual(
    blocks.filter((b) => b.area === "toolbox").map((b) => b.label),
    ["Programação", "Variáveis", "Lógica & Se"],
  );
  const [variaveis] = blocklyMatches(blocks, { by: "blockly", text: "Variáveis", area: "toolbox" });
  assert.equal(variaveis?.rect.y, 40);
  // The open category is grabbed on its own row, never on the ones inside it.
  const [programacao] = blocklyMatches(blocks, {
    by: "blockly",
    text: "Programação",
    area: "toolbox",
  });
  assert.deepEqual(programacao?.grab, { x: 80, y: 20 });
});

test("the pointer over a frame takes the frame's shape, not a rule the page around holds", () => {
  // A split handle crossed on the way in left `* { cursor: ew-resize }` on the page around.
  type El = { tagName: string; cursor: string; contentDocument?: Doc | null; closest?: () => null };
  type Doc = { elementFromPoint: (x: number, y: number) => El | null };
  const button: El = { tagName: "BUTTON", cursor: "pointer", closest: () => null };
  let asked: [number, number] = [0, 0];
  const game: Doc = {
    elementFromPoint: (x, y) => {
      asked = [x, y];
      return button;
    },
  };
  const frame = (inner: Doc | null) => ({
    tagName: "IFRAME",
    cursor: "ew-resize",
    contentDocument: inner,
    clientLeft: 2,
    clientTop: 2,
    getBoundingClientRect: () => ({ left: 100, top: 50 }),
  });
  const run = (top: Doc, x: number, y: number) =>
    new Function("document", "getComputedStyle", `return ${cursorAtExpression(x, y)}`)(
      top,
      (el: El) => ({ cursor: el.cursor }),
    );
  assert.deepEqual(run({ elementFromPoint: () => frame(game) }, 300, 200), {
    cursor: "pointer",
    editable: false,
  });
  assert.deepEqual(asked, [198, 148]);
  // A frame of another origin is read by its own process; here it shows the plain arrow.
  assert.deepEqual(run({ elementFromPoint: () => frame(null) }, 300, 200), {
    cursor: "default",
    editable: false,
  });
  assert.equal(LOCATOR_PAGE_SCRIPT.includes(CURSOR_AT_SOURCE), true);
});
