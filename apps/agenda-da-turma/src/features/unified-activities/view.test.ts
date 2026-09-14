import { describe, expect, it } from "vitest";
import type { ActivityOverviewItem } from "./overview-types";
import { getViewDueBadge, toActivityView } from "./view";

const ME = "user-me";
const OTHER = "user-other";

function turmaEntry(overrides: Record<string, unknown> = {}): ActivityOverviewItem {
  return {
    source: "turma",
    key: "turma:status-1",
    item: {
      version: 1,
      canceledAt: null,
      activityId: "activity-1",
      statusId: "status-1",
      status: "pending",
      studentProfileId: "profile-1",
      studentProfileName: "Ana",
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
      description: null,
      dueAt: "2026-09-20",
      activityCreatedAt: new Date("2026-09-14T12:00:00Z"),
      createdByUserId: ME,
      hasOtherAcceptances: false,
      ...overrides,
    },
  } as ActivityOverviewItem;
}

function noticeEntry(
  action: Record<string, unknown> = {},
  row: Record<string, unknown> = {},
): ActivityOverviewItem {
  return {
    source: "notice",
    key: "notice:action-1",
    item: {
      action: {
        id: "action-1",
        noticeId: "notice-1",
        profileId: "profile-2",
        createdByUserId: ME,
        assignedToUserId: null,
        type: "material",
        subjectId: null,
        profileSubjectId: null,
        title: "Levar garrafa de água",
        description: null,
        dueAt: null,
        time: null,
        location: null,
        dateOrigin: "unspecified",
        sourceExcerpt: null,
        status: "pending",
        completedAt: null,
        reminderAt: null,
        recurrence: "none",
        seriesId: null,
        version: 1,
        fingerprint: "fp",
        createdAt: new Date("2026-09-14T12:00:00Z"),
        updatedAt: new Date("2026-09-14T12:00:00Z"),
        ...action,
      },
      profileName: "Bia",
      ownerUserId: ME,
      source: "teams",
      assignedName: null,
      subjectName: null,
      subjectColorIndex: null,
      ...row,
    },
  } as ActivityOverviewItem;
}

describe("toActivityView", () => {
  it("leva as três fontes ao mesmo formato", () => {
    const turma = toActivityView(turmaEntry(), ME);
    const notice = toActivityView(noticeEntry(), ME);
    expect(Object.keys(turma).sort()).toEqual(Object.keys(notice).sort());
  });

  it("aponta toda atividade para o mesmo detalhe, seja qual for a origem", () => {
    expect(toActivityView(turmaEntry(), ME).detailHref).toBe("/atividades/activity-1");
    expect(toActivityView(noticeEntry(), ME).detailHref).toBe("/atividades/action-1");
  });

  it("preserva o prazo ausente como dado, e não como erro", () => {
    expect(toActivityView(noticeEntry(), ME).dueAt).toBeNull();
  });

  it("trata a atividade escolar cancelada como cancelada, não como pendente", () => {
    const view = toActivityView(turmaEntry({ canceledAt: new Date() }), ME);
    expect(view.status).toBe("canceled");
    // Não se alterna o que foi cancelado.
    expect(view.toggle).toBeNull();
  });

  it("não oferece alternância para providência cancelada", () => {
    expect(toActivityView(noticeEntry({ status: "canceled" }), ME).toggle).toBeNull();
  });

  it("manda a versão junto ao alternar uma providência, para detectar conflito", () => {
    const view = toActivityView(noticeEntry({ version: 4 }), ME);
    expect(view.toggle).toEqual({ kind: "notice", id: "action-1", version: 4 });
  });

  it("só oferece o menu de ações a quem criou a atividade escolar", () => {
    expect(toActivityView(turmaEntry(), ME).manage).not.toBeNull();
    expect(toActivityView(turmaEntry({ createdByUserId: OTHER }), ME).manage).toBeNull();
  });

  it("descreve a procedência do recado sem repetir o óbvio", () => {
    // Sem origem e planejada pela família, dizer a procedência do prazo é ruído.
    expect(
      toActivityView(
        noticeEntry({ dateOrigin: "family", dueAt: "2026-09-20" }, { source: null }),
        ME,
      ).provenance,
    ).toBe("Planejamento da família");
    expect(
      toActivityView(noticeEntry({ dateOrigin: "school", dueAt: "2026-09-20" }), ME).provenance,
    ).toBe("Microsoft Teams · Informado no original");
  });
});

describe("getViewDueBadge", () => {
  const now = new Date("2026-09-14T12:00:00-03:00");

  it("mostra prazo a confirmar quando não há data", () => {
    const badge = getViewDueBadge(toActivityView(noticeEntry(), ME), now);
    expect(badge).toEqual({ label: "Prazo a confirmar", variant: "muted" });
  });

  it("marca atraso", () => {
    const view = toActivityView(turmaEntry({ dueAt: "2026-09-01" }), ME);
    expect(getViewDueBadge(view, now).variant).toBe("destructive");
    expect(getViewDueBadge(view, now).label).toContain("Atrasada");
  });

  it("junta a hora ao prazo quando existe", () => {
    const view = toActivityView(noticeEntry({ dueAt: "2026-09-14", time: "08:00" }), ME);
    expect(getViewDueBadge(view, now).label).toBe("Hoje · 14/09 às 08:00");
  });

  it("não mostra urgência no que foi cancelado", () => {
    const view = toActivityView(noticeEntry({ status: "canceled", dueAt: "2026-09-01" }), ME);
    expect(getViewDueBadge(view, now)).toEqual({ label: "Cancelada", variant: "muted" });
  });
});
