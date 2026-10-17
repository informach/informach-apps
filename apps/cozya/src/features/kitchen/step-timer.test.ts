import { describe, expect, it } from "vitest";
import { minutesInStep } from "./step-timer";

describe("tempo pedido no passo", () => {
  it.each([
    ["Volte o frango e cozinhe por 10 minutos.", 10],
    ["Asse a 200 °C por 50 minutos, virando na metade.", 50],
    ["Cozinhe de 15 a 20 minutos.", 15],
    ["Deixe descansar por 5 min.", 5],
    ["Leve ao forno por meia hora.", 30],
    ["Deixe de molho por 8 horas e descarte a água.", 480],
    ["Asse por 1h30 em forno médio.", 90],
    ["Asse por 1 hora e 30 minutos.", 90],
    ["Cozinhe por 1h 30min na pressão.", 90],
    ["Deixe assar por 1 hora e meia.", 90],
    ["Asse por uma hora e meia.", 90],
    ["Asse por 2 horas a 180 °C.", 120],
    ["Cozinhe por uma hora em fogo baixo.", 60],
  ])("%s", (text, minutes) => {
    expect(minutesInStep(text)).toBe(minutes);
  });
  it.each([
    "Bata os ovos e misture o queijo.",
    "Aqueça o forno a 200 °C.",
    "Corte 2 cebolas em rodelas.",
  ])("sem tempo: %s", (text) => {
    expect(minutesInStep(text)).toBeNull();
  });
});
