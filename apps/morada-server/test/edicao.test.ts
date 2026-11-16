import {
  comandoDeEdicao,
  conferirColocacaoNoChao,
  listar,
  type Objeto,
  obter,
  type PedidoDeEdicao,
  verificarInvariantes,
} from "@informach/morada-sim";
import { POSSE_TTL_MS } from "@informach/recreio";
import { describe, expect, it } from "vitest";
import { criarBancada, mundoDe } from "./apoio";

async function cenario() {
  const bancada = await criarBancada({ checkpointMs: 1_000_000 });
  const a = await bancada.novaInstancia("wss://a.test");
  const lia = bancada.jogador("Lia");
  const mundoId = bancada.criarMundo(lia);
  await bancada.entrar(lia, mundoId);
  const mundo = mundoDe(a.instancia, mundoId);
  const familia = listar(mundo.estado.familias)[0];
  const lote = familia?.loteId ? obter(mundo.estado.lotes, familia.loteId) : undefined;
  const imovel = lote?.imovelId ? obter(mundo.estado.imoveis, lote.imovelId) : null;
  const piso = imovel?.andares.find((p) => p.n === 0);
  if (!familia || !lote || !piso || !lia.jogadorId)
    throw new Error("Mundo sem jogador/família/lote/piso");
  let escolhido: Objeto | null = null;
  for (let y = 500; y < lote.tamanho[1] && !escolhido; y += 500) {
    for (let x = 500; x < lote.tamanho[0]; x += 500) {
      const candidato: Objeto = {
        id: "obj_999999",
        loteId: lote.id,
        catalogo: "mesa_lateral_redonda_prateleira_verde",
        versao: 1,
        revisao: 1,
        pos: [x, y, piso.z],
        andar: 0,
        giro: 0,
        cor: 0xffffff,
        pintura: null,
        ocupacao: {},
      };
      if (conferirColocacaoNoChao(mundo.estado, candidato.id, candidato) === null) {
        escolhido = candidato;
        break;
      }
    }
  }
  if (!escolhido) throw new Error("Casa sem espaço para a mesa da prova de journal");
  const rascunho: Omit<PedidoDeEdicao, "trava"> = {
    familiaId: familia.id,
    loteId: lote.id,
    sequencia: 1,
    operacao: {
      t: "comprar",
      catalogo: escolhido.catalogo,
      versaoDoCatalogo: 1,
      politicaDePrecos: 1,
      revisaoDoEspaco: lote.revisaoDoEspaco,
      colocacao: { pos: escolhido.pos, andar: 0, giro: 0 },
      pintura: null,
    },
  };
  const preparar = async (instancia = a.instancia) => {
    const id = await lia.comando(null, {
      t: "preparar_obra",
      rascunho: {
        familiaId: rascunho.familiaId,
        loteId: rascunho.loteId,
        operacao: rascunho.operacao,
      },
    });
    await bancada.andar(1, [instancia]);
    const resultado = lia.resultados.get(id);
    if (!resultado?.ok || !resultado.obra) throw new Error("Preparação da mesa recusada");
    return { ...rascunho, trava: resultado.obra.referencia } satisfies PedidoDeEdicao;
  };
  const pedido = await preparar();
  const chave = comandoDeEdicao(lia.jogadorId, 1);
  return {
    bancada,
    a,
    lia,
    mundoId,
    pedido,
    preparar,
    chave,
    familiaId: familia.id,
    saldo: familia.fundo,
    objetos: mundo.estado.objetos.ordem.length,
  };
}

