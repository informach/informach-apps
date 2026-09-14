import { describe, expect, it } from "vitest";
import { FREE_NOTICE_TRIAL, TRIAL_GRANT_AMOUNTS, voiceFitsInTrial } from "./trial-reserve";

/**
 * A aritmética da franquia ficou sem cobertura e o ditado quebrou por causa
 * dela: o saldo era medido antes da concessão que o financia, então toda conta
 * gratuita era recusada na primeira tentativa — e para sempre, já que a
 * concessão só viria depois de uma admissão que nunca passava.
 *
 * Estes testes fixam as duas propriedades que importam: quem acabou de chegar
 * consegue ditar, e a leitura do recado nunca fica sem crédito.
 */
describe("voiceFitsInTrial", () => {
  it("admite o ditado de quem acabou de receber a franquia", () => {
    const available = TRIAL_GRANT_AMOUNTS.voice;
    expect(voiceFitsInTrial(available, FREE_NOTICE_TRIAL)).toBe(true);
  });

  it("recusa quando gastar deixaria alguma importação sem crédito", () => {
    // Sobram 3 importações e 3 créditos: gastar um no ditado deixaria 2 para 3.
    expect(voiceFitsInTrial(3, 3)).toBe(false);
  });

  it("admite quando ainda sobra um crédito por importação restante", () => {
    expect(voiceFitsInTrial(4, 3)).toBe(true);
  });

  it("recusa com saldo zerado", () => {
    expect(voiceFitsInTrial(0, FREE_NOTICE_TRIAL)).toBe(false);
  });

  it("financia todo o teste feito só por voz", () => {
    // Cinco importações ditadas custam transcrição + leitura cada.
    const granted = TRIAL_GRANT_AMOUNTS.voice + TRIAL_GRANT_AMOUNTS.base;
    expect(granted).toBeGreaterThanOrEqual(FREE_NOTICE_TRIAL * 2);
  });

  it("deixa margem para regravar, que é como se dita", () => {
    // Mais de uma transcrição por importação, senão errar a frase uma vez já
    // consumiria a importação inteira.
    expect(TRIAL_GRANT_AMOUNTS.voice).toBeGreaterThan(FREE_NOTICE_TRIAL);
  });
});
