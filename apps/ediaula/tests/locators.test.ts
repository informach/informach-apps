import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
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
  type ElementDescription,
  type Locator,
  locateMessage,
  locatorSchema,
  pageToWorkspace,
  parseTransform,
  rankCandidates,
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
  assert.deepEqual(problem, { ok: false, problem: "covered" });
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
