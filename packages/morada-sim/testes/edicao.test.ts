import { describe, expect, it } from "vitest";
import { BAIRRO_DA_PROVA } from "../src/conteudo";
import {
  comandoDeEdicao,
  copiar,
  listar,
  type Mundo,
  type OpcoesDoMundo,
  obter,
  type PedidoDeEdicao,
  restaurar,
  tabelaVazia,
  verificarInvariantes,
} from "../src/index";
import { BRUNO, criarMundoDaProva, criarRoteiro, LIA, moradorDeNome } from "../src/testes";

const RACK = "rack_pes_2portas_vermelho";
const PERFIL = "a".repeat(64);
const PINTURAS = {
  formato: "morada.pinturas",
  versao: 1,
  perfis: [
    {
      catalogo: RACK,
      versaoDoCatalogo: 1,
      perfil: PERFIL,
      rotulo: "Estrutura",
      referencia: 0xc86432,
    },
  ],
} satisfies import("../src/index").CatalogoDePinturas;
function cenario(opcoes: OpcoesDoMundo = {}) {
  const bairro = copiar(BAIRRO_DA_PROVA);
  const familiaInicial = bairro.familias[0];
  const adulto = familiaInicial?.moradores.find((m) => m.nome === "Marcos");
  if (!familiaInicial || !adulto) throw new Error("Adulto da prova ausente");
  familiaInicial.moradores = [adulto];
  bairro.familias = [familiaInicial];
  bairro.avulsos = [];
  bairro.relacoes = [];
  const base = criarMundoDaProva({ definicao: bairro }).fotografar();
  const familia = listar(base.estado.familias)[0];
  const lote = familia?.loteId ? obter(base.estado.lotes, familia.loteId) : undefined;
  const imovel = lote?.imovelId ? obter(base.estado.imoveis, lote.imovelId) : undefined;
  const piso = imovel?.andares[0];
  if (!familia || !lote || !piso || !imovel) throw new Error("Casa da prova ausente");
  lote.tamanho = [8000, 6000];
  lote.entrada = [1125, 5125];
  piso.contorno = [
    [0, 0],
    [8000, 0],
    [8000, 6000],
    [0, 6000],
  ];
  piso.paredes = [];
  piso.aberturas = [];
  imovel.andares = [piso];
  base.estado.objetos = tabelaVazia();
  for (const pessoa of listar(base.estado.moradores))
    pessoa.local = { t: "lote", loteId: lote.id, andar: 0, pos: [...lote.entrada], frente: 0 };
  const mundo = restaurar(base, [], { conferirReplicacao: true, ...opcoes });
  if (opcoes.pinturasDisponiveis)
    mundo.aplicar({ t: "admitir_pinturas", catalogo: opcoes.pinturasDisponiveis });
  const entrar = (alvo: Mundo, perfilId = LIA) =>
    alvo.aplicar({ t: "sessao_entrou", perfilId, sessaoId: perfilId });
  entrar(mundo);
  const familiaAtual = () => {
    const atual = obter(mundo.estado.familias, familia.id);
    if (!atual) throw new Error("Família ausente");
    return atual;
  };
  const aplicar = (
    pedido: PedidoDeEdicao,
    perfilId = LIA,
    chave = comandoDeEdicao(perfilId, pedido.sequencia),
  ) =>
    mundo.aplicar({
      t: "intencao",
      sessaoId: perfilId,
      intencao: {
        mundoId: mundo.estado.id,
        comandoId: chave,
        moradorId: null,
        versaoEsperada: 0,
        acao: { t: "editar_casa", pedido },
      },
    });
  const compra = (
    sequencia = 1,
    catalogo = RACK,
    pos: [number, number, number] = [2000, 2000, 0],
  ): PedidoDeEdicao => ({
    familiaId: familia.id,
    loteId: lote.id,
    sequencia,
    operacao: {
      t: "comprar",
      catalogo,
      versaoDoCatalogo: 1,
      politicaDePrecos: 1,
      revisaoDoEspaco: obter(mundo.estado.lotes, lote.id)?.revisaoDoEspaco ?? 0,
      colocacao: { pos, andar: 0, giro: 0 },
      pintura: null,
    },
  });
  const objeto = () => {
    const item = listar(mundo.estado.objetos).find((item) => item.loteId === lote.id);
    if (!item) throw new Error("Móvel ausente");
    return item;
  };
  return {
    mundo,
    base,
    aplicar,
    compra,
    objeto,
    familiaAtual,
    entrar,
    familiaId: familia.id,
    loteId: lote.id,
  };
}

