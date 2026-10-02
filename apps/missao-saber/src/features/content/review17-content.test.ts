import { expect, it } from "vitest";
import { findLesson } from "./catalog";

function item(id: string) {
  const lesson = findLesson(id.slice(0, id.lastIndexOf("-")));
  const found = lesson?.items.find((question) => question.id === id);
  if (!found) throw new Error(`Missing question ${id}`);
  return found;
}

it("asks for the minimum when larger pigeonhole counts also guarantee the result", () => {
  for (const [id, boxes, quota] of [
    ["gavetas-recuperacao-1-3", 8, 2],
    ["gavetas-recuperacao-2-1", 5, 3],
    ["gavetas-recuperacao-2-3", 3, 2],
  ] as const) {
    const question = item(id);
    if (question.type !== "numeric") throw new Error("Expected numeric question");
    const value = question.grading.value;
    expect(Math.ceil(value / boxes)).toBe(quota);
    expect(Math.ceil((value - 1) / boxes)).toBeLessThan(quota);
    expect(Math.ceil((value + 1) / boxes)).toBeGreaterThanOrEqual(quota);
    expect(question.prompt).toMatch(/menor|mínim/);
  }
  expect(item("gavetas-recuperacao-2-2").prompt).toContain("pelo menos k");
});

it("states the initial charge before subtracting a fraction of the full capacity", () => {
  expect(item("fracoes-recuperacao-2-2").prompt).toMatch(/completamente carregada/);
});

it("gives the second encounter hints for its own operation and geometric shape", () => {
  expect(item("medidas-recuperacao-2-1").hints[1]).toMatch(/Divida a área/);
  expect(item("orientacao-espacial-recuperacao-2-3").hints[0]).toMatch(/todos os cubos/);
  expect(item("geometria-plana-recuperacao-2-2").hints[1]).toMatch(/bases/);
  expect(item("geometria-plana-recuperacao-2-3").hints[1]).toMatch(/Subtraia/);
  expect(item("medidas-recuperacao-1-1").hints[1]).toMatch(/Multiplique/);
});
