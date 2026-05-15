import { describe, expect, it } from "vitest";
import type { UnifiedActivityListItem } from "@/features/unified-activities/types";
import { applyDashboardStatusSuccess } from "./optimistic";
import type { DashboardSnapshot } from "./types";

const baseItem: UnifiedActivityListItem = {
  source: "turma",
  activityId: "activity-1",
  statusId: "status-1",
  status: "pending",
  studentProfileId: "profile-1",
  studentProfileName: "Ana",
  turmaId: "turma-1",
  subjectId: "subject-1",
  subjectName: "Matematica",
  subjectColorIndex: 1,
  schoolName: "Escola",
  grade: "5",
  classLetter: "A",
  year: 2026,
  type: "task",
  visibility: "individual",
  title: "Lista",
  description: null,
  dueAt: "2026-05-15",
  activityCreatedAt: new Date("2026-05-01T12:00:00.000Z"),
  createdByUserId: "user-1",
  hasOtherAcceptances: false,
};

function snapshot(overrides: Partial<DashboardSnapshot> = {}): DashboardSnapshot {
  return {
    todayIso: "2026-05-15",
    counters: {
      overdue: 2,
      today: 1,
      week: 3,
      doneRecent: 4,
    },
    overdue: [],
    today: [],
    upcoming: [],
    perProfile: [
      {
        profileId: "profile-1",
        profileName: "Ana",
        pending: 6,
        overdue: 2,
        doneTotal: 4,
        totalAll: 10,
        progressPercent: 40,
      },
    ],
    ...overrides,
  };
}

describe("applyDashboardStatusSuccess", () => {
  it("moves a today pending item into recent done counters", () => {
    const result = applyDashboardStatusSuccess(
      snapshot({ today: [baseItem] }),
      baseItem,
      "pending",
      "done",
    );

    expect(result.counters).toEqual({
      overdue: 2,
      today: 0,
      week: 3,
      doneRecent: 5,
    });
    expect(result.perProfile[0]).toMatchObject({
      pending: 5,
      overdue: 2,
      doneTotal: 5,
      totalAll: 10,
      progressPercent: 50,
    });
    expect(result.today).toEqual([]);
  });

  it("does not count a future week item as recently done", () => {
    const result = applyDashboardStatusSuccess(
      snapshot(),
      { ...baseItem, dueAt: "2026-05-20" },
      "pending",
      "done",
    );

    expect(result.counters.week).toBe(2);
    expect(result.counters.doneRecent).toBe(4);
  });

  it("updates overdue progress when an overdue item is completed", () => {
    const result = applyDashboardStatusSuccess(
      snapshot(),
      { ...baseItem, dueAt: "2026-05-14" },
      "pending",
      "done",
    );

    expect(result.counters.overdue).toBe(1);
    expect(result.counters.doneRecent).toBe(5);
    expect(result.perProfile[0]).toMatchObject({
      pending: 5,
      overdue: 1,
      doneTotal: 5,
      progressPercent: 50,
    });
  });

  it("reverses optimistic counters when a done item returns to pending", () => {
    const result = applyDashboardStatusSuccess(snapshot(), baseItem, "done", "pending");

    expect(result.counters.today).toBe(2);
    expect(result.counters.doneRecent).toBe(3);
    expect(result.perProfile[0]).toMatchObject({
      pending: 7,
      doneTotal: 3,
      totalAll: 10,
      progressPercent: 30,
    });
  });
});
