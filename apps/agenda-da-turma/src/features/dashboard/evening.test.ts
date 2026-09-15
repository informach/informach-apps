import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appHour, EVENING_HOUR, isEveningInApp } from "./date";

/**
 * A hora que decide a ordem do dashboard.
 *
 * Mesma regra do resto do módulo: o fuso é o do app, nunca o do processo. O
 * servidor roda em UTC, então às 21h de Brasília ele já está no dia seguinte —
 * e uma leitura de `getHours()` acharia que já é de madrugada, devolvendo a
 * ordem do começo do dia bem na hora em que a mochila importa.
 */
describe("appHour e isEveningInApp", () => {
  const originalTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "UTC";
  });
  afterAll(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it("lê a hora em São Paulo, e não a do processo", () => {
    // 2026-05-11T02:30:00Z === 10/05/2026, 23h30 em São Paulo.
    expect(appHour(new Date("2026-05-11T02:30:00Z"))).toBe(23);
    // 2026-05-11T12:00:00Z === 09h em São Paulo.
    expect(appHour(new Date("2026-05-11T12:00:00Z"))).toBe(9);
  });

  it("devolve 0 à meia-noite, e não 24", () => {
    // 2026-05-11T03:00:00Z === 00h00 em São Paulo.
    expect(appHour(new Date("2026-05-11T03:00:00Z"))).toBe(0);
  });

  it("vira para a noite às 18h e continua até a meia-noite", () => {
    // 20h59 UTC === 17h59 em São Paulo: ainda é dia.
    expect(isEveningInApp(new Date("2026-05-11T20:59:00Z"))).toBe(false);
    // 21h00 UTC === 18h00 em São Paulo: vira.
    expect(isEveningInApp(new Date("2026-05-11T21:00:00Z"))).toBe(true);
    // 02h30 UTC do dia seguinte === 23h30 em São Paulo: continua noite.
    expect(isEveningInApp(new Date("2026-05-12T02:30:00Z"))).toBe(true);
  });

  it("volta a ser dia depois da meia-noite", () => {
    // 04h00 UTC === 01h00 em São Paulo.
    expect(isEveningInApp(new Date("2026-05-12T04:00:00Z"))).toBe(false);
  });

  it("usa o limite declarado", () => {
    expect(EVENING_HOUR).toBe(18);
  });
});
