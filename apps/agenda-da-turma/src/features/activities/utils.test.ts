import { describe, expect, it } from "vitest";
import type { TurmaWithSubjectsForForm } from "./types";
import {
  type ActivityFormDefaultsActivity,
  buildActivityFormDefaults,
  canEditActivity,
  formatActivityDueAt,
  formatTurmaShort,
  getActivityStatusLabel,
  getActivityTypeIcon,
  getActivityTypeLabel,
  getDueBadgeLabel,
  getDueBadgeVariant,
  getDueUrgency,
  pickInitialTurmaId,
} from "./utils";

describe("getActivityTypeLabel", () => {
  it("retorna rótulos em PT-BR pra cada tipo", () => {
    expect(getActivityTypeLabel("task")).toBe("Tarefa");
    expect(getActivityTypeLabel("exam")).toBe("Prova");
    expect(getActivityTypeLabel("project")).toBe("Trabalho");
    expect(getActivityTypeLabel("reminder")).toBe("Lembrete");
  });
});

describe("getActivityTypeIcon", () => {
  it("retorna um componente pra cada tipo (smoke)", () => {
    for (const type of ["task", "exam", "project", "reminder"] as const) {
      const Icon = getActivityTypeIcon(type);
      expect(Icon).toBeDefined();
    }
  });
});

describe("getActivityStatusLabel", () => {
  it("retorna rótulo amigável pros dois status", () => {
    expect(getActivityStatusLabel("pending")).toBe("Pendente");
    expect(getActivityStatusLabel("done")).toBe("Concluído");
  });
});

describe("getDueUrgency", () => {
  // now = 11/05/2026 (local)
  const now = new Date(2026, 4, 11, 12, 0, 0);

  it("classifica como overdue quando data passou e status é pending", () => {
    expect(getDueUrgency("2026-05-10", "pending", now)).toBe("overdue");
  });

  it("classifica como due_soon quando entrega é hoje", () => {
    expect(getDueUrgency("2026-05-11", "pending", now)).toBe("due_soon");
  });

  it("classifica como due_soon quando entrega é amanhã", () => {
    expect(getDueUrgency("2026-05-12", "pending", now)).toBe("due_soon");
  });

  it("classifica como upcoming quando entrega é depois de amanhã ou depois", () => {
    expect(getDueUrgency("2026-05-13", "pending", now)).toBe("upcoming");
    expect(getDueUrgency("2026-12-31", "pending", now)).toBe("upcoming");
  });

  it("classifica como done quando status é done — independente da data", () => {
    expect(getDueUrgency("2026-05-10", "done", now)).toBe("done");
    expect(getDueUrgency("2026-05-15", "done", now)).toBe("done");
  });
});

describe("getDueBadgeVariant", () => {
  it("mapeia urgência pro variant correto do Badge", () => {
    expect(getDueBadgeVariant("overdue")).toBe("destructive");
    expect(getDueBadgeVariant("due_soon")).toBe("warning");
    expect(getDueBadgeVariant("upcoming")).toBe("default");
    expect(getDueBadgeVariant("done")).toBe("muted");
  });
});

describe("getDueBadgeLabel", () => {
  const now = new Date(2026, 4, 11, 12, 0, 0);

  it('prefixa "Atrasada · " quando overdue', () => {
    expect(getDueBadgeLabel("2026-05-10", "overdue", now)).toBe("Atrasada · 10/05");
  });

  it('prefixa "Hoje · " quando due_soon e data é hoje', () => {
    expect(getDueBadgeLabel("2026-05-11", "due_soon", now)).toBe("Hoje · 11/05");
  });

  it('prefixa "Amanhã · " quando due_soon e data é amanhã', () => {
    expect(getDueBadgeLabel("2026-05-12", "due_soon", now)).toBe("Amanhã · 12/05");
  });

  it("mostra só DD/MM quando upcoming no mesmo ano", () => {
    expect(getDueBadgeLabel("2026-12-31", "upcoming", now)).toBe("31/12");
  });

  it("inclui o ano quando upcoming em ano diferente", () => {
    expect(getDueBadgeLabel("2027-01-10", "upcoming", now)).toBe("10/01/2027");
  });
});

describe("formatActivityDueAt", () => {
  it('formata "YYYY-MM-DD" como "DD/MM/AAAA"', () => {
    expect(formatActivityDueAt("2026-06-01")).toBe("01/06/2026");
    expect(formatActivityDueAt("2026-12-31")).toBe("31/12/2026");
  });
});

describe("formatTurmaShort", () => {
  it('extrai o número da série e formata "Nº ano L · YYYY"', () => {
    expect(formatTurmaShort("5ano", "A", 2025)).toBe("5º ano A · 2025");
    expect(formatTurmaShort("1ano", "B", 2026)).toBe("1º ano B · 2026");
  });
});

