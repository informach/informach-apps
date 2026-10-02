import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { catalogReviewAudit } from "@/features/content/authoring-review";
import { contentUnits } from "@/features/content/catalog";
import { gradeAnswer, numericSolution } from "@/features/learning/engine";

it("audita respostas numéricas e registra a cobertura do catálogo", () => {
  const items = contentUnits.flatMap((lesson) => lesson.items);
  const numeric = items.filter((item) => item.type === "numeric");
  const cases = numeric.map((item) => {
    const printed = numericSolution(item);
    return {
      id: item.id,
      prompt: item.prompt,
      value: item.grading.value,
      printed,
      forms: item.grading.acceptedForms,
      unit: item.grading.unit,
      printedAccepted: gradeAnswer(item, printed).correct === true,
      explanation: item.explanation,
    };
  });
  const report = {
    lessons: contentUnits.length,
    items: items.length,
    numeric: numeric.length,
    formats: Object.fromEntries(
      ["choice", "numeric", "ordering", "justification"].map((type) => [
        type,
        items.filter((item) => item.type === type).length,
      ]),
    ),
    units: cases.filter((item) => item.unit),
    rejectedPrintedAnswers: cases.filter((item) => !item.printedAccepted),
    fractionalValues: cases.filter((item) => !Number.isInteger(item.value)),
  };
  const directory = resolve("tmp/full-review");
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, "responses.json"), `${JSON.stringify(report, null, 2)}\n`);
  expect(report.rejectedPrintedAnswers).toEqual([]);
  const changed = new Set(catalogReviewAudit(contentUnits).changed);
  if (changed.size) {
    const revisions = contentUnits
      .filter((unit) => unit.items.some((item) => changed.has(item.id)))
      .map((unit) => ({
        lessonId: unit.id,
        version: unit.version,
        previousVersion:
          unit.kind === "assessment-bank" ? (unit.id.startsWith("bank:exam:") ? 3 : 2) : 1,
        items: unit.items.filter((item) => changed.has(item.id)).map((item) => item.id),
      }));
    for (const revision of revisions)
      expect(revision.version, revision.lessonId).toBeGreaterThan(revision.previousVersion);
    writeFileSync(
      resolve(directory, "content-changes.json"),
      `${JSON.stringify(revisions, null, 2)}\n`,
    );
  }
  console.log(
    JSON.stringify({
      lessons: report.lessons,
      items: report.items,
      formats: report.formats,
      rejectedPrintedAnswers: report.rejectedPrintedAnswers,
      longestExplanations: [...items]
        .sort((left, right) => right.explanation.length - left.explanation.length)
        .slice(0, 3)
        .map((item) => ({ id: item.id, characters: item.explanation.length })),
    }),
  );
});
