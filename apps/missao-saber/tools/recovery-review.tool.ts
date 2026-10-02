import { writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { assessmentBanks, contentUnits, recoveryLessons } from "@/features/content/catalog";
import { inventory } from "@/features/content/inventory";
import type { Item } from "@/features/content/types";

const numericKey = (item: Item) => {
  const numbers = (s: string) =>
    (s.replace(/^Questão \d+\.\s*/, "").match(/[−-]?\d+(?:[.,]\d+)?/g) ?? [])
      .map((v) => v.replace("−", "-").replace(",", "."))
      .sort()
      .join("|");
  return `${item.skillId}#${numbers(item.prompt)}#${item.type === "numeric" ? String(item.grading.value) : item.type === "choice" ? numbers(item.answer) : ""}`;
};
it("audits new recovery material against the reserved banks and exports review evidence", () => {
  for (const id of inventory.integrity.reservedNumericTwins) {
    const item = assessmentBanks.flatMap((b) => b.items).find((i) => i.id === id);
    if (item)
      console.info(
        "OVERLAP",
        item,
        recoveryLessons.flatMap((l) => l.items).filter((i) => numericKey(i) === numericKey(item)),
      );
  }
  writeFileSync(
    "tmp/recovery-content-review.json",
    JSON.stringify(
      {
        inventory,
        recovery: recoveryLessons,
        figures: contentUnits.filter((l) => l.items.some((i) => i.figure)),
      },
      null,
      2,
    ),
  );
  expect(inventory.integrity.reservedNumericTwins).toEqual([]);
});
