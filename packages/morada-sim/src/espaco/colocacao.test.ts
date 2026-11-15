import { describe, expect, it } from "vitest";
import { doCatalogo } from "../conteudo";
import { inserir, listar, tabelaVazia } from "../dominio/tabela";
import type { Objeto, PontoMm } from "../dominio/tipos";
import { copiar } from "../nucleo/canonico";
import { criarMundoDaProva } from "../testes";
import { conferirColocacaoNoChao, pegadaNoLote } from "./colocacao";

const rack = "rack_pes_2portas_vermelho";
function movel(campos: Partial<Objeto> = {}): Objeto {
  return {
    id: "obj_900001",
    loteId: "lote_000001",
    catalogo: rack,
    versao: 1,
    pos: [2000, 2000, 0],
    andar: 0,
    giro: 0,
    cor: 0xffffff,
    ocupacao: {},
    ...campos,
  };
}

function contexto() {
  const estado = criarMundoDaProva().estado;
  const lote = listar(estado.lotes)[0];
  const imovel = lote?.imovelId ? estado.imoveis.porId[lote.imovelId] : undefined;
  const piso = imovel?.andares[0];
  const pessoa = listar(estado.moradores)[0];
  if (!lote || !piso || !pessoa) throw new Error("Mundo da prova incompleto");
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
  estado.objetos = tabelaVazia();
  estado.moradores = tabelaVazia();
  estado.acoes = tabelaVazia();
  return { estado, lote, piso, pessoa: copiar(pessoa) };
}

