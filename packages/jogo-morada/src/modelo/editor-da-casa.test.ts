import {
  type AcaoPedida,
  type CatalogoDePinturas,
  comandoDeEdicao,
  conferirColocacaoNoChao,
  listar,
  type Objeto,
  obter,
  type PedidoDeEdicao,
  type Resultado,
  restaurar,
} from "@informach/morada-sim";
import { BRUNO, criarMundoDaProva, LIA } from "@informach/morada-sim/testes";
import { afterEach, describe, expect, it } from "vitest";
import { assentar, RelogioDeTeste } from "../testes/servidor-de-mentira";
import { EditorDaCasa } from "./editor-da-casa";

const MESA = "mesa_lateral_redonda_prateleira_verde";
const editores: EditorDaCasa[] = [];
afterEach(() => {
  for (const editor of editores.splice(0)) editor.dispose();
});
const catalogo: CatalogoDePinturas = {
  formato: "morada.pinturas",
  versao: 1,
  perfis: [
    {
      catalogo: MESA,
      versaoDoCatalogo: 1,
      perfil: "a".repeat(64),
      rotulo: "Estrutura",
      referencia: 0x2f9a56,
    },
  ],
};

function cenario() {
  const relogio = new RelogioDeTeste();
  const geracao = "00000000-0000-4000-8000-000000000001";
  const mundo = restaurar(criarMundoDaProva({ fundadores: [LIA, BRUNO] }).fotografar(), [], {
    pinturasDisponiveis: catalogo,
  });
  mundo.aplicar({ t: "admitir_pinturas", catalogo });
  mundo.aplicar({ t: "obra_do_host", geracao, agoraMs: relogio.agora() });
  mundo.avancar(0);
  for (const perfilId of [LIA, BRUNO])
    mundo.aplicar({ t: "sessao_entrou", sessaoId: perfilId, perfilId });
  const familia = listar(mundo.estado.familias)[0];
  const lote = familia?.loteId ? obter(mundo.estado.lotes, familia.loteId) : null;
  const imovel = lote?.imovelId ? obter(mundo.estado.imoveis, lote.imovelId) : null;
  const piso = imovel?.andares.find((p) => p.n === 0);
  if (!familia || !lote || !piso) throw new Error("Casa da prova ausente");
  let versao = 0;
  let auxiliar = 0;
  let pronto = true;
  let entregarPreparacao = (resposta: Resultado): Promise<Resultado> => Promise.resolve(resposta);
  const executar = (acao: AcaoPedida, autor = LIA): Resultado => {
    mundo.aplicar({ t: "obra_do_host", geracao, agoraMs: relogio.agora() });
    const resposta = mundo.aplicar({
      t: "intencao",
      sessaoId: autor,
      intencao: {
        mundoId: mundo.estado.id,
        comandoId: `editor-auxiliar-${++auxiliar}`,
        moradorId: null,
        versaoEsperada: 0,
        acao,
      },
    });
    mundo.avancar(0);
    versao++;
    return resposta;
  };
  const enviados: PedidoDeEdicao[] = [];
  const enviar = (pedido: PedidoDeEdicao, autor = LIA): Resultado => {
    const resposta = mundo.aplicar({
      t: "intencao",
      sessaoId: autor,
      intencao: {
        mundoId: mundo.estado.id,
        comandoId: comandoDeEdicao(autor, pedido.sequencia),
        moradorId: null,
        versaoEsperada: 0,
        acao: { t: "editar_casa", pedido },
      },
    });
    mundo.avancar(0);
    versao++;
    return resposta;
  };
  const editor = new EditorDaCasa({
    estado: () => mundo.estado,
    jogadorId: () => LIA,
    pronto: () => pronto,
    proximaSequencia: () => mundo.visao(LIA).edicao.proximaSequencia,
    versaoDoEspelho: () => versao,
    aoMudar: () => {
      versao++;
    },
    enviar: async (pedido) => {
      enviados.push(pedido);
      return enviar(pedido);
    },
    preparar: async (rascunho) => entregarPreparacao(executar({ t: "preparar_obra", rascunho })),
    renovar: async (referencia) => executar({ t: "renovar_obra", referencia }),
    liberar: async (referencia) => executar({ t: "liberar_obra", referencia }),
    obras: () => mundo.visao(LIA).presenca.obras ?? [],
    agora: relogio.agora,
    agendar: relogio.agendar,
  });
  editores.push(editor);
  const livre = (): [number, number] => {
    for (let y = 500; y < lote.tamanho[1]; y += 500)
      for (let x = 500; x < lote.tamanho[0]; x += 500) {
        const objeto: Objeto = {
          id: "obj_previa_editor",
          loteId: lote.id,
          catalogo: MESA,
          versao: 1,
          revisao: 1,
          pos: [x, y, piso.z],
          andar: 0,
          giro: 0,
          cor: 0xffffff,
          pintura: null,
          ocupacao: {},
        };
        if (!conferirColocacaoNoChao(mundo.estado, objeto.id, objeto)) return [x, y];
      }
    throw new Error("Casa sem espaço para a prova");
  };
  const preparar = () => {
    expect(editor.abrir(familia.id)).toBe(true);
    expect(editor.comprar(MESA)).toBe(true);
    expect(editor.posicionar(lote.id, livre())).toBe(true);
    expect(editor.prever().valido).toBe(true);
  };
  const comprar = async () => {
    preparar();
    const antes = new Set(mundo.estado.objetos.ordem);
    expect((await editor.confirmar())?.ok).toBe(true);
    const novo = listar(mundo.estado.objetos).find((o) => !antes.has(o.id));
    if (!novo) throw new Error("Compra não apareceu");
    return novo;
  };
  return {
    mundo,
    familia,
    lote,
    editor,
    enviados,
    enviarOutro: (pedido: Omit<PedidoDeEdicao, "trava">, autor = BRUNO) => {
      const preparo = executar(
        {
          t: "preparar_obra",
          rascunho: {
            familiaId: pedido.familiaId,
            loteId: pedido.loteId,
            operacao: pedido.operacao,
          },
        },
        autor,
      );
      if (!preparo.ok || !preparo.obra) return preparo;
      return enviar({ ...pedido, trava: preparo.obra.referencia }, autor);
    },
    pronto: (valor: boolean) => {
      pronto = valor;
      versao++;
      editor.sincronizar();
    },
    relogio,
    segurarProximaPreparacao: () => {
      let soltar: (() => void) | null = null;
      const espera = new Promise<void>((resolve) => {
        soltar = resolve;
      });
      entregarPreparacao = async (resposta) => {
        entregarPreparacao = (proxima) => Promise.resolve(proxima);
        await espera;
        return resposta;
      };
      return () => {
        if (!soltar) throw new Error("Entrega ausente");
        soltar();
      };
    },
    livre,
    preparar,
    comprar,
    sincronizar: () => {
      versao++;
    },
  };
}