const TURMAS: TurmaWithSubjectsForForm[] = [
  {
    turmaId: "turma-a",
    schoolName: "Escola A",
    grade: "5ano",
    classLetter: "A",
    year: 2026,
    subjects: [{ id: "subj-1", name: "Matemática", colorIndex: 1 }],
  },
  {
    turmaId: "turma-b",
    schoolName: "Escola B",
    grade: "6ano",
    classLetter: "B",
    year: 2026,
    subjects: [{ id: "subj-2", name: "Português", colorIndex: 2 }],
  },
];

describe("pickInitialTurmaId", () => {
  it("retorna defaultTurmaId quando ele pertence à lista", () => {
    expect(pickInitialTurmaId(TURMAS, "turma-b")).toBe("turma-b");
  });

  it("ignora defaultTurmaId inválido e cai pro fallback", () => {
    // Com 2 turmas e default inválido → sem hint, retorna vazio.
    expect(pickInitialTurmaId(TURMAS, "ghost")).toBe("");
  });

  it("auto-seleciona quando há exatamente uma turma", () => {
    expect(pickInitialTurmaId([TURMAS[0] as TurmaWithSubjectsForForm], undefined)).toBe("turma-a");
  });

  it("retorna vazio quando não há turmas", () => {
    expect(pickInitialTurmaId([], "turma-a")).toBe("");
  });
});

describe("buildActivityFormDefaults — modo create", () => {
  it("usa EMPTY_DEFAULTS quando não há activity, defaultTurmaId nem defaultDueAt", () => {
    const result = buildActivityFormDefaults({ turmas: TURMAS });
    expect(result).toEqual({
      turmaId: "",
      subjectId: "",
      type: "task",
      title: "",
      description: "",
      dueAt: "",
      visibility: "individual",
    });
  });

  it("pré-preenche dueAt com defaultDueAt", () => {
    const result = buildActivityFormDefaults({ turmas: TURMAS, defaultDueAt: "2026-05-12" });
    expect(result.dueAt).toBe("2026-05-12");
    expect(result.title).toBe(""); // outros campos seguem vazios
    expect(result.visibility).toBe("individual");
  });

  it("auto-seleciona turma única, mesmo sem defaultTurmaId, e respeita defaultDueAt", () => {
    const single = [TURMAS[0] as TurmaWithSubjectsForForm];
    const result = buildActivityFormDefaults({ turmas: single, defaultDueAt: "2026-05-12" });
    expect(result.turmaId).toBe("turma-a");
    expect(result.dueAt).toBe("2026-05-12");
  });

  it("respeita defaultTurmaId quando válido + defaultDueAt", () => {
    const result = buildActivityFormDefaults({
      turmas: TURMAS,
      defaultTurmaId: "turma-b",
      defaultDueAt: "2026-05-12",
    });
    expect(result.turmaId).toBe("turma-b");
    expect(result.dueAt).toBe("2026-05-12");
  });
});

describe("buildActivityFormDefaults — modo edit", () => {
  const editActivity: ActivityFormDefaultsActivity = {
    type: "exam",
    title: "Prova de história",
    description: "Capítulos 3-5",
    dueAt: "2026-05-20",
    turmaId: "turma-a",
    subjectId: "subj-1",
    visibility: "shared_with_turma",
  };

  it("retorna os campos da activity (ignora defaultDueAt e defaultTurmaId)", () => {
    const result = buildActivityFormDefaults({
      activity: editActivity,
      turmas: TURMAS,
      defaultTurmaId: "turma-b",
      defaultDueAt: "2027-01-01",
    });
    expect(result).toEqual({
      turmaId: "turma-a",
      subjectId: "subj-1",
      type: "exam",
      title: "Prova de história",
      description: "Capítulos 3-5",
      dueAt: "2026-05-20",
      visibility: "shared_with_turma",
    });
  });

  it("normaliza description null → string vazia (RHF não aceita null)", () => {
    const result = buildActivityFormDefaults({
      activity: { ...editActivity, description: null },
      turmas: TURMAS,
    });
    expect(result.description).toBe("");
  });
});

describe("canEditActivity", () => {
  function makeItem(overrides: Partial<Parameters<typeof canEditActivity>[0]> = {}) {
    return {
      createdByUserId: "user-1",
      visibility: "individual" as const,
      hasOtherAcceptances: false,
      ...overrides,
    };
  }

  it("creator pode editar atividade individual", () => {
    expect(canEditActivity(makeItem(), "user-1")).toBe(true);
  });

  it("non-creator nunca edita", () => {
    expect(canEditActivity(makeItem(), "outro-user")).toBe(false);
  });

  it("creator NÃO edita shared activity já aceita por outra família", () => {
    expect(
      canEditActivity(
        makeItem({ visibility: "shared_with_turma", hasOtherAcceptances: true }),
        "user-1",
      ),
    ).toBe(false);
  });

  it("creator edita shared activity SEM aceites de outras famílias", () => {
    expect(
      canEditActivity(
        makeItem({ visibility: "shared_with_turma", hasOtherAcceptances: false }),
        "user-1",
      ),
    ).toBe(true);
  });
});
