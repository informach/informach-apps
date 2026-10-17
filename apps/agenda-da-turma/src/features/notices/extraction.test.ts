import { describe, expect, it } from "vitest";
import { validateNoticeExtraction } from "./extraction";
import { actionFieldsSchema, dateSchema, parseNoticeSchema } from "./schemas";

const action = {
  type: "authorization" as const,
  title: "Entregar autorização",
  description: null,
  dueAt: "2026-09-16",
  dateOrigin: "school" as const,
  time: null,
  location: null,
  sourceExcerpt: "Enviar autorização até 16/09/2026.",
};
describe("school notice date provenance", () => {
  it.each(["Anotado em 15/09/2026", "Data da anotação: 15/09/2026", "Escrito em 2026-09-15"])(
    "uses an explicit writing date for notebook deadlines: %s",
    (sourceExcerpt) => {
      const result = validateNoticeExtraction(
        {
          actions: [
            {
              ...action,
              type: "task",
              dateOrigin: "relative",
              sourceExcerpt: "Para casa: entregar amanhã.",
            },
          ],
          warnings: [],
          publicationReference: { date: "2026-09-15", sourceExcerpt },
        },
        null,
      );
      expect(result.actions[0]?.dueAt).toBe("2026-09-16");
      expect(result.publicationReference?.date).toBe("2026-09-15");
    },
  );
  it.each(["Foto tirada em 15/09/2026", "15/09/2026", "Prova em 15/09/2026"])(
    "does not infer a notebook writing date from %s",
    (sourceExcerpt) => {
      const result = validateNoticeExtraction(
        {
          actions: [{ ...action, dateOrigin: "relative" }],
          warnings: [],
          publicationReference: { date: "2026-09-15", sourceExcerpt },
        },
        null,
      );
      expect(result.actions[0]?.dueAt).toBeNull();
      expect(result.publicationReference).toBeNull();
    },
  );
  it("accepts a notebook photo with no typed text", () => {
    expect(
      parseNoticeSchema.safeParse({
        profileId: "f2eb50ee-b7b1-44b0-a20e-2261b382f8ee",
        source: "notebook",
        text: "",
        attachment: { name: "agenda.png", dataUrl: "data:image/png;base64,iVBORw0KGgo=" },
      }).success,
    ).toBe(true);
  });
  it("uses a publication identified in the original when the separate field is empty", () => {
    const result = validateNoticeExtraction(
      {
        actions: [{ ...action, dateOrigin: "relative", sourceExcerpt: "Entregar amanhã." }],
        publicationReference: { date: "2026-09-15", sourceExcerpt: "Publicado em 15/09/2026." },
        warnings: [],
      },
      null,
    );
    expect(result.actions[0]?.dueAt).toBe("2026-09-16");
    expect(result.publicationReference?.date).toBe("2026-09-15");
  });
  it.each(["Passeio em 15/09/2026", "Publicado em 10/09/2026"])(
    "does not accept unsupported publication evidence: %s",
    (sourceExcerpt) => {
      const result = validateNoticeExtraction(
        {
          actions: [{ ...action, dateOrigin: "relative" }],
          publicationReference: { date: "2026-09-15", sourceExcerpt },
          warnings: [],
        },
        null,
      );
      expect(result.actions[0]?.dueAt).toBeNull();
      expect(result.publicationReference).toBeNull();
      expect(result.warnings.some((w) => w.includes("publicação"))).toBe(true);
    },
  );
  it("requires confirmation when the supplied publication conflicts with the original", () => {
    const result = validateNoticeExtraction(
      {
        actions: [{ ...action, dateOrigin: "relative" }],
        publicationReference: { date: "2026-09-15", sourceExcerpt: "Publicado em 15/09/2026." },
        warnings: [],
      },
      "2026-09-14",
    );
    expect(result.actions[0]?.dueAt).toBeNull();
    expect(result.warnings.some((w) => w.includes("diverge"))).toBe(true);
  });
  it("keeps independent deadlines and an unspecified material date", () => {
    const result = validateNoticeExtraction(
      {
        actions: [
          action,
          {
            ...action,
            type: "event",
            dueAt: "2026-09-18",
            time: "08:00",
            sourceExcerpt: "Passeio em 18/09/2026 às 8h.",
          },
          {
            ...action,
            type: "material",
            dueAt: null,
            dateOrigin: "unspecified",
            sourceExcerpt: "Levar boné.",
          },
        ],
        warnings: [],
      },
      "2026-09-11",
    );
    expect(result.actions.map((a) => a.dueAt)).toEqual(["2026-09-16", "2026-09-18", null]);
  });
  it("does not treat today as the publication date of an old message", () => {
    const value = {
      actions: [
        { ...action, dateOrigin: "relative", sourceExcerpt: "Entregar amanhã", time: "08:00" },
      ],
      warnings: [],
    };
    expect(validateNoticeExtraction(value, null).actions[0]).toMatchObject({
      dueAt: null,
      time: null,
      dateOrigin: "unspecified",
    });
    expect(validateNoticeExtraction(value, "2026-09-15").actions[0]?.dueAt).toBe("2026-09-16");
  });
  it("requires source evidence for a date attributed to the school", () => {
    expect(
      validateNoticeExtraction(
        { actions: [{ ...action, sourceExcerpt: null }], warnings: [] },
        null,
      ).actions[0]?.dueAt,
    ).toBeNull();
  });
  it.each(["2026-02-29", "2026-09-31", "2026-00-12"])("rejects impossible date %s", (date) => {
    expect(dateSchema.safeParse(date).success).toBe(false);
  });
  it("accepts leap day and empty deadline without requiring a subject", () => {
    expect(dateSchema.safeParse("2028-02-29").success).toBe(true);
    expect(
      actionFieldsSchema.safeParse({
        ...action,
        profileId: "f2eb50ee-b7b1-44b0-a20e-2261b382f8ee",
        dueAt: null,
        dateOrigin: "unspecified",
      }).success,
    ).toBe(true);
  });
  it("rejects recurrence, time and reminders without a date", () => {
    for (const extra of [
      { recurrence: "weekly" },
      { time: "08:00" },
      { reminderAt: "2026-09-15T22:00:00Z" },
    ]) {
      expect(
        actionFieldsSchema.safeParse({
          ...action,
          profileId: "f2eb50ee-b7b1-44b0-a20e-2261b382f8ee",
          dueAt: null,
          dateOrigin: "unspecified",
          ...extra,
        }).success,
      ).toBe(false);
    }
  });
  it("accepts message plus attachment but rejects credential-bearing source links", () => {
    const input = {
      profileId: "f2eb50ee-b7b1-44b0-a20e-2261b382f8ee",
      source: "teams",
      text: "Leia o anexo",
      attachment: {
        name: "recado.pdf",
        dataUrl: "data:application/pdf;base64,JVBERi0=",
        pages: [2],
      },
    };
    expect(parseNoticeSchema.safeParse(input).success).toBe(true);
    expect(
      parseNoticeSchema.safeParse({ ...input, sourceUrl: "https://user:password@example.com/file" })
        .success,
    ).toBe(false);
  });
});

describe("subject hints survive post-processing", () => {
  it("keeps subjectHint when the deadline is dropped for lack of evidence", () => {
    const result = validateNoticeExtraction(
      {
        actions: [
          { ...action, subjectHint: "Ciências", sourceExcerpt: null },
          { ...action, subjectHint: null },
        ],
        warnings: [],
        publicationReference: null,
      },
      null,
    );
    expect(result.actions[0]?.dueAt).toBeNull();
    expect(result.actions[0]?.subjectHint).toBe("Ciências");
    expect(result.actions[1]?.subjectHint).toBeNull();
  });
});