describe("edição autoritativa e durável da casa", () => {
  it("admite perfis pelo host uma vez e recupera a admissão pelo diário", () => {
    const c = cenario({ pinturasDisponiveis: PINTURAS });
    c.mundo.aplicar({ t: "admitir_pinturas", catalogo: PINTURAS });
    const saida = c.mundo.avancar(0);
    expect(saida.fatos).toHaveLength(1);
    expect(saida.fatos[0]?.dados.tipo).toBe("PinturasAdmitidas");
    expect(saida.mudancas).toContainEqual({ t: "c", chave: "catalogoDePinturas", valor: PINTURAS });
    const voltou = restaurar(c.base, [...saida.fatos, ...saida.fatos], {
      pinturasDisponiveis: PINTURAS,
    });
    expect(voltou.estado.catalogoDePinturas).toEqual(PINTURAS);
    expect(voltou.hash()).toBe(c.mundo.hash());
    expect(() =>
      voltou.aplicar({ t: "admitir_pinturas", catalogo: { ...PINTURAS, perfis: [] } }),
    ).toThrow(/instalado/);
  });

  it("conserva original, branco e preto distintos, sem alterar saldo ao pintar e reabrir", () => {
    const c = cenario({ pinturasDisponiveis: PINTURAS });
    const compra = c.compra();
    expect(c.aplicar(compra).ok).toBe(true);
    expect(c.objeto().pintura).toBeNull();
    const saldo = c.familiaAtual().fundo;
    const pintar = (sequencia: number, cor: number | null): PedidoDeEdicao => ({
      ...compra,
      sequencia,
      operacao: {
        t: "pintar",
        objetoId: c.objeto().id,
        revisaoDoObjeto: c.objeto().revisao,
        pintura: cor === null ? null : { perfil: PERFIL, cor },
      },
    });
    expect(c.aplicar(pintar(2, 0xffffff)).ok).toBe(true);
    expect(c.objeto().pintura).toEqual({ perfil: PERFIL, cor: 0xffffff });
    expect(c.aplicar(pintar(3, 0)).ok).toBe(true);
    expect(c.objeto().pintura).toEqual({ perfil: PERFIL, cor: 0 });
    expect(c.familiaAtual().fundo).toBe(saldo);
    const fatos = c.mundo.avancar(0).fatos;
    expect(restaurar(c.base, fatos, { pinturasDisponiveis: PINTURAS }).hash()).toBe(c.mundo.hash());
    expect(() => restaurar(c.base, fatos)).toThrow(/sem perfil/);
    expect(() =>
      restaurar(c.mundo.fotografar(), [], { pinturasDisponiveis: { ...PINTURAS, perfis: [] } }),
    ).toThrow(/sem perfil/);
    expect(c.aplicar(pintar(4, null)).ok).toBe(true);
    expect(c.objeto().pintura).toBeNull();
    expect(restaurar(c.mundo.fotografar()).hash()).toBe(c.mundo.hash());
  });

  it("recusa pintura sem perfil instalado/admitido antes de criar peça ou gastar", () => {
    for (const opcoes of [{}, { pinturasDisponiveis: PINTURAS }]) {
      const c = cenario(opcoes);
      const pedido = c.compra();
      if (pedido.operacao.t !== "comprar") throw new Error("Compra ausente");
      pedido.operacao.pintura = { perfil: "b".repeat(64), cor: 0 };
      const saldo = c.familiaAtual().fundo;
      const contadores = copiar(c.mundo.estado.contadores);
      expect(c.aplicar(pedido)).toMatchObject({
        ok: false,
        motivo: "nao_existe",
        detalhe: "pintura_indisponivel",
      });
      expect(listar(c.mundo.estado.objetos)).toHaveLength(0);
      expect(c.familiaAtual().fundo).toBe(saldo);
      expect(c.mundo.estado.contadores).toEqual(contadores);
      expect(c.aplicar(pedido)).toMatchObject({ ok: false, repetido: true });
    }
  });

  it("compra uma vez, confirma saldo/objeto/recibo num fato e restaura sem repetir o gasto", () => {
    const c = cenario();
    const saldo = c.familiaAtual().fundo;
    const pedido = c.compra();
    const resposta = c.aplicar(pedido);
    expect(resposta.ok).toBe(true);
    expect(resposta.edicao?.proximaSequencia).toBe(2);
    expect(c.familiaAtual().fundo).toBe(saldo - 24_000);
    const saida = c.mundo.avancar(0);
    expect(saida.fatos).toHaveLength(1);
    expect(saida.fatos[0]?.dados.tipo).toBe("EdicaoRegistrada");
    expect(c.objeto().revisao).toBe(1);
    const recuperado = restaurar(c.base, saida.fatos);
    expect(recuperado.hash()).toBe(c.mundo.hash());
    expect(restaurar(c.base, [...saida.fatos, ...saida.fatos]).hash()).toBe(c.mundo.hash());
    expect(c.aplicar(pedido)).toMatchObject({ ok: true, repetido: true });
    expect(c.familiaAtual().fundo).toBe(saldo - 24_000);
    expect(c.mundo.avancar(0).fatos).toEqual([]);
  });

  it("não compra de novo após expulsão da memória genérica, nem com outra chave ou conteúdo", () => {
    const c = cenario();
    const pedido = c.compra();
    expect(c.aplicar(pedido).ok).toBe(true);
    for (let n = 0; n < 600; n++)
      c.mundo.aplicar({
        t: "intencao",
        sessaoId: LIA,
        intencao: {
          mundoId: c.mundo.estado.id,
          comandoId: `normal-${n.toString().padStart(5, "0")}`,
          moradorId: null,
          versaoEsperada: 0,
          acao: { t: "votar_velocidade", velocidade: 1 },
        },
      });
    c.mundo.avancar(0);
    const saldo = c.familiaAtual().fundo;
    const contador = c.mundo.estado.contadores.obj;
    expect(c.aplicar(pedido)).toMatchObject({ ok: true, repetido: true });
    expect(c.aplicar(pedido, LIA, "outro-comando")).toMatchObject({
      ok: false,
      motivo: "comando_invalido",
    });
    const alterado = copiar(pedido);
    if (alterado.operacao.t !== "comprar") throw new Error("Compra ausente");
    alterado.operacao.pintura = { perfil: PERFIL, cor: 0 };
    expect(c.aplicar(alterado)).toMatchObject({ ok: false, motivo: "comando_invalido" });
    expect(c.familiaAtual().fundo).toBe(saldo);
    expect(c.mundo.estado.contadores.obj).toBe(contador);
    expect(listar(c.mundo.estado.objetos)).toHaveLength(1);
  });

  it("cobra permissão atual no reenvio e gestão financeira acima de 500 M$", () => {
    const c = cenario();
    c.mundo.aplicar({
      t: "conceder_acesso",
      perfilId: BRUNO,
      familiaId: c.familiaId,
      permissoes: ["decorar", "gastar"],
    });
    c.entrar(c.mundo, BRUNO);
    expect(c.aplicar(c.compra(1, "cama_casal_classica_terracota"), BRUNO)).toMatchObject({
      ok: false,
      motivo: "sem_permissao",
    });
    expect(c.mundo.estado.edicoes).toEqual([]);
    const pedido = c.compra();
    expect(c.aplicar(pedido, BRUNO).ok).toBe(true);
    c.mundo.aplicar({
      t: "conceder_acesso",
      perfilId: BRUNO,
      familiaId: c.familiaId,
      permissoes: ["decorar"],
    });
    const saldo = c.familiaAtual().fundo;
    expect(c.aplicar(pedido, BRUNO)).toMatchObject({ ok: false, motivo: "sem_permissao" });
    expect(c.familiaAtual().fundo).toBe(saldo);
    c.mundo.aplicar({ t: "revogar_acesso", perfilId: BRUNO, familiaId: c.familiaId });
    expect(c.aplicar(pedido, BRUNO)).toMatchObject({ ok: false, motivo: "sem_permissao" });
  });

  it("mover/pintar/vender usam revisões atuais e não reaparecem ao repetir a compra", () => {
    const c = cenario({ pinturasDisponiveis: PINTURAS });
    const inicial = c.familiaAtual().fundo;
    const compra = c.compra();
    expect(c.aplicar(compra).ok).toBe(true);
    const objeto = c.objeto();
    const mover: PedidoDeEdicao = {
      ...compra,
      sequencia: 2,
      operacao: {
        t: "mover",
        objetoId: objeto.id,
        revisaoDoObjeto: 1,
        revisaoDoEspaco: 2,
        colocacao: { pos: [4000, 2000, 0], andar: 0, giro: 90 },
      },
    };
    expect(c.aplicar(mover).ok).toBe(true);
    expect(c.objeto()).toMatchObject({ revisao: 2, pos: [4000, 2000, 0], giro: 90 });
    const pintar: PedidoDeEdicao = {
      ...compra,
      sequencia: 3,
      operacao: {
        t: "pintar",
        objetoId: objeto.id,
        revisaoDoObjeto: 2,
        pintura: { perfil: PERFIL, cor: 0x775511 },
      },
    };
    expect(c.aplicar(pintar).ok).toBe(true);
    expect(c.objeto()).toMatchObject({
      revisao: 3,
      pintura: { perfil: PERFIL, cor: 0x775511 },
      cor: 0xffffff,
    });
    const vender: PedidoDeEdicao = {
      ...compra,
      sequencia: 4,
      operacao: {
        t: "vender",
        objetoId: objeto.id,
        revisaoDoObjeto: 3,
        revisaoDoEspaco: 3,
        politicaDePrecos: 1,
      },
    };
    expect(c.aplicar(vender).ok).toBe(true);
    expect(listar(c.mundo.estado.objetos)).toEqual([]);
    expect(c.familiaAtual().fundo).toBe(inicial - 24_000 + 12_000);
    expect(c.aplicar(compra)).toMatchObject({
      ok: true,
      repetido: true,
      edicao: { proximaSequencia: 5 },
    });
    expect(listar(c.mundo.estado.objetos)).toEqual([]);
    expect(verificarInvariantes(c.mundo.estado)).toEqual([]);
    const fatos = c.mundo.avancar(0).fatos;
    expect(restaurar(c.base, fatos).hash()).toBe(c.mundo.hash());
  });

  it("duas edições incompatíveis não sobrescrevem a primeira", () => {
    const c = cenario();
    const compra = c.compra();
    expect(c.aplicar(compra).ok).toBe(true);
    c.mundo.aplicar({
      t: "conceder_acesso",
      perfilId: BRUNO,
      familiaId: c.familiaId,
      permissoes: ["decorar"],
    });
    c.entrar(c.mundo, BRUNO);
    const pedido: PedidoDeEdicao = {
      ...compra,
      sequencia: 2,
      operacao: {
        t: "mover",
        objetoId: c.objeto().id,
        revisaoDoObjeto: 1,
        revisaoDoEspaco: 2,
        colocacao: { pos: [4000, 2000, 0], andar: 0, giro: 0 },
      },
    };
    expect(c.aplicar(pedido).ok).toBe(true);
    expect(c.aplicar({ ...pedido, sequencia: 1 }, BRUNO)).toMatchObject({
      ok: false,
      motivo: "versao_antiga",
    });
    expect(c.objeto()).toMatchObject({ revisao: 2, pos: [4000, 2000, 0] });
  });

  it("recusa colocação e fato grande antes de gastar ou consumir ID de objeto", () => {
    for (const limite of [undefined, 512]) {
      const c = cenario({ maxBytesPorFato: limite });
      const saldo = c.familiaAtual().fundo;
      const contador = c.mundo.estado.contadores.obj;
      const pedido = c.compra(1, RACK, limite ? [2000, 2000, 0] : [0, 0, 0]);
      expect(c.aplicar(pedido).ok).toBe(false);
      expect(c.familiaAtual().fundo).toBe(saldo);
      expect(c.mundo.estado.contadores.obj).toBe(contador);
      expect(listar(c.mundo.estado.objetos)).toEqual([]);
      expect(
        c.mundo
          .avancar(0)
          .fatos.every(
            (fato) => fato.dados.tipo === "EdicaoRegistrada" && fato.dados.efeito === null,
          ),
      ).toBe(true);
    }
  });

  it("saldo posterior não transforma em compra o reenvio de uma recusa já admitida", () => {
    const c = cenario();
    c.familiaAtual().fundo = 0;
    const pedido = c.compra();
    expect(c.aplicar(pedido)).toMatchObject({ ok: false, detalhe: "saldo_insuficiente" });
    const foto = c.mundo.fotografar();
    const familia = obter(foto.estado.familias, c.familiaId);
    if (!familia) throw new Error("Família ausente");
    familia.fundo = 500_000;
    const recuperado = restaurar(foto);
    c.entrar(recuperado);
    const resultado = recuperado.aplicar({
      t: "intencao",
      sessaoId: LIA,
      intencao: {
        mundoId: recuperado.estado.id,
        comandoId: comandoDeEdicao(LIA, 1),
        moradorId: null,
        versaoEsperada: 0,
        acao: { t: "editar_casa", pedido },
      },
    });
    expect(resultado).toMatchObject({ ok: false, repetido: true, detalhe: "saldo_insuficiente" });
    expect(obter(recuperado.estado.familias, c.familiaId)?.fundo).toBe(500_000);
    expect(listar(recuperado.estado.objetos)).toEqual([]);
  });

  it("venda depois de sair da cama não restaura ocupação antiga apontando para o móvel removido", () => {
    const c = cenario();
    const compra = c.compra(1, "cama_casal_classica_terracota", [3000, 2500, 0]);
    expect(c.aplicar(compra).ok).toBe(true);
    const cama = c.objeto();
    const roteiro = criarRoteiro(c.mundo);
    const pessoa = moradorDeNome(c.mundo, "Marcos");
    expect(roteiro.comandar(LIA, pessoa.id, { t: "reservar" }).ok).toBe(true);
    expect(
      roteiro.comandar(LIA, pessoa.id, {
        t: "interagir",
        interacao: "dormir",
        alvo: { t: "objeto", objetoId: cama.id },
      }).ok,
    ).toBe(true);
    roteiro.ate(() => moradorDeNome(c.mundo, "Marcos").local.t === "objeto", 200, "deitar na cama");
    const antiga = c.mundo.fotografar();
    expect(Object.keys(obter(antiga.estado.objetos, cama.id)?.ocupacao ?? {})).not.toHaveLength(0);
    const dormir = moradorDeNome(c.mundo, "Marcos").acaoAtual;
    if (!dormir) throw new Error("Ação de dormir ausente");
    expect(roteiro.comandar(LIA, pessoa.id, { t: "cancelar_acao", acaoId: dormir }).ok).toBe(true);
    expect(roteiro.comandar(LIA, pessoa.id, { t: "ir_para", pos: [1125, 5125], andar: 0 }).ok).toBe(
      true,
    );
    roteiro.ate(
      () => {
        const atual = moradorDeNome(c.mundo, "Marcos");
        return atual.local.t === "lote" && atual.movimento === null;
      },
      200,
      "sair da cama e chegar à entrada",
    );
    c.mundo.avancar(0);
    expect(
      c.aplicar({
        ...compra,
        sequencia: 2,
        operacao: {
          t: "vender",
          objetoId: cama.id,
          revisaoDoObjeto: 1,
          revisaoDoEspaco: 2,
          politicaDePrecos: 1,
        },
      }).ok,
    ).toBe(true);
    const voltou = restaurar(antiga, c.mundo.avancar(0).fatos);
    expect(obter(voltou.estado.objetos, cama.id)).toBeUndefined();
    expect(moradorDeNome(voltou, "Marcos").local.t).toBe("lote");
    expect(verificarInvariantes(voltou.estado)).toEqual([]);
  });

  it("queda depois de uma compra conserva a posição atual, em vez de retomar rota da fotografia antiga", () => {
    const c = cenario();
    const roteiro = criarRoteiro(c.mundo);
    const pessoa = moradorDeNome(c.mundo, "Marcos");
    expect(roteiro.comandar(LIA, pessoa.id, { t: "reservar" }).ok).toBe(true);
    expect(roteiro.comandar(LIA, pessoa.id, { t: "ir_para", pos: [6500, 5125], andar: 0 }).ok).toBe(
      true,
    );
    roteiro.andar(1);
    const antiga = c.mundo.fotografar();
    expect(moradorDeNome(c.mundo, "Marcos").movimento).not.toBeNull();
    roteiro.ate(
      () => moradorDeNome(c.mundo, "Marcos").movimento === null,
      200,
      "chegar ao destino",
    );
    c.mundo.avancar(0);
    expect(c.aplicar(c.compra(1, RACK, [2500, 5000, 0])).ok).toBe(true);
    const fatos = c.mundo.avancar(0).fatos;
    const voltou = restaurar(antiga, fatos);
    expect(moradorDeNome(voltou, "Marcos").local).toEqual(moradorDeNome(c.mundo, "Marcos").local);
    expect(moradorDeNome(voltou, "Marcos").movimento).toBeNull();
    expect(listar(voltou.estado.objetos)).toEqual(listar(c.mundo.estado.objetos));
    expect(verificarInvariantes(voltou.estado)).toEqual([]);
  });
});
