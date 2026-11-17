import { type AcaoPedida, comandoDeEdicao, type Intencao } from "@informach/morada-sim";
import { describe, expect, it } from "vitest";
import { Comandos } from "./comandos";

function comprar(): Extract<AcaoPedida, { t: "editar_casa" }> {
  return {
    t: "editar_casa",
    pedido: {
      sequencia: 1,
      trava: { geracao: "00000000-0000-4000-8000-000000000001", numero: 1 },
      familiaId: "fam_000001",
      loteId: "lote_000001",
      operacao: {
        t: "comprar",
        catalogo: "rack_pes_2portas_vermelho",
        versaoDoCatalogo: 1,
        politicaDePrecos: 1,
        revisaoDoEspaco: 1,
        colocacao: { pos: [2000, 2000, 0], andar: 0, giro: 0 },
        pintura: null,
      },
    },
  };
}

describe("comandos duráveis de edição no cliente", () => {
  it("deriva a chave do autor/sequência e congela o conteúdo para reenvio após queda", async () => {
    const enviados: Intencao[] = [];
    const comandos = new Comandos({
      mundoId: () => "mundo",
      autor: () => "jogador",
      enviar: (intencao) => {
        enviados.push(JSON.parse(JSON.stringify(intencao)));
        return true;
      },
    });
    const acao = comprar();
    const pedido = comandos.comando(null, acao);
    expect(pedido.comandoId).toBe(comandoDeEdicao("jogador", 1));
    if (acao.pedido.operacao.t !== "comprar") throw new Error("Compra ausente");
    acao.pedido.operacao.pintura = { perfil: "a".repeat(64), cor: 0 };
    acao.pedido.operacao.colocacao.pos[0] = 4000;
    comandos.reenviar();
    expect(enviados).toHaveLength(2);
    expect(enviados[1]).toEqual(enviados[0]);
    expect(comandos.emAberto()).toHaveLength(1);
    expect(comandos.receber({ ok: true, comandoId: pedido.comandoId, tick: 1, versoes: {} })).toBe(
      true,
    );
    expect(await pedido.resultado).toMatchObject({ ok: true });
    expect(comandos.emAberto()).toEqual([]);
    expect(comandos.receber({ ok: true, comandoId: pedido.comandoId, tick: 1, versoes: {} })).toBe(
      false,
    );
  });

  it("não substitui uma edição em confirmação por um segundo clique", async () => {
    const enviados: Intencao[] = [];
    const comandos = new Comandos({
      mundoId: () => "mundo",
      autor: () => "jogador",
      enviar: (intencao) => {
        enviados.push(intencao);
        return true;
      },
    });
    const primeiro = comandos.comando(null, comprar());
    const segundo = comandos.comando(null, comprar());
    expect(await segundo.resultado).toMatchObject({ ok: false, motivo: "ocupado" });
    expect(enviados).toHaveLength(1);
    expect(comandos.emAberto()).toHaveLength(1);
    comandos.receber({ ok: true, comandoId: primeiro.comandoId, tick: 1, versoes: {} });
    expect(await primeiro.resultado).toMatchObject({ ok: true });
  });

  it("sem identidade do servidor não envia edição; troca de mundo encerra pedido antigo", async () => {
    let mundoId = "primeiro";
    let enviados = 0;
    const semAutor = new Comandos({
      mundoId: () => mundoId,
      novoId: () => "sem-autor-1",
      enviar: () => {
        enviados++;
        return true;
      },
    });
    expect(await semAutor.comando(null, comprar()).resultado).toMatchObject({
      ok: false,
      motivo: "sem_sessao",
    });
    expect(enviados).toBe(0);
    const comandos = new Comandos({
      mundoId: () => mundoId,
      autor: () => "jogador",
      enviar: () => true,
    });
    const pedido = comandos.comando(null, comprar());
    mundoId = "segundo";
    comandos.reenviar();
    expect(await pedido.resultado).toMatchObject({ ok: false, motivo: "mundo_errado" });
    expect(comandos.emAberto()).toEqual([]);
  });
});
