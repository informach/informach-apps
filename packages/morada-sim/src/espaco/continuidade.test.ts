import { describe, expect, it } from "vitest";
import { listar } from "../dominio/tabela";
import { copiar } from "../nucleo/canonico";
import { criarMundoDaProva, criarRoteiro, LIA, moradorDeNome } from "../testes";
import { capturarContinuidadeEspacial, comContinuidadeEspacial } from "./continuidade";

describe("continuidade espacial de uma edição", () => {
  it("capturar e preparar no mesmo instante conserva o estado e não compartilha referências", () => {
    const estado = criarMundoDaProva().fotografar().estado;
    const antes = JSON.stringify(estado);
    const captura = capturarContinuidadeEspacial(estado);
    const preparado = comContinuidadeEspacial(estado, captura);
    expect(preparado).toEqual(estado);
    expect(JSON.stringify(estado)).toBe(antes);
    const pessoa = listar(preparado.moradores)[0];
    if (!pessoa) throw new Error("Morador ausente");
    pessoa.fila.push("aca_999999");
    expect(JSON.stringify(estado)).toBe(antes);
    expect(captura.moradores.find((m) => m.id === pessoa.id)?.fila).toEqual([]);
  });

  it("recupera fila, rota e contador de ações posteriores à fotografia, sem copiar finanças ou necessidades", () => {
    const mundo = criarMundoDaProva();
    const fotografia = mundo.fotografar();
    const roteiro = criarRoteiro(mundo);
    const sessao = roteiro.entrar(LIA);
    const pessoa = moradorDeNome(mundo, "Marcos");
    if (pessoa.local.t !== "lote") throw new Error("Marcos fora do lote");
    const lote = mundo.estado.lotes.porId[pessoa.local.loteId];
    if (!lote) throw new Error("Lote ausente");
    expect(roteiro.comandar(sessao, pessoa.id, { t: "reservar" }).ok).toBe(true);
    expect(
      roteiro.comandar(sessao, pessoa.id, { t: "ir_para", pos: lote.entrada, andar: 0 }).ok,
    ).toBe(true);
    roteiro.andar(1);
    expect(mundo.estado.acoes.ordem.length).toBeGreaterThan(0);
    const captura = capturarContinuidadeEspacial(mundo.fotografar().estado);
    const recuperado = comContinuidadeEspacial(
      fotografia.estado,
      JSON.parse(JSON.stringify(captura)),
    );
    expect(recuperado.acoes).toEqual(mundo.estado.acoes);
    expect(recuperado.contadores.aca).toBe(mundo.estado.contadores.aca);
    expect(recuperado.familias).toEqual(fotografia.estado.familias);
    const voltou = recuperado.moradores.porId[pessoa.id];
    const original = fotografia.estado.moradores.porId[pessoa.id];
    if (!voltou || !original) throw new Error("Morador ausente na recuperação");
    expect(voltou.necessidades).toEqual(original.necessidades);
    expect(capturarContinuidadeEspacial(recuperado)).toEqual(captura);
  });

  it("não admite morador ou objeto omitido, repetido ou trocado por outra identidade", () => {
    const estado = criarMundoDaProva().fotografar().estado;
    const captura = capturarContinuidadeEspacial(estado);
    const primeiro = captura.moradores[0];
    const objeto = captura.ocupacoes[0];
    if (!primeiro || !objeto) throw new Error("Mundo incompleto");
    const antes = JSON.stringify(estado);
    for (const adulterada of [
      { ...captura, moradores: captura.moradores.slice(1) },
      { ...captura, moradores: [primeiro, ...captura.moradores.slice(0, -1)] },
      { ...captura, moradores: [{ ...primeiro, id: "mor_999999" }, ...captura.moradores.slice(1)] },
      { ...captura, ocupacoes: captura.ocupacoes.slice(1) },
      { ...captura, ocupacoes: [objeto, ...captura.ocupacoes.slice(0, -1)] },
    ])
      expect(() => comContinuidadeEspacial(estado, adulterada)).toThrow();
    expect(JSON.stringify(estado)).toBe(antes);
  });

  it("valida referências e não publica uma continuidade parcialmente aplicada", () => {
    const estado = criarMundoDaProva().fotografar().estado;
    const captura = capturarContinuidadeEspacial(estado);
    const primeiro = captura.moradores[0];
    if (!primeiro) throw new Error("Morador ausente");
    const adulterada = copiar(captura);
    adulterada.moradores[0] = { ...primeiro, acaoAtual: "aca_999999" };
    const antes = JSON.stringify(estado);
    expect(() => comContinuidadeEspacial(estado, adulterada)).toThrow(/Continuidade inválida/);
    expect(JSON.stringify(estado)).toBe(antes);
  });

  it("não permite voltar tick, versão de morador ou contador de ação", () => {
    const estado = criarMundoDaProva().fotografar().estado;
    estado.relogio.tick = 5;
    estado.contadores.aca = 5;
    const pessoa = listar(estado.moradores)[0];
    if (!pessoa) throw new Error("Morador ausente");
    pessoa.versao = 2;
    const captura = capturarContinuidadeEspacial(estado);
    const primeiro = captura.moradores[0];
    if (!primeiro) throw new Error("Morador ausente");
    expect(() => comContinuidadeEspacial(estado, { ...captura, tick: 4 })).toThrow(/anterior/);
    expect(() => comContinuidadeEspacial(estado, { ...captura, contadorDeAcao: 4 })).toThrow(
      /regredir/,
    );
    expect(() =>
      comContinuidadeEspacial(estado, {
        ...captura,
        moradores: [{ ...primeiro, versao: 1 }, ...captura.moradores.slice(1)],
      }),
    ).toThrow(/regredir/);
  });
});
