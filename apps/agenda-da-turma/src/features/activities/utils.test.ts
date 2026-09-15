import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ACTIVITY_TYPES } from "@/features/unified-activities/activity-types";
import {
  formatActivityDueAt,
  formatTurmaShort,
  getActivityStatusLabel,
  getActivityTypeIcon,
  getActivityTypeLabel,
  getDueBadgeLabel,
  getDueBadgeVariant,
  getDueUrgency,
} from "./utils";

describe("getActivityTypeLabel", () => {
  // Rótulos vêm do vocabulário único (`unified-activities/activity-types.ts`),
  // o mesmo usado pelos cards de recado — antes "task" aparecia como "Tarefa"
  // aqui e "Para casa (tarefa)" lá.
  it("retorna rótulos em PT-BR pra cada tipo", () => {
    expect(getActivityTypeLabel("task")).toBe("Para casa (tarefa)");
    expect(getActivityTypeLabel("exam")).toBe("Prova");
    expect(getActivityTypeLabel("project")).toBe("Trabalho");
    expect(getActivityTypeLabel("reminder")).toBe("Lembrete");
    expect(getActivityTypeLabel("material")).toBe("Material");
    expect(getActivityTypeLabel("authorization")).toBe("Autorização");
    expect(getActivityTypeLabel("event")).toBe("Evento");
    expect(getActivityTypeLabel("study")).toBe("Estudo");
  });

  it("cobre todos os tipos do vocabulário", () => {
    for (const type of ACTIVITY_TYPES) {
      expect(getActivityTypeLabel(type)).toBeTruthy();
    }
  });
});

describe("getActivityTypeIcon", () => {
  it("retorna um componente pra cada tipo (smoke)", () => {
    for (const type of ACTIVITY_TYPES) {
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
  // 11/05/2026, meio-dia em São Paulo. Instante explícito em UTC, e não
  // `new Date(2026, 4, 11, 12)`: o cálculo agora fixa o fuso do app, então um
  // horário "local da máquina" faria o teste depender de onde ele roda.
  const now = new Date("2026-05-11T15:00:00Z");

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
  const now = new Date("2026-05-11T15:00:00Z");

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

/**
 * Regressão do fuso no caminho SEM `now` explícito.
 *
 * Todos os testes acima passam uma data: era justamente por isso que o bug não
 * aparecia. Em produção ninguém passa — `getDueUrgency` e `getDueBadgeLabel`
 * caem no `new Date()` padrão, durante a renderização no servidor, e o Railway
 * roda em UTC. Entre 21h e a meia-noite de Brasília, um `todayLocalIso` que
 * lesse o fuso do processo já estaria no dia seguinte.
 */
describe("prazo sem `now` explícito, às 23h30 de Brasília", () => {
  // 2026-05-11T02:30:00Z === 10/05/2026, 23h30 em São Paulo.
  // Em UTC o processo já virou para o dia 11.
  const lateNightBrt = new Date("2026-05-11T02:30:00Z");

  // O fuso do processo é fixado em UTC aqui, como no Railway. Sem isto o teste
  // passaria mesmo com o bug numa máquina em horário de Brasília, que é
  // justamente onde ele é escrito — e o CI seria o primeiro a descobrir.
  const originalTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "UTC";
  });
  afterAll(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("confirma que o processo está em UTC e já virou o dia", () => {
    expect(lateNightBrt.getDate()).toBe(11);
  });

  function freeze() {
    vi.useFakeTimers();
    vi.setSystemTime(lateNightBrt);
  }

  it("trata o prazo do próprio dia como due_soon, não como atrasado", () => {
    freeze();
    expect(getDueUrgency("2026-05-10", "pending")).toBe("due_soon");
  });

  it("não antecipa o prazo de amanhã para hoje", () => {
    freeze();
    expect(getDueUrgency("2026-05-11", "pending")).toBe("due_soon");
    expect(getDueBadgeLabel("2026-05-11", "due_soon")).toBe("Amanhã · 11/05");
  });

  it('rotula o prazo do próprio dia como "Hoje"', () => {
    freeze();
    expect(getDueBadgeLabel("2026-05-10", "due_soon")).toBe("Hoje · 10/05");
  });

  it("só considera atrasado o que venceu antes do dia corrente em São Paulo", () => {
    freeze();
    expect(getDueUrgency("2026-05-09", "pending")).toBe("overdue");
  });

  it("usa o ano de São Paulo para decidir se mostra o ano na etiqueta", () => {
    // 2027-01-01T01:00:00Z === 31/12/2026, 22h em São Paulo: o processo em UTC
    // já está em 2027 e passaria a carimbar o ano em toda data.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-01-01T01:00:00Z"));
    expect(getDueBadgeLabel("2026-12-31", "due_soon")).toBe("Hoje · 31/12");
  });
});
