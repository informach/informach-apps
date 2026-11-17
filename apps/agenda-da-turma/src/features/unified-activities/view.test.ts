import { describe, expect, it } from "vitest";
import type { ActivityOverviewItem } from "./overview-types";
import type { TaskRow } from "./task-repository";
import { toActivityView } from "./view";

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
  const item: TaskRow = {
    id: "task-1",
    familyGroupId: "family-1",
    canWrite: true,
    estimatedMinutes: null,
    recurrence: "none",
    reminderAt: null,
    editedAfterSave: false,
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
  };
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
    const school = toActivityView(schoolTask());
    const notice = toActivityView(task({ noticeId: "notice-1", noticeSource: "teams" }));
    expect(Object.keys(school).sort()).toEqual(Object.keys(notice).sort());
  });

  it("aponta toda atividade para o mesmo detalhe, seja qual for a origem", () => {
    expect(toActivityView(schoolTask()).detailHref).toBe("/atividades/task-escolar");
    expect(toActivityView(task()).detailHref).toBe("/atividades/task-1");
  });

  it("preserva o prazo ausente como dado, e não como erro", () => {
    expect(toActivityView(task()).dueAt).toBeNull();
  });

  it("não oferece alternância para o que foi cancelado, venha de onde vier", () => {
    expect(toActivityView(schoolTask({ status: "canceled" })).toggle).toBeNull();
    expect(toActivityView(task({ status: "canceled" })).toggle).toBeNull();
  });

  it("manda a versão junto ao alternar, para detectar conflito", () => {
    expect(toActivityView(task({ version: 4 })).toggle).toEqual({ id: "task-1", version: 4 });
  });

  it("oferece o menu de ações conforme a permissão atual de escrita", () => {
    expect(toActivityView(schoolTask()).manage).not.toBeNull();
    expect(
      toActivityView(schoolTask({ createdByUserId: OTHER, canWrite: false })).manage,
    ).toBeNull();
  });

  it("mostra a turma quando a atividade foi publicada numa, e fora da escola quando não", () => {
    expect(toActivityView(schoolTask()).contextLine).toBe("5º ano A · 2026");
    expect(toActivityView(task({ profileSubjectId: "ps-1" })).contextLine).toBe("fora da escola");
    expect(toActivityView(task()).contextLine).toBeNull();
  });

  it("descreve a procedência do recado sem repetir o óbvio", () => {
    // Sem origem e planejada pela família, dizer a procedência do prazo é ruído.
    expect(
      toActivityView(task({ dateOrigin: "family", dueAt: "2026-09-20" })).provenance,
    ).toBeNull();
    expect(
      toActivityView(task({ noticeSource: "teams", dateOrigin: "school", dueAt: "2026-09-20" }))
        .provenance,
    ).toBe("Microsoft Teams · A escola disse");
  });
});

describe("o prazo na lista", () => {
  // O chip de prazo saiu deste adaptador para `due.ts`, testado à parte. Aqui
  // fica a garantia de que a vista entrega o que ele precisa.
  it("entrega data, hora e situação sem traduzir", () => {
    const view = toActivityView(task({ dueAt: "2026-09-14", time: "08:00" }));
    expect({ dueAt: view.dueAt, time: view.time, status: view.status }).toEqual({
      dueAt: "2026-09-14",
      time: "08:00",
      status: "pending",
    });
  });

  it("diz quem cuida pelo nome, sem rótulo", () => {
    expect(toActivityView(task({ assignedName: "Leo" })).assignedName).toBe("Leo");
    expect(toActivityView(task()).assignedName).toBeNull();
  });
});

it("does not offer a mutation to a read-only adult, even for their own old task", () => {
  const view = toActivityView(task({ canWrite: false, createdByUserId: ME }));
  expect(view.manage).toBeNull();
  expect(view.toggle).toBeNull();
});
it("offers current writers the shared family task regardless of who typed it", () => {
  expect(toActivityView(task({ canWrite: true, createdByUserId: OTHER })).manage).not.toBeNull();
});
