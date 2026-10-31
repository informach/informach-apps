import { describe, expect, it } from "vitest";
import {
  inicioDaSemana,
  inicioDoDiaLocal,
  relogioLocal,
  sequenciaDeDias,
  somarDias,
} from "./datas";

const fuso = "America/Sao_Paulo";

describe("datas no fuso da família", () => {
  it("usa a data local, não a de UTC", () => {
    // 02:00 UTC de sábado ainda é 23:00 de sexta em São Paulo
    const t = Date.parse("2026-10-31T02:00:00Z");
    expect(relogioLocal(t, fuso)).toEqual({ data: "2026-10-30", hora: 23, diaDaSemana: 5 });
  });
  it("segunda-feira da semana", () => {
    expect(inicioDaSemana(Date.parse("2026-11-01T15:00:00Z"), fuso)).toBe("2026-10-26");
    expect(inicioDaSemana(Date.parse("2026-11-02T15:00:00Z"), fuso)).toBe("2026-11-02");
  });
  it("início do dia local em UTC", () => {
    expect(inicioDoDiaLocal("2026-10-30", fuso).toISOString()).toBe("2026-10-30T03:00:00.000Z");
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("sequência termina hoje ou ontem", () => {
    const agora = Date.parse("2026-10-30T15:00:00Z");
    const dia = 86_400_000;
    expect(
      sequenciaDeDias([agora, agora - dia, agora - 2 * dia, agora - 4 * dia], agora, fuso),
    ).toBe(3);
    expect(sequenciaDeDias([agora - dia, agora - 2 * dia], agora, fuso)).toBe(2);
    expect(sequenciaDeDias([agora - 3 * dia], agora, fuso)).toBe(0);
  });
});
