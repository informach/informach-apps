import { describe, expect, it } from "vitest";
import {
  backpackLine,
  backpackSentence,
  buildBackpack,
  fullDayCount,
  fullDayDetail,
  weekRows,
} from "./page-of-day";

const thing = (over: Partial<Parameters<typeof weekRows>[0]["things"][number]>) => ({
  profileId: "clara",
  profileName: "Clara",
  type: "task",
  title: "Atividade",
  subjectName: null,
  dueAt: null,
  time: null,
  estimatedMinutes: null,
  ...over,
});

describe("buildBackpack", () => {
  const backpack = buildBackpack({
    schedule: [
      {
        profileId: "clara",
        profileName: "Clara",
        subjects: [
          { id: "por", name: "Português" },
          { id: "cie", name: "Ciências" },
        ],
      },
      { profileId: "miguel", profileName: "Miguel", subjects: [{ id: "nat", name: "Natação" }] },
    ],
    kits: { "miguel:nat": ["Touca", "Óculos", "Toalha"] },
    tomorrow: [
      thing({ type: "material", title: "Levar rolo de papel e cola", subjectName: "Ciências" }),
      thing({ type: "exam", title: "Prova", subjectName: "Português" }),
    ],
  });

  it("puts tomorrow's materials and the always-bring items in the bag, child by child", () => {
    expect(backpack.map(backpackLine)).toEqual([
      "Clara: rolo de papel e cola.",
      "Miguel: touca, óculos e toalha de natação.",
    ]);
    expect(backpackSentence(backpack)).toBe(
      "Clara leva rolo de papel e cola. Miguel leva touca, óculos e toalha.",
    );
  });

  it("keeps the classes and the always-bring list for the evening", () => {
    expect(backpack[0]?.subjects).toEqual(["Português", "Ciências"]);
    expect(backpack[1]?.kits).toEqual([
      { subject: "Natação", items: ["touca", "óculos", "toalha"] },
    ]);
  });

  it("keeps a child with something tomorrow even without classes or materials", () => {
    const evening = buildBackpack({
      schedule: [],
      kits: {},
      tomorrow: [thing({ profileId: "bia", profileName: "Bia", type: "exam", title: "Prova" })],
    });
    expect(evening.map((child) => child.profileName)).toEqual(["Bia"]);
    expect(evening[0]?.items).toEqual([]);
    expect(backpackSentence(evening)).toBe("");
  });
});

describe("weekRows", () => {
  it("counts today, names a single thing, and warns a full day", () => {
    const rows = weekRows({
      todayIso: "2026-10-19",
      days: [
        { iso: "2026-10-19", full: false },
        { iso: "2026-10-20", full: false },
        { iso: "2026-10-21", full: false },
        { iso: "2026-10-22", full: true },
        { iso: "2026-10-24", full: false },
      ],
      openToday: 4,
      lateToday: 1,
      things: [
        thing({ dueAt: "2026-10-20", type: "material", subjectName: "Ciências" }),
        thing({ dueAt: "2026-10-21", type: "event", title: "Passeio ao museu", time: "08:00" }),
        thing({ dueAt: "2026-10-22", type: "exam", subjectName: "Português" }),
        thing({ dueAt: "2026-10-22", type: "exam", subjectName: "Inglês" }),
      ],
    });
    expect(rows.map((row) => [row.label, row.lead, row.text])).toEqual([
      ["seg, 19", null, "3 coisas, 1 atrasada"],
      ["ter, 20", null, "Material de Ciências"],
      ["qua, 21", null, "Passeio ao museu, 8h"],
      ["qui, 22", "Dia cheio:", "2 provas"],
    ]);
  });
});

describe("fullDayDetail", () => {
  it("says what makes the day full", () => {
    expect(
      fullDayDetail([
        thing({ type: "exam", subjectName: "Português" }),
        thing({ type: "exam", subjectName: "Inglês", profileName: "Miguel" }),
      ]),
    ).toBe("prova de Português de Clara e prova de Inglês de Miguel");
  });
});

describe("weekRows num dia cheio com uma coisa só", () => {
  it("says 1 trabalho, not 1 trabalhos", () => {
    const rows = weekRows({
      todayIso: "2026-10-17",
      days: [{ iso: "2026-10-21", full: true }],
      openToday: 0,
      lateToday: 0,
      things: [thing({ dueAt: "2026-10-21", type: "project", title: "Maquete" })],
    });
    expect(rows.find((row) => row.full)?.text).toBe("1 trabalho");
  });
});

describe("fullDayCount", () => {
  it("counts the full day by type, like the evening shortcut in the canvas", () => {
    expect(fullDayCount([{ type: "exam" }, { type: "exam" }])).toBe("2 provas");
    expect(fullDayCount([{ type: "exam" }, { type: "task" }, { type: "task" }])).toBe("3 coisas");
    expect(fullDayCount([{ type: "project" }])).toBe("1 trabalho");
  });
});
