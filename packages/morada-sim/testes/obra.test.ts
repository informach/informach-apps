import { describe, expect, it } from "vitest";
import { AcaoPedidaSchema } from "../src/comandos/intencao";
import {
  type AcaoPedida,
  comandoDeEdicao,
  conferirColocacaoNoChao,
  copiar,
  listar,
  type Objeto,
  obter,
  type PedidoDeEdicao,
  type RascunhoDaObra,
  restaurar,
} from "../src/index";
import { BRUNO, criarMundoDaProva, LIA } from "../src/testes";

const GERACAO = "00000000-0000-4000-8000-000000000001";
function cenario() {
  const mundo = criarMundoDaProva({ fundadores: [LIA, BRUNO] });
  mundo.aplicar({ t: "obra_do_host", geracao: GERACAO, agoraMs: 0 });
  for (const perfilId of [LIA, BRUNO])
    mundo.aplicar({ t: "sessao_entrou", perfilId, sessaoId: `sid-${perfilId}` });
  const familia = listar(mundo.estado.familias)[0];
  const lote = familia?.loteId ? obter(mundo.estado.lotes, familia.loteId) : null;
  const imovel = lote?.imovelId ? obter(mundo.estado.imoveis, lote.imovelId) : null;
  const piso = imovel?.andares.find((a) => a.n === 0);
  if (!familia || !lote || !piso) throw new Error("Casa ausente");
  let pos: Objeto["pos"] | null = null;
  for (let y = 500; y < lote.tamanho[1] && !pos; y += 500)
    for (let x = 500; x < lote.tamanho[0]; x += 500) {
      const peca: Objeto = {
        id: "obj_previa",
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
      if (!conferirColocacaoNoChao(mundo.estado, peca.id, peca)) {
        pos = peca.pos;
        break;
      }
    }
  if (!pos) throw new Error("Espaço ausente");
  const rascunho: RascunhoDaObra = {
    familiaId: familia.id,
    loteId: lote.id,
    operacao: {
      t: "comprar",
      catalogo: "mesa_lateral_redonda_prateleira_verde",
      versaoDoCatalogo: 1,
      politicaDePrecos: 1,
      revisaoDoEspaco: lote.revisaoDoEspaco,
      colocacao: { pos, andar: 0, giro: 0 },
      pintura: null,
    },
  };
  let numero = 0;
  const chamar = (acao: AcaoPedida, autor = LIA, comandoId = `obra-teste-${++numero}`) =>
    mundo.aplicar({
      t: "intencao",
      sessaoId: `sid-${autor}`,
      intencao: { mundoId: mundo.estado.id, comandoId, moradorId: null, versaoEsperada: 0, acao },
    });
  const preparar = () => {
    const resposta = chamar({ t: "preparar_obra", rascunho });
    if (!resposta.ok || !resposta.obra) throw new Error("Preparação recusada");
    return resposta.obra;
  };
  mundo.avancar(0);
  return { mundo, familia, lote, rascunho, chamar, preparar };
}

describe("autoridade transitória da obra", () => {
  it("não aceita geração, relógio ou regiões arbitrárias pela intenção do jogador", () => {
    const c = cenario();
    expect(
      AcaoPedidaSchema.safeParse({ t: "obra_do_host", geracao: GERACAO, agoraMs: 9 }).success,
    ).toBe(false);
    expect(
      AcaoPedidaSchema.safeParse({ t: "preparar_obra", rascunho: { ...c.rascunho, regioes: [] } })
        .success,
    ).toBe(false);
    const antes = c.mundo.hash();
    const obra = c.preparar();
    expect(obra.prazoMs).toBe(15_000);
    expect(c.mundo.hash()).toBe(antes);
    expect(c.mundo.avancar(0).fatos).toEqual([]);
    const publica = c.mundo.visao(BRUNO).presenca.obras;
    expect(publica).toMatchObject([{ perfilId: LIA, alvo: obra.alvo }]);
    expect(JSON.stringify(publica)).not.toContain("sid-");
    expect(restaurar(c.mundo.fotografar()).presenca.obra).toBeNull();
  });

  it("bloqueia outro autor e referência forjada sem gastar nem consumir sequência", () => {
    const c = cenario();
    const obra = c.preparar();
    expect(c.chamar({ t: "preparar_obra", rascunho: c.rascunho }, BRUNO)).toMatchObject({
      ok: false,
      detalhe: "trava_ocupada",
    });
    const antes = c.mundo.hash();
    const pedido: PedidoDeEdicao = { ...c.rascunho, sequencia: 1, trava: obra.referencia };
    expect(c.chamar({ t: "editar_casa", pedido }, BRUNO, comandoDeEdicao(BRUNO, 1))).toMatchObject({
      ok: false,
      detalhe: "trava_perdida",
      edicao: { proximaSequencia: 1 },
    });
    expect(
      c.chamar(
        {
          t: "editar_casa",
          pedido: { ...pedido, trava: { ...obra.referencia, numero: obra.referencia.numero + 1 } },
        },
        LIA,
        comandoDeEdicao(LIA, 1),
      ),
    ).toMatchObject({ ok: false, detalhe: "trava_perdida" });
    expect(c.mundo.hash()).toBe(antes);
    expect(c.mundo.avancar(0).fatos).toEqual([]);
    expect(c.chamar({ t: "editar_casa", pedido }, LIA, comandoDeEdicao(LIA, 1))).toMatchObject({
      ok: true,
    });
    expect(c.mundo.presenca.obra?.travas).toEqual([]);
  });

  it("expira por tempo do host mesmo pausado e não repete o efeito de um recibo confirmado", () => {
    const c = cenario();
    const obra = c.preparar();
    const tick = c.mundo.estado.relogio.tick;
    c.mundo.aplicar({ t: "obra_do_host", geracao: GERACAO, agoraMs: 15_000 });
    expect(c.mundo.estado.relogio.tick).toBe(tick);
    const pedido: PedidoDeEdicao = { ...c.rascunho, sequencia: 1, trava: obra.referencia };
    const enviar = (p: PedidoDeEdicao) =>
      c.chamar({ t: "editar_casa", pedido: p }, LIA, comandoDeEdicao(LIA, 1));
    expect(enviar(pedido)).toMatchObject({ ok: false, detalhe: "trava_perdida" });
    const nova = c.preparar();
    expect(nova.referencia.numero).toBeGreaterThan(obra.referencia.numero);
    const atual = { ...pedido, trava: nova.referencia };
    expect(enviar(atual)).toMatchObject({ ok: true });
    const confirmado = c.mundo.hash();
    c.mundo.avancar(0);
    c.mundo.aplicar({ t: "obra_do_host", geracao: GERACAO, agoraMs: 60_000 });
    expect(enviar(atual)).toMatchObject({ ok: true, repetido: true });
    expect(c.mundo.hash()).toBe(confirmado);
    expect(c.mundo.avancar(0).fatos).toEqual([]);
  });

  it.each(["reconexao", "permissoes"] as const)("%s não revalida concessão antiga", (modo) => {
    const c = cenario();
    const obra = c.preparar();
    const antes = c.mundo.hash();
    if (modo === "reconexao") {
      c.mundo.aplicar({ t: "sessao_caiu", sessaoId: `sid-${LIA}`, agoraMs: 0 });
      c.mundo.aplicar({ t: "sessao_voltou", sessaoId: `sid-${LIA}` });
    } else {
      const atual = c.mundo.estado.acessos.find(
        (a) => a.perfilId === LIA && a.familiaId === c.familia.id,
      );
      const acesso = atual ? copiar(atual) : null;
      if (!acesso) throw new Error("Acesso ausente");
      c.mundo.aplicar({ t: "revogar_acesso", perfilId: LIA, familiaId: c.familia.id });
      c.mundo.aplicar({
        t: "conceder_acesso",
        perfilId: LIA,
        familiaId: c.familia.id,
        permissoes: acesso.permissoes,
      });
    }
    expect(c.mundo.presenca.obra?.travas).toEqual([]);
    const pedido: PedidoDeEdicao = { ...c.rascunho, sequencia: 1, trava: obra.referencia };
    expect(c.chamar({ t: "editar_casa", pedido }, LIA, comandoDeEdicao(LIA, 1))).toMatchObject({
      ok: false,
      detalhe: "trava_perdida",
    });
    if (modo === "reconexao") expect(c.mundo.hash()).toBe(antes);
    expect(c.preparar().referencia.numero).toBeGreaterThan(obra.referencia.numero);
  });
});
