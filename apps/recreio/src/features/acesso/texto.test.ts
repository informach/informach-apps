import { ESTADOS_DE_ACESSO_LISTA } from "@informach/recreio/contrato";
import { describe, expect, it } from "vitest";
import { dataPorExtenso, descreverAcesso } from "./texto";

const fim = new Date("2026-12-11T15:00:00Z");

describe("texto do direito de jogar", () => {
  it("escreve a data por extenso, no horário de Brasília", () => {
    expect(dataPorExtenso(fim)).toBe("11 de dezembro de 2026");
    // 02:00 UTC ainda é o dia anterior em Brasília.
    expect(dataPorExtenso(new Date("2026-12-12T02:00:00Z"))).toBe("11 de dezembro de 2026");
  });

  it("cortesia vigente diz até quando vale e de onde vem", () => {
    const texto = descreverAcesso(
      { estado: "ATIVO", origem: "concessao", validoAte: fim },
      { fechado: true },
    );
    expect(texto).toMatchObject({ titulo: "Acesso ativo até 11 de dezembro de 2026", tom: "ok" });
    expect(texto.texto).toContain("convite da equipe");
  });

  it("assinatura em dia não inventa data de fim", () => {
    expect(
      descreverAcesso(
        { estado: "ATIVO", origem: "assinatura", validoAte: null },
        { fechado: false },
      ),
    ).toMatchObject({ titulo: "Assinatura ativa", tom: "ok" });
  });

  it("sem concessão, o acesso fechado explica que é por convite", () => {
    expect(
      descreverAcesso({ estado: "SEM_ACESSO", origem: null, validoAte: null }, { fechado: true }),
    ).toMatchObject({ titulo: "Acesso por convite da equipe", tom: "parado" });
    expect(
      descreverAcesso({ estado: "SEM_ACESSO", origem: null, validoAte: null }, { fechado: false })
        .titulo,
    ).not.toContain("convite");
  });

  it("revogado e encerrado dizem coisas diferentes", () => {
    const revogado = descreverAcesso(
      { estado: "REVOGADO", origem: null, validoAte: null },
      { fechado: true },
    );
    const encerrado = descreverAcesso(
      { estado: "ENCERRADO", origem: null, validoAte: null },
      { fechado: true },
    );
    expect(revogado.titulo).toBe("O acesso foi encerrado pela equipe");
    expect(encerrado.titulo).toBe("O seu acesso terminou");
    expect(revogado.tom).toBe("parado");
    expect(encerrado.tom).toBe("parado");
  });

  it("todo estado tem texto, sem travessão, e só os que jogam ficam com tom de ok", () => {
    const jogam = new Set(["ATIVO", "CANCELAMENTO_AGENDADO", "TESTE"]);
    for (const estado of ESTADOS_DE_ACESSO_LISTA)
      for (const fechado of [true, false]) {
        const texto = descreverAcesso({ estado, origem: null, validoAte: fim }, { fechado });
        expect(texto.titulo.length).toBeGreaterThan(0);
        expect(texto.texto.length).toBeGreaterThan(0);
        expect(`${texto.titulo} ${texto.texto}`).not.toMatch(/[—–]/);
        expect(texto.tom).toBe(jogam.has(estado) ? "ok" : "parado");
      }
  });
});