describe("colocação de móveis no piso térreo", () => {
  it("transforma a pegada assimétrica nos quatro giros, sem alterar o objeto", () => {
    const objeto = movel();
    const anterior = copiar(objeto);
    expect(pegadaNoLote(objeto)).toEqual([1350, 1755, 2650, 2210]);
    expect(pegadaNoLote(movel({ giro: 90 }))).toEqual([1790, 1350, 2245, 2650]);
    expect(pegadaNoLote(movel({ giro: 180 }))).toEqual([1350, 1790, 2650, 2245]);
    expect(pegadaNoLote(movel({ giro: 270 }))).toEqual([1755, 1350, 2210, 2650]);
    expect(pegadaNoLote(movel({ giro: 45 }))).toBeNull();
    expect(objeto).toEqual(anterior);
  });

  it("aceita posição livre e a avaliação não altera o mundo", () => {
    const { estado } = contexto();
    const antes = JSON.stringify(estado);
    expect(conferirColocacaoNoChao(estado, "obj_900001", movel())).toBeNull();
    expect(JSON.stringify(estado)).toBe(antes);
  });

  it("recusa borda fora do lote, fora da grade, catálogo ou fixação incompatíveis", () => {
    const { estado } = contexto();
    for (const [objeto, motivo] of [
      [movel({ pos: [500, 2000, 0] }), "fora_do_lote"],
      [movel({ pos: [2001, 2000, 0] }), "fora_da_grade"],
      [movel({ versao: 2 }), "catalogo_incompativel"],
      [movel({ andar: 1 }), "fixacao_nao_suportada"],
      [movel({ pos: [2000, 2000, 10] }), "fixacao_nao_suportada"],
    ] as const)
      expect(conferirColocacaoNoChao(estado, objeto.id, objeto)).toBe(motivo);
  });

  it("contato tangente na parede é permitido, atravessar a parede ou seu vão é recusado", () => {
    const { estado, piso } = contexto();
    piso.paredes = [{ id: "p1", a: [4000, 0], b: [4000, 6000] }];
    piso.aberturas = [
      {
        id: "p1-porta",
        parede: "p1",
        centro: [4000, 3000],
        largura: 1000,
        altura: 2100,
        peitoril: 0,
        externa: false,
        tipo: "porta",
      },
    ];
    expect(conferirColocacaoNoChao(estado, "obj_900001", movel({ pos: [4000, 3000, 0] }))).toBe(
      "parede",
    );
    piso.paredes = [{ id: "tangente", a: [2650, 1000], b: [2650, 3000] }];
    expect(conferirColocacaoNoChao(estado, "obj_900001", movel())).toBeNull();
    piso.paredes[0] = { id: "corta", a: [2649, 1000], b: [2649, 3000] };
    expect(conferirColocacaoNoChao(estado, "obj_900001", movel())).toBe("parede");
  });

  it("recusa a reentrância do piso mesmo quando os quatro cantos cabem", () => {
    const { estado, piso } = contexto();
    piso.contorno = [
      [0, 0],
      [8000, 0],
      [8000, 6000],
      [2200, 6000],
      [2200, 1950],
      [1800, 1950],
      [1800, 6000],
      [0, 6000],
    ];
    expect(conferirColocacaoNoChao(estado, "obj_900001", movel())).toBe("fora_do_piso");
  });

  it("colisão física independe de bloquear a navegação; tapete admite móvel por cima", () => {
    const { estado } = contexto();
    const pequeno = movel({ id: "obj_900002", catalogo: "brinquedo_bola_vermelha" });
    expect(doCatalogo(pequeno.catalogo)?.bloqueia).toBe(false);
    inserir(estado.objetos, pequeno.id, pequeno);
    expect(conferirColocacaoNoChao(estado, "obj_900001", movel())).toBe("colisao");
    pequeno.catalogo = "tapete_redondo_aneis_turquesa";
    expect(conferirColocacaoNoChao(estado, "obj_900001", movel())).toBeNull();
  });

  it("recusa mover ou vender peça ocupada e suporte de uma peça apoiada", () => {
    const { estado } = contexto();
    const objeto = movel({ ocupacao: { sentar: "mor_000001" } });
    inserir(estado.objetos, objeto.id, objeto);
    expect(conferirColocacaoNoChao(estado, objeto.id, null)).toBe("ocupado");
    objeto.ocupacao = {};
    const apoiado = movel({
      id: "obj_900002",
      catalogo: "brinquedo_bola_vermelha",
      pos: [2000, 2000, 560],
    });
    inserir(estado.objetos, apoiado.id, apoiado);
    expect(conferirColocacaoNoChao(estado, objeto.id, null)).toBe("ocupado");
  });

  it("recusa atravessar morador e a rota de uma ação admitida", () => {
    const { estado, pessoa, lote } = contexto();
    pessoa.local = { t: "lote", loteId: lote.id, andar: 0, pos: [2000, 2000], frente: 0 };
    pessoa.movimento = null;
    inserir(estado.moradores, pessoa.id, pessoa);
    expect(conferirColocacaoNoChao(estado, "obj_900001", movel())).toBe("acesso_bloqueado");
    pessoa.local.pos = [1000, 2000];
    const rota: PontoMm[] = [
      [1000, 2000],
      [3500, 2000],
    ];
    pessoa.movimento = { rota, inicioTick: estado.relogio.tick, mmPorTick: 130, v: 1 };
    expect(conferirColocacaoNoChao(estado, "obj_900001", movel())).toBe("ocupado");
  });

  it("impede bloquear a única porta que dava acesso a quem está do outro lado", () => {
    const { estado, piso, pessoa, lote } = contexto();
    piso.paredes = [{ id: "p1", a: [4000, 0], b: [4000, 6000] }];
    piso.aberturas = [
      {
        id: "porta",
        parede: "p1",
        centro: [4000, 3000],
        largura: 1000,
        peitoril: 0,
        altura: 2100,
        tipo: "porta",
        externa: false,
      },
    ];
    pessoa.local = { t: "lote", loteId: lote.id, andar: 0, pos: [6500, 3000], frente: 0 };
    pessoa.movimento = null;
    inserir(estado.moradores, pessoa.id, pessoa);
    const barreira = movel({ catalogo: "poltrona_capitone_couro", pos: [3500, 3000, 0] });
    // Esta pegada fica antes da linha da parede, cobrindo todo o acesso à porta.
    expect(conferirColocacaoNoChao(estado, barreira.id, barreira)).toBe("acesso_bloqueado");
  });
});
