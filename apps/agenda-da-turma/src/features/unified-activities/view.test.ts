import { describe, expect, it } from "vitest";
import type { ActivityOverviewItem } from "./overview-types";
import type { TaskRow } from "./task-repository";
import { getViewDueBadge, toActivityView } from "./view";

const ME = "user-me";
const OTHER = "user-other";

/**
 * Uma tarefa, com o contexto que a consulta única já traz.
 *
 * Este arquivo tinha duas fábricas — uma por tabela — e os testes provavam que
 * os dois formatos chegavam ao mesmo lugar. Depois da convergência não há dois
 * formatos: o que era exclusivo de uma fonte virou coluna opcional, e é isso
 * que os testes passam a exercitar.
 */
function task(overrides: Partial<TaskRow> = {}): ActivityOverviewItem {
  const item = {
    id: "task-1",
    noticeId: null,
    sharedActivityId: null,
    profileId: "profile-1",
    profileName: "Ana",
    createdByUserId: ME,
    assignedToUserId: null,
    assignedName: null,
    type: "material",
    status: "pending",
    title: "Levar garrafa de água",
    description: null,
    dueAt: null,
    time: null,
    location: null,
    dateOrigin: "unspecified",
    sourceExcerpt: null,
    version: 1,
    createdAt: new Date("2026-09-14T12:00:00Z"),
    subjectId: null,
    profileSubjectId: null,
    subjectName: null,
    subjectColorIndex: null,
    noticeSource: null,
    visibility: null,
    turmaId: null,
    schoolName: null,
    grade: null,
    classLetter: null,
    year: null,
    ...overrides,
  } as TaskRow;
  return { key: item.id, item };
}

/** A tarefa que executa uma atividade publicada numa turma. */
function schoolTask(overrides: Partial<TaskRow> = {}): ActivityOverviewItem {
  return task({
    id: "task-escolar",
    sharedActivityId: "activity-1",
    turmaId: "turma-1",
    subjectId: "subject-1",
    subjectName: "Matemática",
    subjectColorIndex: 1,
    schoolName: "Escola Teste",
    grade: "5ano",
    classLetter: "A",
    year: 2026,
    type: "task",
    visibility: "individual",
    title: "Páginas 32 e 33",
    dueAt: "2026-09-20",
    dateOrigin: "school",
    ...overrides,
  });
}

describe("toActivityView", () => {
  it("dá o mesmo formato à atividade da escola e à que veio de recado", () => {
    const school = toActivityView(schoolTask(), ME);
    const notice = toActivityView(task({ noticeId: "notice-1", noticeSource: "teams" }), ME);
    expect(Object.keys(school).sort()).toEqual(Object.keys(notice).sort());
  });

  it("aponta toda atividade para o mesmo detalhe, seja qual for a origem", () => {
    expect(toActivityView(schoolTask(), ME).detailHref).toBe("/atividades/task-escolar");
    expect(toActivityView(task(), ME).detailHref).toBe("/atividades/task-1");
  });

  it("preserva o prazo ausente como dado, e não como erro", () => {
    expect(toActivityView(task(), ME).dueAt).toBeNull();
  });

  it("não oferece alternância para o que foi cancelado, venha de onde vier", () => {
    expect(toActivityView(schoolTask({ status: "canceled" }), ME).toggle).toBeNull();
    expect(toActivityView(task({ status: "canceled" }), ME).toggle).toBeNull();
  });

  it("manda a versão junto ao alternar, para detectar conflito", () => {
    expect(toActivityView(task({ version: 4 }), ME).toggle).toEqual({ id: "task-1", version: 4 });
  });

  it("só oferece o menu de ações a quem criou a atividade", () => {
    expect(toActivityView(schoolTask(), ME).manage).not.toBeNull();
    expect(toActivityView(schoolTask({ createdByUserId: OTHER }), ME).manage).toBeNull();
  });

  it("mostra a turma quando a atividade foi publicada numa, e extracurricular quando não", () => {
    expect(toActivityView(schoolTask(), ME).contextLine).toBe("5º ano A · 2026");
    expect(toActivityView(task({ profileSubjectId: "ps-1" }), ME).contextLine).toBe(
      "extracurricular",
    );
    expect(toActivityView(task(), ME).contextLine).toBeNull();
  });

  it("descreve a procedência do recado sem repetir o óbvio", () => {
    // Sem origem e planejada pela família, dizer a procedência do prazo é ruído.
    expect(
      toActivityView(task({ dateOrigin: "family", dueAt: "2026-09-20" }), ME).provenance,
    ).toBeNull();
    expect(
      toActivityView(task({ noticeSource: "teams", dateOrigin: "school", dueAt: "2026-09-20" }), ME)
        .provenance,
    ).toBe("Microsoft Teams · Informado no original");
  });
});

describe("getViewDueBadge", () => {
  const now = new Date("2026-09-14T12:00:00-03:00");

  it("mostra prazo a confirmar quando não há data", () => {
    const badge = getViewDueBadge(toActivityView(task(), ME), now);
    expect(badge).toEqual({ label: "Prazo a confirmar", variant: "muted" });
  });

  it("marca atraso", () => {
    const view = toActivityView(schoolTask({ dueAt: "2026-09-01" }), ME);
    expect(getViewDueBadge(view, now).variant).toBe("destructive");
    expect(getViewDueBadge(view, now).label).toContain("Atrasada");
  });

  it("junta a hora ao prazo quando existe", () => {
    const view = toActivityView(task({ dueAt: "2026-09-14", time: "08:00" }), ME);
    expect(getViewDueBadge(view, now).label).toBe("Hoje · 14/09 às 08:00");
  });

  it("não mostra urgência no que foi cancelado", () => {
    const view = toActivityView(task({ status: "canceled", dueAt: "2026-09-01" }), ME);
    expect(getViewDueBadge(view, now)).toEqual({ label: "Cancelada", variant: "muted" });
  });
});
