import { describe, expect, it } from "vitest";
import { countStreakDays, STREAK_LOOKBACK_DAYS } from "./streak";

describe("countStreakDays", () => {
  const today = "2026-05-11";

  it("não inventa sequência quando nunca houve conclusão", () => {
    expect(countStreakDays([], today)).toBe(0);
  });

  it("conta hoje quando a família já cuidou de algo hoje", () => {
    expect(countStreakDays([today], today)).toBe(1);
  });

  it("não zera de manhã: a sequência de ontem continua valendo", () => {
    // O dia ainda não começou para esta família. Zerar aqui puniria quem cuidou
    // da rotina ontem só por ainda não ter aberto o app hoje.
    expect(countStreakDays(["2026-05-10", "2026-05-09", "2026-05-08"], today)).toBe(3);
  });

  it("emenda hoje no que já vinha", () => {
    expect(countStreakDays([today, "2026-05-10", "2026-05-09"], today)).toBe(3);
  });

  it("quebra no primeiro dia em branco", () => {
    // 09 ficou de fora: a sequência para em 10.
    expect(countStreakDays([today, "2026-05-10", "2026-05-08", "2026-05-07"], today)).toBe(2);
  });

  it("ignora dias soltos no passado que não emendam", () => {
    expect(countStreakDays(["2026-04-01", "2026-04-02"], today)).toBe(0);
  });

  it("não se confunde com a ordem nem com datas repetidas", () => {
    expect(countStreakDays(["2026-05-09", today, "2026-05-10", today], today)).toBe(3);
  });

  it("atravessa a virada de mês e de ano", () => {
    expect(countStreakDays(["2026-03-01", "2026-02-28", "2026-02-27"], "2026-03-01")).toBe(3);
    expect(countStreakDays(["2027-01-01", "2026-12-31", "2026-12-30"], "2027-01-01")).toBe(3);
  });

  it("para no teto, mesmo com uma sequência maior", () => {
    const dates: string[] = [];
    const d = new Date(Date.UTC(2026, 4, 11));
    for (let i = 0; i < STREAK_LOOKBACK_DAYS + 20; i += 1) {
      dates.push(d.toISOString().slice(0, 10));
      d.setUTCDate(d.getUTCDate() - 1);
    }
    expect(countStreakDays(dates, today)).toBe(STREAK_LOOKBACK_DAYS);
  });
});
