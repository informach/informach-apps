import { describe, expect, it } from "vitest";
import { criarMundoDaProva } from "../testes";
import { abrirFotografia, conferirMetadadosDaFotografia, VERSAO_DO_MUNDO } from "./fotografia";

describe("metadados da fotografia original", () => {
  const foto = () => criarMundoDaProva().fotografar();
  const esperado = (documento: ReturnType<typeof foto>) => ({
    mundoId: documento.mundoId,
    tick: documento.tick,
    versaoDoMundo: documento.estado.versao,
  });

  it("confere os bytes originais sem modificá-los e conserva o mundo restaurável", () => {
    const documento = foto();
    const antes = JSON.stringify(documento);
    expect(conferirMetadadosDaFotografia(documento, esperado(documento))).toBe(true);
    expect(JSON.stringify(documento)).toBe(antes);
    expect(abrirFotografia(documento)).toEqual(documento);
  });

  it("confere a versão original sem autorizar a leitura de um formato futuro", () => {
    const documento = foto();
    const versaoFutura = VERSAO_DO_MUNDO + 1;
    const futuro = { ...documento, estado: { ...documento.estado, versao: versaoFutura } };
    expect(conferirMetadadosDaFotografia(futuro, esperado(documento))).toBe(false);
    expect(
      conferirMetadadosDaFotografia(futuro, {
        ...esperado(documento),
        versaoDoMundo: versaoFutura,
      }),
    ).toBe(true);
    expect(() => abrirFotografia(futuro)).toThrow(`lê até a versão ${VERSAO_DO_MUNDO}`);
  });

  it("recusa mundo, relógio, tick, versão e envelope divergentes ou incompletos", () => {
    const documento = foto();
    const adulterados: unknown[] = [
      null,
      {},
      { ...documento, mundoId: "outro" },
      { ...documento, estado: { ...documento.estado, id: "outro" } },
      { ...documento, tick: documento.tick + 1 },
      {
        ...documento,
        estado: { ...documento.estado, relogio: { ...documento.estado.relogio, tick: 1 } },
      },
      { ...documento, estado: { ...documento.estado, versao: VERSAO_DO_MUNDO + 1 } },
      { ...documento, versao: 2 },
      { ...documento, estado: { ...documento.estado, relogio: null } },
    ];
    for (const adulterado of adulterados)
      expect(conferirMetadadosDaFotografia(adulterado, esperado(documento))).toBe(false);
    expect(conferirMetadadosDaFotografia(documento, { ...esperado(documento), tick: 1 })).toBe(
      false,
    );
  });
});
