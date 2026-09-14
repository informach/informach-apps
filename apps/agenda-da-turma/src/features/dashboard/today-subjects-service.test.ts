import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listAccessibleProfiles: vi.fn(),
  listMembershipsForProfiles: vi.fn(),
  listSubjectsForTurma: vi.fn(),
  attachAlternatingSlots: vi.fn(),
  listActiveProfileSubjectsForProfiles: vi.fn(),
  listActiveProfileSubjectsForProfile: vi.fn(),
  findStudentProfileByIdForUser: vi.fn(),
  verifyMembership: vi.fn(),
  todayLocalIso: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/family/access", () => ({
  listAccessibleProfiles: mocks.listAccessibleProfiles,
}));
vi.mock("@/features/turmas/repository", () => ({
  listMembershipsForProfiles: mocks.listMembershipsForProfiles,
  verifyMembership: mocks.verifyMembership,
}));
vi.mock("@/features/subjects/repository", () => ({
  listSubjectsForTurma: mocks.listSubjectsForTurma,
  attachAlternatingSlots: mocks.attachAlternatingSlots,
}));
vi.mock("@/features/profile-subjects/repository", () => ({
  listActiveProfileSubjectsForProfiles: mocks.listActiveProfileSubjectsForProfiles,
  listActiveProfileSubjectsForProfile: mocks.listActiveProfileSubjectsForProfile,
}));
vi.mock("@/features/students/repository", () => ({
  findStudentProfileByIdForUser: mocks.findStudentProfileByIdForUser,
}));
vi.mock("./date", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./date")>()),
  todayLocalIso: mocks.todayLocalIso,
}));

import { getTodaySubjectsForProfiles } from "./today-subjects-service";

const MONDAY = "2026-09-14";
const WEDNESDAY = "2026-09-16";
const SATURDAY = "2026-09-19";

function subject(overrides: Record<string, unknown> = {}) {
  return {
    id: "s1",
    turmaId: "t1",
    name: "Matemática",
    teacherName: null,
    colorIndex: 1,
    classDays: ["mon"],
    alternatingSlots: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.todayLocalIso.mockReturnValue(MONDAY);
  mocks.listActiveProfileSubjectsForProfiles.mockResolvedValue([]);
  mocks.listMembershipsForProfiles.mockResolvedValue([]);
  mocks.listSubjectsForTurma.mockResolvedValue([]);
  mocks.attachAlternatingSlots.mockResolvedValue([]);
});

