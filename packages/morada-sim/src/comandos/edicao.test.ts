import { describe, expect, it } from "vitest";
import {
  admitirReciboDeEdicao,
  comandoDeEdicao,
  consultarEdicao,
  iniciarRegistroDeEdicoes,
  type PedidoDeEdicao,
  PedidoDeEdicaoSchema,
  RESPOSTAS_DE_EDICAO,
  type ReciboDeEdicao,
  RegistroDeEdicoesSchema,
} from "./edicao";

const autor = "3e6b49b9-306f-4bdd-9c99-a427f276091e";
function pedido(sequencia = 1): PedidoDeEdicao {
  return {
    sequencia,
    operacao: {
      t: "comprar",
      loteId: "lote_000001",
      revisaoDoEspaco: 1,
      politicaDePrecos: 1,
      catalogo: "rack_baixo",
      versaoDoCatalogo: 1,
      colocacao: { pos: [2000, 3000, 0], andar: 0, giro: 90 },
      cor: 0xffffff,
    },
  };
}
function recibo(sequencia = 1): ReciboDeEdicao {
  return {
    autor,
    pedido: pedido(sequencia),
    resultado: { ok: true, tick: sequencia, revisoes: { lote_000001: sequencia + 1 } },
  };
}

describe("sequência durável da edição", () => {
  it("liga a identidade ao autor e à sequência, sem UUID alternativo", () => {
    const registro = iniciarRegistroDeEdicoes(autor);
    const chave = comandoDeEdicao(autor, 1);
    expect(consultarEdicao(registro, autor, chave, pedido())).toEqual({ t: "nova" });
    expect(consultarEdicao(registro, autor, "outro-comando", pedido())).toEqual({
      t: "recusada",
      motivo: "identidade",
    });
    expect(consultarEdicao(registro, "outro", chave, pedido())).toEqual({
      t: "recusada",
      motivo: "identidade",
    });
    expect(comandoDeEdicao("a".repeat(44), Number.MAX_SAFE_INTEGER).length).toBeLessThanOrEqual(64);
    expect(() => comandoDeEdicao("autor:outro", 1)).toThrow();
  });

  it("devolve a mesma resposta após serializar e restaurar, sem expor referência mutável", () => {
    const antes = iniciarRegistroDeEdicoes(autor);
    const primeira = admitirReciboDeEdicao(antes, recibo());
    const salvo = RegistroDeEdicoesSchema.parse(JSON.parse(JSON.stringify(primeira.registro)));
    const resposta = consultarEdicao(salvo, autor, comandoDeEdicao(autor, 1), pedido());
    expect(primeira.aplicar).toBe(true);
    expect(antes.ultimaSequencia).toBe(0);
    expect(resposta).toEqual({ t: "repetida", recibo: recibo() });
    if (resposta.t !== "repetida") throw new Error("Recibo não recuperado");
    resposta.recibo.resultado = { ok: false, motivo: "limite" };
    expect(salvo.recentes[0]).toEqual(recibo());
    expect(admitirReciboDeEdicao(salvo, recibo()).aplicar).toBe(false);
  });

  it("conserva o piso da sequência depois de 600 edições e da restauração", () => {
    let registro = iniciarRegistroDeEdicoes(autor);
    for (let numero = 1; numero <= 600; numero++)
      registro = admitirReciboDeEdicao(registro, recibo(numero)).registro;
    registro = RegistroDeEdicoesSchema.parse(JSON.parse(JSON.stringify(registro)));
    expect(registro.recentes).toHaveLength(RESPOSTAS_DE_EDICAO);
    expect(registro.ultimaSequencia).toBe(600);
    expect(consultarEdicao(registro, autor, comandoDeEdicao(autor, 1), pedido())).toEqual({
      t: "recusada",
      motivo: "antiga",
    });
    expect(admitirReciboDeEdicao(registro, recibo()).aplicar).toBe(false);
    expect(consultarEdicao(registro, autor, comandoDeEdicao(autor, 601), pedido(601))).toEqual({
      t: "nova",
    });
  });

  it("duas abas com a mesma sequência não podem mudar o conteúdo da operação", () => {
    const registro = admitirReciboDeEdicao(iniciarRegistroDeEdicoes(autor), recibo()).registro;
    const alterado = pedido();
    if (alterado.operacao.t !== "comprar") throw new Error("Compra ausente");
    alterado.operacao.cor = 0;
    expect(consultarEdicao(registro, autor, comandoDeEdicao(autor, 1), alterado)).toEqual({
      t: "recusada",
      motivo: "conflito",
    });
    expect(() => admitirReciboDeEdicao(registro, { ...recibo(), pedido: alterado })).toThrow(
      /divergente/,
    );
  });

  it("uma recusa admitida não se transforma em compra ao reenviar a sequência", () => {
    const negado: ReciboDeEdicao = {
      ...recibo(),
      resultado: { ok: false, motivo: "saldo_insuficiente" },
    };
    const registro = admitirReciboDeEdicao(iniciarRegistroDeEdicoes(autor), negado).registro;
    expect(consultarEdicao(registro, autor, comandoDeEdicao(autor, 1), pedido())).toEqual({
      t: "repetida",
      recibo: negado,
    });
    expect(() => admitirReciboDeEdicao(registro, recibo())).toThrow(/divergente/);
  });

  it("recusa salto, diário fora de ordem e recibo de outro autor", () => {
    const registro = iniciarRegistroDeEdicoes(autor);
    expect(consultarEdicao(registro, autor, comandoDeEdicao(autor, 2), pedido(2))).toEqual({
      t: "recusada",
      motivo: "salto",
    });
    expect(() => admitirReciboDeEdicao(registro, recibo(2))).toThrow(/Salto/);
    expect(() => admitirReciboDeEdicao(registro, { ...recibo(), autor: "outro" })).toThrow(
      /outro autor/,
    );
  });

  it("recusa fotografia com janela incompleta, autor ou sequência adulterados", () => {
    const registro = admitirReciboDeEdicao(iniciarRegistroDeEdicoes(autor), recibo()).registro;
    expect(RegistroDeEdicoesSchema.safeParse({ ...registro, recentes: [] }).success).toBe(false);
    expect(RegistroDeEdicoesSchema.safeParse({ ...registro, autor: "outro" }).success).toBe(false);
    expect(RegistroDeEdicoesSchema.safeParse({ ...registro, ultimaSequencia: 2 }).success).toBe(
      false,
    );
    expect(
      RegistroDeEdicoesSchema.safeParse({ ...registro, recentes: [recibo(), recibo()] }).success,
    ).toBe(false);
  });

  it("recusa preço/saldo do navegador, frações, versões nulas e colocação não cardinal", () => {
    const original = pedido();
    if (original.operacao.t !== "comprar") throw new Error("Compra ausente");
    const operacao = original.operacao;
    for (const alterada of [
      { ...operacao, compraCentavos: 1 },
      { ...operacao, saldo: 1_000_000 },
      { ...operacao, versaoDoCatalogo: 0 },
      { ...operacao, colocacao: { ...operacao.colocacao, giro: 45 } },
      { ...operacao, colocacao: { ...operacao.colocacao, pos: [0.5, 0, 0] } },
    ])
      expect(PedidoDeEdicaoSchema.safeParse({ ...original, operacao: alterada }).success).toBe(
        false,
      );
    for (const numero of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])
      expect(PedidoDeEdicaoSchema.safeParse({ ...original, sequencia: numero }).success).toBe(
        false,
      );
  });
});
