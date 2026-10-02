import { describe, expect, it } from "vitest";
import { gradeAnswer } from "../learning/engine";
import { commercialLessons, legacyReservedSpec, makeAssessmentBank } from "./commercial-curriculum";
import { packLessons } from "./skill-factory";
import { skillPacks } from "./skills";
import { trackDefinitions } from "./tracks";
import { type Item, itemSchema, publicLesson } from "./types";

const reviewedLessons = [...commercialLessons, ...skillPacks.flatMap(packLessons)];
function orderingIn(lessonId: string) {
  const lesson = reviewedLessons.find((candidate) => candidate.id === lessonId);
  const item = lesson?.items.find((candidate) => candidate.type === "ordering");
  if (!lesson || item?.type !== "ordering") throw new Error(`Missing ordering in ${lessonId}`);
  return { lesson, item };
}

function permutations<T>(values: T[]): T[][] {
  if (values.length === 0) return [[]];
  return values.flatMap((value, index) =>
    permutations(values.filter((_, other) => other !== index)).map((rest) => [value, ...rest]),
  );
}

describe("reviewed elementary and commercial content", () => {
  it.each([
    "porcentagem-3",
    "precos-3",
    "orcamento-3",
    "medidas-3",
    "composicao-de-figuras-3",
    "caminhos-3",
    "medir-e-comparar-3",
  ])("accepts either independent input first in %s, and only then the calculation", (lessonId) => {
    const { lesson, item } = orderingIn(lessonId);
    itemSchema.parse(item);
    // These lessons require two independent inputs, then a calculation, then a check/use of it.
    // List the two valid answers independently of the authored grading constraints.
    const valid = new Set([
      "understand,represent,solve,verify",
      "represent,understand,solve,verify",
    ]);
    for (const order of permutations(["understand", "represent", "solve", "verify"])) {
      expect(gradeAnswer(item, JSON.stringify(order)).correct, order.join(",")).toBe(
        valid.has(order.join(",")),
      );
    }
    // Students get the same step identities as the server, without the scoring graph.
    const visible = publicLesson(lesson).items.find((candidate) => candidate.id === item.id);
    expect(visible).not.toHaveProperty("grading");
    expect(visible).toMatchObject({ steps: item.steps });
  });

  it("allows the limiting example before or after the extra object in the guarantee proof", () => {
    const { item } = orderingIn("gavetas-3");
    const valid = new Set([
      "understand,represent,solve,verify",
      "understand,represent,verify,solve",
    ]);
    for (const order of permutations(["understand", "represent", "solve", "verify"])) {
      expect(gradeAnswer(item, JSON.stringify(order)).correct, order.join(",")).toBe(
        valid.has(order.join(",")),
      );
    }
  });

  it("keeps successive verification and comparison stages in their authored sequence", () => {
    for (const lessonId of ["caminhos-4", "caminhos-5", "porcentagem-4", "porcentagem-5"]) {
      expect(orderingIn(lessonId).item.grading.mode).toBe("exact");
    }
  });

  it.each([
    ["paridade-3", 74, 9],
    ["paridade-4", 118, 11],
    ["paridade-5", 203, 12],
  ] as const)("grades the smallest nonnegative increment in %s", (lessonId, start, divisor) => {
    const item = reviewedLessons.find((lesson) => lesson.id === lessonId)?.items[6];
    if (item?.type !== "numeric") throw new Error(`Missing numeric item in ${lessonId}`);
    const minimum = Array.from({ length: divisor }, (_, value) => value).find(
      (increment) => (start + increment) % divisor === 0,
    );
    expect(minimum).toBeDefined();
    expect(gradeAnswer(item, String(minimum))).toMatchObject({ valid: true, correct: true });
    expect(item.prompt).toContain("inteiro não negativo");
  });

  it("formats the live inverse-percentage alternatives in decimal notation without binary tails", () => {
    const track = trackDefinitions.find((candidate) => candidate.id === "olitef-n1");
    if (!track) throw new Error("Missing OLITEF N1 track");
    const bank = makeAssessmentBank(track, "diagnostic", legacyReservedSpec);
    const item: Item | undefined = bank.items.find((candidate) => candidate.id.endsWith("-12"));
    if (item?.type !== "choice") throw new Error("Missing inverse-percentage choice");
    // 384 / (120/100) = 320. The common wrong inverse subtracts 20% of 384 = 307.2.
    expect(item.answer).toBe("320");
    expect(item.options).toContain("307,2");
    expect(item.options.some((option) => /\d+[.,]\d{5,}/.test(option))).toBe(false);
    expect(gradeAnswer(item, "320")).toMatchObject({ valid: true, correct: true });
    expect(gradeAnswer(item, "307,2")).toMatchObject({ valid: true, correct: false });
  });
});
