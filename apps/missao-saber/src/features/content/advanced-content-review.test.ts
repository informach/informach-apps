import { expect, it } from "vitest";
import { skillPacks } from "./skills";

function numbers(text: string): number[] {
  return [...text.matchAll(/\d+(?:\.\d{3})*(?:,\d+)?/g)].map(([value]) =>
    Number(value.replaceAll(".", "").replace(",", ".")),
  );
}

function numberAt(data: number[], index: number): number {
  const value = data[index];
  if (value === undefined || !Number.isFinite(value)) {
    throw new Error(`Expected a finite number at position ${index}, got ${value}`);
  }
  return value;
}

// These oracles solve from the learner-visible prompt only. They do not read the
// preceding exercise or reuse the explanation/answer to supply missing inputs.
const standaloneCalculations: Array<{
  pack: string;
  mission: number;
  question: number;
  dataCount: number;
  solve: (numberAt: (index: number) => number) => number;
}> = [
  { pack: "cenarios", mission: 1, question: 2, dataCount: 1, solve: (n) => n(0) * 12 },
  {
    pack: "cenarios",
    mission: 2,
    question: 3,
    dataCount: 4,
    solve: (n) => (n(0) * n(1) * (n(3) - n(2))) / 100,
  },
  {
    pack: "cenarios",
    mission: 2,
    question: 8,
    dataCount: 4,
    solve: (n) => n(0) / n(3),
  },
  {
    pack: "cenarios",
    mission: 3,
    question: 2,
    dataCount: 3,
    solve: (n) => n(0) * n(1) * (1 + n(2) / 100),
  },
  {
    pack: "cenarios",
    mission: 4,
    question: 4,
    dataCount: 4,
    solve: (n) => n(0) * (n(1) + n(2)),
  },
  {
    pack: "cenarios",
    mission: 4,
    question: 7,
    dataCount: 4,
    solve: (n) => Math.floor((n(0) - n(2)) / (n(1) - n(3))) + 1,
  },
  {
    pack: "equivalencia-temporal",
    mission: 2,
    question: 2,
    dataCount: 4,
    solve: (n) => n(0) / (1 + n(3) / 100) ** n(1) + n(0) / (1 + n(3) / 100) ** n(2),
  },
  {
    pack: "equivalencia-temporal",
    mission: 5,
    question: 2,
    dataCount: 3,
    solve: (n) => n(1) * n(2) - n(0),
  },
  {
    pack: "renda-variavel",
    mission: 5,
    question: 2,
    dataCount: 4,
    solve: (n) => n(0) * (1 + (n(1) * n(2) + (100 - n(1)) * n(3)) / 10000),
  },
];

it.each(standaloneCalculations)(
  "solves $pack-$mission-$question using its own prompt",
  ({ pack, mission, question, dataCount, solve }) => {
    const item = skillPacks.find((p) => p.id === pack)?.missions[mission - 1]?.specs[question - 1];
    if (!item) throw new Error(`Missing ${pack}-${mission}-${question}`);
    const data = numbers(item.prompt);
    expect(data).toHaveLength(dataCount);
    const expected =
      Math.round((solve((index) => numberAt(data, index)) + Number.EPSILON) * 100) / 100;
    const actual = item.kind === "numeric" ? item.value : numberAt(numbers(item.answer), 0);
    expect(actual).toBeCloseTo(expected, 8);
  },
);