describe("rascunho do editor contra a simulação real", () => {
  it("alterar um eixo conserva a última escolha do outro antes da próxima renderização", () => {
    const c = cenario();
    c.preparar();
    expect(c.editor.posicionarEixo(0, 3500)).toBe(true);
    expect(c.editor.posicionarEixo(1, 5000)).toBe(true);
    expect(c.editor.rascunho?.operacao).toMatchObject({ colocacao: { pos: [3500, 5000, 450] } });
    expect(c.editor.posicionarEixo(0, 4000)).toBe(true);
    expect(c.editor.rascunho?.operacao).toMatchObject({ colocacao: { pos: [4000, 5000, 450] } });
    expect(c.enviados).toEqual([]);
  });
  it("renova a seleção enquanto visível e libera ao perder conexão", async () => {
    const c = cenario();
    const antes = c.mundo.hash();
    c.preparar();
    await assentar();
    const referencia = c.mundo.presenca.obra?.travas[0]?.referencia;
    expect(referencia).toBeDefined();
    for (let i = 0; i < 4; i++) {
      c.relogio.avancar(5000);
      await assentar();
    }
    expect(c.mundo.presenca.obra?.travas).toMatchObject([
      { referencia, ateMs: c.relogio.agora() + 15_000 },
    ]);
    expect(c.mundo.hash()).toBe(antes);
    c.pronto(false);
    await assentar();
    expect(c.mundo.presenca.obra?.travas).toEqual([]);
    c.relogio.avancar(30_000);
    await assentar();
    expect(c.mundo.presenca.obra?.travas).toEqual([]);
    expect(c.enviados).toEqual([]);
  });

  it("uma preparação atrasada não confirma a compra depois de perder e recuperar conexão", async () => {
    const c = cenario();
    const soltar = c.segurarProximaPreparacao();
    c.preparar();
    const confirmacao = c.editor.confirmar();
    c.pronto(false);
    c.pronto(true);
    soltar();
    expect(await confirmacao).toMatchObject({ ok: false });
    await assentar();
    expect(c.enviados).toEqual([]);
    expect((await c.editor.confirmar())?.ok).toBe(true);
    expect(c.enviados).toHaveLength(1);
  });

  it("experimenta e cancela sem mudar o mundo; duas confirmações gastam uma vez", async () => {
    const c = cenario(),
      hash = c.mundo.hash();
    c.preparar();
    expect(c.editor.prever().objeto?.pos[2]).toBe(450);
    expect(c.editor.girar()).toBe(true);
    c.editor.girar();
    c.editor.girar();
    c.editor.girar();
    expect(c.editor.pintar(0)).toBe(true);
    expect(c.mundo.hash()).toBe(hash);
    c.editor.cancelarSelecao();
    expect(c.editor.rascunho).toBeNull();
    expect(c.mundo.hash()).toBe(hash);
    c.preparar();
    const saldo = c.familia.fundo,
      quantidade = c.mundo.estado.objetos.ordem.length;
    const a = c.editor.confirmar(),
      b = c.editor.confirmar();
    expect(await b).toBeNull();
    expect((await a)?.ok).toBe(true);
    expect(c.enviados).toHaveLength(1);
    expect(obter(c.mundo.estado.familias, c.familia.id)?.fundo).toBe(saldo - 9_500);
    expect(c.mundo.estado.objetos.ordem).toHaveLength(quantidade + 1);
  });

  it("não atualiza versões silenciosamente quando outra pessoa compra no mesmo espaço", async () => {
    const c = cenario();
    c.preparar();
    const rascunho = c.editor.rascunho;
    if (!rascunho) throw new Error("Rascunho ausente");
    await assentar();
    expect(c.enviarOutro({ ...rascunho, sequencia: 1 }, BRUNO)).toMatchObject({
      ok: false,
      motivo: "ocupado",
    });
    c.pronto(false);
    expect(c.enviarOutro({ ...rascunho, sequencia: 1 }, BRUNO).ok).toBe(true);
    c.pronto(true);
    expect(c.editor.prever()).toMatchObject({
      valido: false,
      motivo: "A casa mudou. Revise a seleção antes de confirmar.",
    });
    expect(await c.editor.confirmar()).toBeNull();
    expect(c.enviados).toHaveLength(0);
    expect(c.editor.rascunho).toEqual(rascunho);
    expect(c.editor.revisar()).toBe(true);
    expect(c.editor.prever().valido).toBe(false);
    c.editor.posicionar(c.lote.id, c.livre());
    expect((await c.editor.confirmar())?.ok).toBe(true);
    expect(c.enviados).toHaveLength(1);
  });

  it("pinta preto, branco e original sem cobrar novamente e exige confirmação para vender", async () => {
    const c = cenario(),
      objeto = await c.comprar();
    const saldo = obter(c.mundo.estado.familias, c.familia.id)?.fundo;
    for (const cor of [0, 0xffffff, null]) {
      expect(c.editor.selecionar(objeto.id, "pintar")).toBe(true);
      expect(c.editor.pintar(cor)).toBe(true);
      expect((await c.editor.confirmar())?.ok).toBe(true);
      expect(obter(c.mundo.estado.objetos, objeto.id)?.pintura).toEqual(
        cor === null ? null : { perfil: "a".repeat(64), cor },
      );
      expect(obter(c.mundo.estado.familias, c.familia.id)?.fundo).toBe(saldo);
    }
    c.editor.selecionar(objeto.id, "vender");
    expect(await c.editor.confirmar()).toBeNull();
    expect(obter(c.mundo.estado.objetos, objeto.id)).toBeDefined();
    expect((await c.editor.confirmar({ vendaConfirmada: true }))?.ok).toBe(true);
    expect(obter(c.mundo.estado.objetos, objeto.id)).toBeUndefined();
    expect(obter(c.mundo.estado.familias, c.familia.id)?.fundo).toBe((saldo ?? 0) + 4_750);
  });

  it("revalida revogação antes de confirmar e não altera saldo ou móveis", async () => {
    const c = cenario();
    c.preparar();
    const saldo = c.familia.fundo,
      quantidade = c.mundo.estado.objetos.ordem.length;
    c.mundo.aplicar({ t: "revogar_acesso", perfilId: LIA, familiaId: c.familia.id });
    c.sincronizar();
    expect(await c.editor.confirmar()).toBeNull();
    expect(c.enviados).toHaveLength(0);
    expect(obter(c.mundo.estado.familias, c.familia.id)?.fundo).toBe(saldo);
    expect(c.mundo.estado.objetos.ordem).toHaveLength(quantidade);
    expect(c.editor.abrir(c.familia.id)).toBe(false);
  });
});
