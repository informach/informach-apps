import { describe, expect, it } from "vitest";
import { buildDailyDigest, buildReminder, type DigestItem, digestLine, whenPhrase } from "./digest";

// Segunda-feira, 19 de outubro de 2026.
const today = "2026-10-19";
const item = (patch: Partial<DigestItem> = {}): DigestItem => ({
  profileName: "Clara",
  title: "Páginas 32 e 33 do livro",
  subjectName: "Matemática",
  dueAt: today,
  time: null,
  assignedName: null,
  ...patch,
});

describe("whenPhrase", () => {
  it("says the day the way the family says it", () => {
    expect(whenPhrase({ dueAt: today, time: null }, today)).toBe("para hoje");
    expect(whenPhrase({ dueAt: today, time: "08:00" }, today)).toBe("para hoje às 8h");
    expect(whenPhrase({ dueAt: "2026-10-20", time: null }, today)).toBe("para amanhã");
    expect(whenPhrase({ dueAt: "2026-10-16", time: null }, today)).toBe(
      "passou do prazo (sex, 16)",
    );
    expect(whenPhrase({ dueAt: "2026-10-22", time: "14:30" }, today)).toBe("para qui, 22 às 14h30");
    expect(whenPhrase({ dueAt: null, time: null }, today)).toBe("sem data marcada");
  });
});

describe("digestLine", () => {
  it("names child and subject, and who takes care only when someone does", () => {
    expect(digestLine(item(), today)).toBe("Clara · Matemática: Páginas 32 e 33 do livro, para hoje.");
    expect(digestLine(item({ subjectName: null, assignedName: "Ana" }), today)).toBe(
      "Clara: Páginas 32 e 33 do livro, para hoje. Ana cuida.",
    );
  });
  it("never prints a raw ISO date", () => {
    expect(digestLine(item({ dueAt: "2026-10-16" }), today)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

describe("buildDailyDigest", () => {
  it("is honest about what it covers", () => {
    expect(buildDailyDigest([item()], { todayIso: today })?.title).toBe("Para hoje: 1 atividade");
    expect(buildDailyDigest([item({ dueAt: "2026-10-20" })], { todayIso: today })?.title).toBe(
      "Amanhã: 1 atividade",
    );
    expect(
      buildDailyDigest([item(), item({ dueAt: "2026-10-20", title: "Outra" })], { todayIso: today })
        ?.title,
    ).toBe("Hoje e amanhã: 2 atividades");
  });
  it("leaves the rest of the week to the weekly digest", () => {
    expect(buildDailyDigest([item({ dueAt: "2026-10-22" })], { todayIso: today })).toBeNull();
    expect(buildDailyDigest([], { todayIso: today })).toBeNull();
  });
  it("reads late first, then today, undated, and tomorrow", () => {
    const digest = buildDailyDigest(
      [
        item({ title: "Amanhã", dueAt: "2026-10-20" }),
        item({ title: "Sem data", dueAt: null }),
        item({ title: "Hoje" }),
        item({ title: "Atrasada", dueAt: "2026-10-16" }),
      ],
      { todayIso: today },
    );
    expect(digest?.lines.map((line) => line.split(": ")[1]?.split(",")[0])).toEqual([
      "Atrasada",
      "Hoje",
      "Sem data",
      "Amanhã",
    ]);
  });
  it("keeps children and activities off the lock screen", () => {
    const digest = buildDailyDigest(
      [item(), item({ dueAt: "2026-10-16" }), item({ dueAt: "2026-10-20" })],
      { todayIso: today },
    );
    expect(digest?.push).toEqual({
      title: "Hoje e amanhã na Agenda",
      body: "1 para hoje, 1 passou do prazo e 1 para amanhã.",
    });
    expect(JSON.stringify(digest?.push)).not.toMatch(/Clara|Matemática|Páginas/);
  });
  it("caps the e-mail at twenty lines", () => {
    const many = Array.from({ length: 23 }, (_, i) => item({ title: `Item ${i}` }));
    const lines = buildDailyDigest(many, { todayIso: today })?.lines ?? [];
    expect(lines).toHaveLength(21);
    expect(lines.at(-1)).toBe("Mais 3 atividades. Abra a Agenda para ver todas.");
  });
});

describe("buildReminder", () => {
  it("names the activity in the e-mail and only the day on the lock screen", () => {
    const reminder = buildReminder(item({ title: "Enviar autorização", dueAt: "2026-10-20" }), {
      todayIso: today,
    });
    expect(reminder.title).toBe("Lembrete: Enviar autorização (Clara)");
    expect(reminder.push).toEqual({
      title: "Lembrete da Agenda",
      body: "Uma atividade é para amanhã.",
    });
  });
});