describe("getTodaySubjectsForProfiles", () => {
  it("devolve o horário de cada criança, em ordem alfabética", async () => {
    mocks.listAccessibleProfiles.mockResolvedValue([
      { id: "p2", name: "Bruno", activeTurmaId: "t2" },
      { id: "p1", name: "Ana", activeTurmaId: "t1" },
    ]);
    mocks.listMembershipsForProfiles.mockResolvedValue([
      { profileId: "p1", turmaId: "t1" },
      { profileId: "p2", turmaId: "t2" },
    ]);
    mocks.listSubjectsForTurma.mockImplementation(async (turmaId: string) =>
      turmaId === "t1"
        ? [subject({ id: "s1", turmaId: "t1", name: "Matemática" })]
        : [subject({ id: "s2", turmaId: "t2", name: "História", colorIndex: 4 })],
    );
    mocks.attachAlternatingSlots.mockImplementation(async (rows: unknown[]) => rows);

    const views = await getTodaySubjectsForProfiles("u1");

    expect(views.map((v) => v.profileName)).toEqual(["Ana", "Bruno"]);
    expect(views[0]?.subjects.map((s) => s.name)).toEqual(["Matemática"]);
    expect(views[1]?.subjects.map((s) => s.name)).toEqual(["História"]);
  });

  it("consulta cada turma uma vez só, mesmo com irmãos na mesma turma", async () => {
    mocks.listAccessibleProfiles.mockResolvedValue([
      { id: "p1", name: "Ana", activeTurmaId: "t1" },
      { id: "p2", name: "Bruno", activeTurmaId: "t1" },
    ]);
    mocks.listMembershipsForProfiles.mockResolvedValue([
      { profileId: "p1", turmaId: "t1" },
      { profileId: "p2", turmaId: "t1" },
    ]);
    mocks.listSubjectsForTurma.mockResolvedValue([subject()]);
    mocks.attachAlternatingSlots.mockImplementation(async (rows: unknown[]) => rows);

    const views = await getTodaySubjectsForProfiles("u1");

    expect(views).toHaveLength(2);
    expect(mocks.listSubjectsForTurma).toHaveBeenCalledTimes(1);
    // Os slots de revezamento saem numa consulta só, sobre a união.
    expect(mocks.attachAlternatingSlots).toHaveBeenCalledTimes(1);
  });

  it("ignora a turma ativa sem participação confirmada", async () => {
    mocks.listAccessibleProfiles.mockResolvedValue([
      { id: "p1", name: "Ana", activeTurmaId: "t1" },
    ]);
    // Sem linha de participação: `active_turma_id` é só preferência.
    mocks.listMembershipsForProfiles.mockResolvedValue([]);

    const views = await getTodaySubjectsForProfiles("u1");

    expect(views).toEqual([]);
    expect(mocks.listSubjectsForTurma).not.toHaveBeenCalled();
  });

  it("respeita o revezamento quinzenal na semana da matéria", async () => {
    mocks.todayLocalIso.mockReturnValue(WEDNESDAY);
    mocks.listAccessibleProfiles.mockResolvedValue([
      { id: "p1", name: "Ana", activeTurmaId: "t1" },
    ]);
    mocks.listMembershipsForProfiles.mockResolvedValue([{ profileId: "p1", turmaId: "t1" }]);
    const artes = subject({
      id: "artes",
      name: "Artes",
      classDays: ["wed"],
      alternatingSlots: [{ dayOfWeek: "wed", pairedSubjectId: "acc", anchorDate: WEDNESDAY }],
    });
    const acc = subject({
      id: "acc",
      name: "ACC",
      classDays: ["wed"],
      alternatingSlots: [{ dayOfWeek: "wed", pairedSubjectId: "artes", anchorDate: "2026-09-23" }],
    });
    mocks.listSubjectsForTurma.mockResolvedValue([artes, acc]);
    mocks.attachAlternatingSlots.mockImplementation(async (rows: unknown[]) => rows);

    const views = await getTodaySubjectsForProfiles("u1");

    // Âncora da semana é de Artes: hoje é Artes, não ACC.
    expect(views[0]?.subjects.map((s) => s.name)).toEqual(["Artes"]);
    const [first] = views[0]?.subjects ?? [];
    expect(first?.source === "turma" && first.alternatingPairName).toBe("ACC");
  });

  it("mostra a criança no fim de semana, com a lista vazia", async () => {
    mocks.todayLocalIso.mockReturnValue(SATURDAY);
    mocks.listAccessibleProfiles.mockResolvedValue([
      { id: "p1", name: "Ana", activeTurmaId: "t1" },
    ]);
    mocks.listMembershipsForProfiles.mockResolvedValue([{ profileId: "p1", turmaId: "t1" }]);
    mocks.listSubjectsForTurma.mockResolvedValue([subject()]);
    mocks.attachAlternatingSlots.mockImplementation(async (rows: unknown[]) => rows);

    const views = await getTodaySubjectsForProfiles("u1");

    expect(views).toHaveLength(1);
    expect(views[0]?.classDay).toBeNull();
    expect(views[0]?.subjects).toEqual([]);
  });

  it("consulta outro dia quando recebe dateIso, que é a base da mochila de amanhã", async () => {
    // Hoje é segunda; amanhã (terça) a matéria de segunda não aparece.
    mocks.listAccessibleProfiles.mockResolvedValue([
      { id: "p1", name: "Ana", activeTurmaId: "t1" },
    ]);
    mocks.listMembershipsForProfiles.mockResolvedValue([{ profileId: "p1", turmaId: "t1" }]);
    mocks.listSubjectsForTurma.mockResolvedValue([
      subject({ id: "seg", name: "Matemática", classDays: ["mon"] }),
      subject({ id: "ter", name: "História", classDays: ["tue"] }),
    ]);
    mocks.attachAlternatingSlots.mockImplementation(async (rows: unknown[]) => rows);

    const hoje = await getTodaySubjectsForProfiles("u1");
    expect(hoje[0]?.subjects.map((s) => s.name)).toEqual(["Matemática"]);

    const amanha = await getTodaySubjectsForProfiles("u1", { dateIso: "2026-09-15" });
    expect(amanha[0]?.subjects.map((s) => s.name)).toEqual(["História"]);
    expect(amanha[0]?.dateIso).toBe("2026-09-15");
  });

  it("aplica o filtro de criança", async () => {
    mocks.listAccessibleProfiles.mockResolvedValue([
      { id: "p1", name: "Ana", activeTurmaId: "t1" },
      { id: "p2", name: "Bruno", activeTurmaId: "t2" },
    ]);
    mocks.listMembershipsForProfiles.mockResolvedValue([{ profileId: "p1", turmaId: "t1" }]);
    mocks.listSubjectsForTurma.mockResolvedValue([subject()]);
    mocks.attachAlternatingSlots.mockImplementation(async (rows: unknown[]) => rows);

    const views = await getTodaySubjectsForProfiles("u1", { profileFilter: "p1" });

    expect(views.map((v) => v.profileName)).toEqual(["Ana"]);
  });

  it("inclui extracurriculares do dia junto com as matérias da turma", async () => {
    mocks.listAccessibleProfiles.mockResolvedValue([
      { id: "p1", name: "Ana", activeTurmaId: null },
    ]);
    mocks.listActiveProfileSubjectsForProfiles.mockResolvedValue([
      {
        id: "e1",
        profileId: "p1",
        name: "Natação",
        colorIndex: 2,
        classDays: ["mon"],
        status: "active",
      },
      {
        id: "e2",
        profileId: "p1",
        name: "Violão",
        colorIndex: 3,
        classDays: ["fri"],
        status: "active",
      },
    ]);

    const views = await getTodaySubjectsForProfiles("u1");

    expect(views[0]?.subjects.map((s) => s.name)).toEqual(["Natação"]);
    expect(views[0]?.turmaId).toBeNull();
  });
});