describe("journal das edições de móveis", () => {
  it("prazo do host expira a obra mesmo com a simulação pausada", async () => {
    const c = await cenario();
    await c.lia.comando(null, { t: "votar_velocidade", velocidade: 0 });
    await c.bancada.andar(1);
    const mundo = mundoDe(c.a.instancia, c.mundoId);
    expect(mundo.estado.relogio.velocidade).toBe(0);
    const tick = mundo.estado.relogio.tick;
    c.bancada.esperar(15_000);
    await c.lia.comando(null, { t: "editar_casa", pedido: c.pedido }, c.chave);
    await c.bancada.andar(1);
    expect(mundo.estado.relogio.tick).toBe(tick);
    expect(c.lia.resultados.get(c.chave)).toMatchObject({ ok: false, detalhe: "trava_perdida" });
    expect(obter(mundo.estado.familias, c.familiaId)?.fundo).toBe(c.saldo);
    const nova = await c.preparar();
    expect(nova.trava.numero).toBeGreaterThan(c.pedido.trava.numero);
    await c.lia.comando(null, { t: "editar_casa", pedido: nova }, c.chave);
    await c.bancada.andar(1);
    expect(c.lia.resultados.get(c.chave)).toMatchObject({ ok: true });
    expect(obter(mundo.estado.familias, c.familiaId)?.fundo).toBe(c.saldo - 9_500);
  });

  it("reentrada invalida a trava antiga e o aviso atrasado de queda preserva a nova", async () => {
    const c = await cenario();
    c.lia.cair();
    await c.bancada.entrar(c.lia, c.mundoId);
    const nova = await c.preparar();
    expect(nova.trava.geracao).toBe(c.pedido.trava.geracao);
    expect(nova.trava.numero).toBeGreaterThan(c.pedido.trava.numero);
    await c.lia.comando(null, { t: "editar_casa", pedido: c.pedido }, c.chave);
    await c.bancada.andar(1);
    expect(c.lia.resultados.get(c.chave)).toMatchObject({ ok: false, detalhe: "trava_perdida" });
    await c.lia.comando(null, { t: "editar_casa", pedido: nova }, c.chave);
    await c.bancada.andar(1);
    expect(c.lia.resultados.get(c.chave)).toMatchObject({ ok: true });
    expect(obter(mundoDe(c.a.instancia, c.mundoId).estado.familias, c.familiaId)?.fundo).toBe(
      c.saldo - 9_500,
    );
  });

  it("não anuncia o catálogo de pintura nem dá boas-vindas antes do journal", async () => {
    const catalogo = {
      formato: "morada.pinturas",
      versao: 1,
      perfis: [
        {
          catalogo: "rack_pes_2portas_vermelho",
          versaoDoCatalogo: 1,
          perfil: "a".repeat(64),
          rotulo: "Estrutura",
          referencia: 0xc86432,
        },
      ],
    } satisfies import("@informach/morada-sim").CatalogoDePinturas;
    const bancada = await criarBancada({ pinturasDisponiveis: catalogo });
    const a = await bancada.novaInstancia();
    const lia = bancada.jogador("Lia");
    const mundoId = bancada.criarMundo(lia);
    a.host.soFalha = ["anexarAoDiario"];
    a.host.foraDoAr = true;
    await bancada.entrar(lia, mundoId);
    expect(lia.visao).toBeNull();
    expect(lia.quadros.some((q) => q.t === "bem_vindo")).toBe(false);
    a.host.foraDoAr = false;
    await bancada.andar(1);
    expect(lia.quadros.some((q) => q.t === "bem_vindo")).toBe(true);
    expect(lia.visao?.catalogoDePinturas).toEqual(catalogo);
  });

  it("diário indisponível não entrega resultado, saldo nem objeto antes da confirmação", async () => {
    const c = await cenario();
    c.a.host.foraDoAr = true;
    c.a.host.soFalha = ["anexarAoDiario"];
    await c.lia.comando(null, { t: "editar_casa", pedido: c.pedido }, c.chave);
    await c.bancada.andar(2);
    expect(c.lia.resultados.has(c.chave)).toBe(false);
    expect(c.lia.visao?.familias.porId[c.familiaId]?.fundo).toBe(c.saldo);
    expect(c.lia.visao?.objetos.ordem.length).toBe(c.objetos);
    c.a.host.foraDoAr = false;
    await c.bancada.andar(1);
    expect(c.lia.resultados.get(c.chave)).toMatchObject({ ok: true });
    expect(c.lia.visao?.familias.porId[c.familiaId]?.fundo).toBe(c.saldo - 9_500);
    expect(c.lia.visao?.objetos.ordem.length).toBe(c.objetos + 1);
  });

  it.each(["antes_do_diario", "depois_do_diario"] as const)(
    "queda %s não duplica compra ao assumir a posse em outra instância",
    async (ponto) => {
      const c = await cenario();
      await c.lia.comando(null, { t: "editar_casa", pedido: c.pedido }, c.chave);
      c.a.falhas.armar(ponto);
      await expect(c.bancada.andar(1)).rejects.toMatchObject({ ponto });
      expect(c.lia.resultados.has(c.chave)).toBe(false);
      c.a.host.foraDoAr = true;
      c.lia.cair();
      c.bancada.esperar(POSSE_TTL_MS + 1);
      const b = await c.bancada.novaInstancia("wss://b.test");
      await c.bancada.entrar(c.lia, c.mundoId);
      const mundo = mundoDe(b.instancia, c.mundoId);
      expect(obter(mundo.estado.familias, c.familiaId)?.fundo).toBe(
        c.saldo - (ponto === "depois_do_diario" ? 9_500 : 0),
      );
      await c.lia.comando(null, { t: "editar_casa", pedido: c.pedido }, c.chave);
      await c.bancada.andar(1, [b.instancia]);
      if (ponto === "antes_do_diario") {
        expect(c.lia.resultados.get(c.chave)).toMatchObject({
          ok: false,
          detalhe: "trava_perdida",
        });
        expect(obter(mundo.estado.familias, c.familiaId)?.fundo).toBe(c.saldo);
        const novo = await c.preparar(b.instancia);
        expect(novo.trava.geracao).not.toBe(c.pedido.trava.geracao);
        await c.lia.comando(null, { t: "editar_casa", pedido: novo }, c.chave);
        await c.bancada.andar(1, [b.instancia]);
      }
      expect(c.lia.resultados.get(c.chave)).toMatchObject({ ok: true });
      if (ponto === "depois_do_diario")
        expect(c.lia.resultados.get(c.chave)).toMatchObject({ repetido: true });
      expect(obter(mundo.estado.familias, c.familiaId)?.fundo).toBe(c.saldo - 9_500);
      expect(mundo.estado.objetos.ordem).toHaveLength(c.objetos + 1);
      expect(verificarInvariantes(mundo.estado, mundo.presenca)).toEqual([]);
    },
  );
});
