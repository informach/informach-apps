import { describe, expect, it } from "vitest";
import { taskToActionInput } from "./edit-defaults";
import type { TaskRow } from "./task-repository";

/**
 * O teste que faltava quando a duração foi apagada na edição.
 *
 * Ele enumera os campos de propósito: acrescentar uma coluna ao formulário sem
 * trazê-la para `taskToActionInput` passa a quebrar aqui, em vez de apagar o
 * dado de alguém silenciosamente na primeira edição.
 */
const task = {
  id: "11111111-1111-4111-8111-111111111111",
  noticeId: null,
  sharedActivityId: null,
  profileId: "22222222-2222-4222-8222-222222222222",
  profileName: "Ana",
  ownerUserId: "owner",
  createdByUserId: "owner",
  assignedToUserId: "guest",
  assignedName: "Segundo adulto",
  type: "project",
  status: "pending",
  title: "Trabalho de Ciências",
  description: "Maquete do sistema solar",
  dueAt: "2026-05-20",
  time: "14:30",
  estimatedMinutes: 30,
  location: "Sala 3",
  dateOrigin: "school",
  sourceExcerpt: "trecho do recado",
  recurrence: "weekly",
  reminderAt: new Date("2026-05-19T21:00:00Z"),
  version: 2,
  createdAt: new Date("2026-05-10T12:00:00Z"),
  subjectId: "33333333-3333-4333-8333-333333333333",
  profileSubjectId: null,
  subjectName: "Ciências",
  subjectColorIndex: 3,
  noticeSource: null,
  visibility: null,
  turmaId: null,
  schoolName: null,
  grade: null,
  classLetter: null,
  year: null,
} as unknown as TaskRow;

describe("taskToActionInput", () => {
  it("devolve cada campo editável como está gravado", () => {
    expect(taskToActionInput(task)).toEqual({
      profileId: task.profileId,
      type: "project",
      title: "Trabalho de Ciências",
      description: "Maquete do sistema solar",
      subjectId: task.subjectId,
      profileSubjectId: null,
      dueAt: "2026-05-20",
      dateOrigin: "school",
      time: "14:30",
      estimatedMinutes: 30,
      location: "Sala 3",
      sourceExcerpt: "trecho do recado",
      assignedToUserId: "guest",
      reminderAt: "2026-05-19T21:00:00.000Z",
      recurrence: "weekly",
      shareWithTurma: false,
    });
  });

  it("não apaga a duração escolhida pela família", () => {
    // O defeito exato: um `null` fixo aqui chegava ao banco pelo spread do
    // `updateNoticeAction`, e o chip sumia do card depois de uma edição de
    // título.
    expect(taskToActionInput(task).estimatedMinutes).toBe(30);
    expect(taskToActionInput({ ...task, estimatedMinutes: null }).estimatedMinutes).toBeNull();
  });

  it("marca a caixa de compartilhar quando a atividade foi publicada na turma", () => {
    expect(taskToActionInput(task).shareWithTurma).toBe(false);
    expect(
      taskToActionInput({ ...task, sharedActivityId: "44444444-4444-4444-8444-444444444444" })
        .shareWithTurma,
    ).toBe(true);
  });

  it("aceita sobrescrita, para o chamador ajustar um campo sem remontar o resto", () => {
    const edited = taskToActionInput(task, { title: "Outro título" });
    expect(edited.title).toBe("Outro título");
    expect(edited.estimatedMinutes).toBe(30);
  });

  it("preserva repetição semanal e lembrete", () => {
    // O defeito irmão do da duração, um degrau antes: `taskSelect` não projetava
    // essas colunas, então o formulário gravava "none"/null por cima e uma
    // atividade semanal editada pelo detalhe virava avulsa.
    const result = taskToActionInput(task);
    expect(result.recurrence).toBe("weekly");
    expect(result.reminderAt).toBe("2026-05-19T21:00:00.000Z");
  });

  it("aceita atividade sem repetição nem lembrete", () => {
    const plain = taskToActionInput({ ...task, recurrence: "none", reminderAt: null });
    expect(plain.recurrence).toBe("none");
    expect(plain.reminderAt).toBeNull();
  });
});
