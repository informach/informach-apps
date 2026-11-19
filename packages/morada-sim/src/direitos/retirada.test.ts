import { describe, expect, it } from "vitest";
import { comandoDeEdicao } from "../comandos/identidade-da-edicao";
import { BAIRRO_INICIAL } from "../conteudo";
import { novoId } from "../dominio/estado";
import { verificarInvariantes } from "../dominio/invariantes";
import { CONTADOR_DE_REVISOES_DOS_OBJETOS } from "../dominio/revisao-dos-objetos";
import { inserir, listar } from "../dominio/tabela";
import type { EstadoDoMundo } from "../dominio/tipos";
import { criarMundo, restaurar } from "../execucao";
import { abrirFotografia, type Fotografia } from "../formatos/fotografia";
import { copiar } from "../nucleo/canonico";
import { BRUNO, criarMundoDaProva, LIA } from "../testes";
import { prepararRetiradaNaFotografiaDoMorada as retirarFoto } from "./fotografia";
import { prepararRetiradaPessoalDoMorada as retirar } from "./retirada";

function fundacao() {
  const mundo = criarMundo({
    mundoId: "mundo-privado",
    semente: 42,
    definicao: BAIRRO_INICIAL,
    fundadores: [],
  });
  mundo.aplicar({
    t: "sessao_entrou",
    sessaoId: "fundador",
    perfilId: LIA,
    podeFundarFamilia: true,
  });
  const resultado = mundo.aplicar({
    t: "intencao",
    sessaoId: "fundador",
    intencao: {
      mundoId: mundo.estado.id,
      comandoId: "fundacao-pessoal-original",
      moradorId: null,
      versaoEsperada: 0,
      acao: {
        t: "fundar_familia",
        rascunho: {
          nome: "Nome pessoal da família",
          moradores: [
            {
              nome: "Nome pessoal",
              fase: "adulto",
              linha: "f",
              pele: 0xc68058,
              cabelo: "coque_alto",
              roupa: "casual_vestido",
              tracos: ["carinhoso"],
            },
          ],
          relacoes: [],
        },
      },
    },
  });
  expect(resultado.ok).toBe(true);
  return mundo;
}
const politica = { retirarTextosDaFundacao: true };
const base = () => criarMundoDaProva({ fundadores: [LIA, BRUNO] }).estado;
function primeiroMorador(estado: EstadoDoMundo) {
  const primeiro = listar(estado.moradores)[0];
  if (!primeiro) throw new Error("Resident absent");
  return primeiro;
}

describe("Morada: retirada pessoal pura sem perder progresso compartilhado", () => {
  it("retira acesso, preferência e autoria de pedido, preservando o outro perfil e a história", () => {
    const antes = base();
    const morador = primeiroMorador(antes),
      outro = listar(antes.moradores)[1];
    if (!outro) throw new Error("Second resident absent");
    morador.preferidoDe = LIA;
    outro.preferidoDe = BRUNO;
    const id = novoId(antes, "ped");
    inserir(antes.pedidos, id, {
      id,
      tipo: "namoro",
      de: morador.id,
      para: outro.id,
      autor: LIA,
      criadoTick: 0,
      estado: "aberto",
      motivo: null,
    });
    expect(verificarInvariantes(antes)).toEqual([]);
    const original = copiar(antes);
    const depois = retirar(antes, LIA, politica);
    expect(antes).toEqual(original);
    expect(depois.acessos).toEqual(antes.acessos.filter((a) => a.perfilId === BRUNO));
    expect(depois.moradores.porId[morador.id]?.preferidoDe).toBeUndefined();
    expect(depois.moradores.porId[outro.id]).toEqual(antes.moradores.porId[outro.id]);
    expect(depois.pedidos.porId[id]).toEqual({ ...antes.pedidos.porId[id], autor: null });
    expect(depois.relacoes).toEqual(antes.relacoes);
    expect(depois.familias).toEqual(antes.familias);
    expect(depois.objetos).toEqual(antes.objetos);
    expect(verificarInvariantes(depois)).toEqual([]);
  });

  it("é idempotente e não muda relógio, sorteio, IDs ou saldos", () => {
    const antes = base();
    primeiroMorador(antes).preferidoDe = LIA;
    const uma = retirar(antes, LIA, politica);
    expect(retirar(uma, LIA, politica)).toEqual(uma);
    expect(uma.relogio).toEqual(antes.relogio);
    expect(uma.contadores).toEqual(antes.contadores);
    expect(uma.semente).toBe(antes.semente);
    expect(uma.moradores.ordem).toEqual(antes.moradores.ordem);
    expect(uma.familias).toEqual(antes.familias);
  });

  it("exige a decisão explícita sobre textos de fundação e não altera a origem ao recusar", () => {
    const antes = fundacao().estado,
      original = copiar(antes);
    expect(() => retirar(antes, LIA, { retirarTextosDaFundacao: false })).toThrowError(
      expect.objectContaining({ codigo: "TEXTOS_DA_FUNDACAO" }),
    );
    expect(antes).toEqual(original);
  });

  it("retira nomes atribuídos e conserva a fundação, moradores, finanças e relações", () => {
    const mundo = fundacao(),
      antes = copiar(mundo.estado);
    const depois = retirar(mundo.estado, LIA, politica);
    const morador = primeiroMorador(antes),
      redigido = depois.moradores.porId[morador.id];
    expect(redigido).toBeDefined();
    expect(redigido?.nome).toBe(`Morador ${morador.id.slice(4)}`);
    expect(redigido?.versao).toBe(morador.versao + 1);
    expect(redigido?.aparencia).toEqual(morador.aparencia);
    expect(redigido?.local).toEqual(morador.local);
    expect(redigido?.necessidades).toEqual(morador.necessidades);
    expect(redigido?.familiaId).toBe(morador.familiaId);
    expect(depois.fundacao).toMatchObject({
      autor: "perfil-retirado",
      familiaId: antes.fundacao?.familiaId,
      resultado: { ...antes.fundacao?.resultado, comandoId: "fundacao-sem-autoria-pessoal" },
    });
    expect(listar(depois.familias).map((f) => [f.id, f.fundo, f.vidaMs])).toEqual(
      listar(antes.familias).map((f) => [f.id, f.fundo, f.vidaMs]),
    );
    expect(depois.relacoes).toEqual(antes.relacoes);
    expect(depois.objetos).toEqual(antes.objetos);
    expect(JSON.stringify(depois)).not.toContain(LIA);
    expect(JSON.stringify(depois)).not.toContain("Nome pessoal");
    expect(retirar(depois, LIA, { retirarTextosDaFundacao: false })).toEqual(depois);
    expect(
      verificarInvariantes(restaurar({ ...mundo.fotografar(), estado: depois }).estado),
    ).toEqual([]);
    expect(mundo.estado).toEqual(antes);
  });

  it("mudar a família do morador não oculta o nome atribuível ao fundador original", () => {
    const antes = fundacao().estado,
      morador = primeiroMorador(antes);
    const id = novoId(antes, "fam");
    inserir(antes.familias, id, {
      id,
      nome: "Outra família preservada",
      loteId: null,
      fundo: 700,
      vidaMs: 0,
      versao: 1,
    });
    morador.familiaId = id;
    expect(verificarInvariantes(antes)).toEqual([]);
    const depois = retirar(antes, LIA, politica);
    expect(depois.moradores.porId[morador.id]?.nome).not.toBe(morador.nome);
    expect(depois.moradores.porId[morador.id]?.familiaId).toBe(id);
    expect(depois.familias.porId[id]).toEqual(antes.familias.porId[id]);
  });

  it("retira apenas recibos de edição atribuídos, preservando os recibos de outro autor", () => {
    const antes = base();
    antes.edicoes.push(
      { autor: LIA, ultimaSequencia: 1, recentes: [] },
      { autor: BRUNO, ultimaSequencia: 1, recentes: [] },
    );
    const proprio = comandoDeEdicao(LIA, 1),
      alheio = comandoDeEdicao(BRUNO, 1);
    antes.comandos.push(
      ...[proprio, alheio].map((comandoId) => ({
        comandoId,
        resultado: {
          ok: true as const,
          comandoId,
          tick: 0,
          versoes: {},
        },
      })),
    );
    const depois = retirar(antes, LIA, politica);
    expect(depois.edicoes).toEqual(antes.edicoes.filter((e) => e.autor === BRUNO));
    expect(depois.comandos.find((c) => c.comandoId === alheio)).toEqual(
      antes.comandos.find((c) => c.comandoId === alheio),
    );
    expect(depois.comandos.some((c) => c.comandoId === proprio)).toBe(false);
  });

  it("referência inesperada em texto impede concluir; não faz substituição genérica", () => {
    const antes = base(),
      bairro = listar(antes.bairros)[0];
    if (!bairro) throw new Error("Neighborhood absent");
    bairro.nome = `Referência ${LIA} a revisar`;
    const original = copiar(antes);
    expect(() => retirar(antes, LIA, politica)).toThrowError(
      expect.objectContaining({ codigo: "REFERENCIA_REMANESCENTE" }),
    );
    expect(antes).toEqual(original);
  });

  it("não admite o marcador como identidade nem satura revisão para aparentar sucesso", () => {
    expect(() => retirar(base(), "perfil-retirado", politica)).toThrow();
    const antes = base(),
      morador = primeiroMorador(antes);
    morador.preferidoDe = LIA;
    morador.versao = Number.MAX_SAFE_INTEGER;
    expect(() => retirar(antes, LIA, politica)).toThrowError(
      expect.objectContaining({ codigo: "LIMITE" }),
    );
    expect(morador.preferidoDe).toBe(LIA);
    expect(morador.versao).toBe(Number.MAX_SAFE_INTEGER);
  });
});

/** Fixture sintética com os campos existentes antes dos formatos V2/V3. A
 * compatibilidade com o processo publicado ainda exige a jornada do host. */
function legado(foto: Fotografia, versao: 1 | 2) {
  const { loja, catalogoDePinturas, edicoes, historicoDaCasa, ...antigo } = foto.estado;
  expect(loja).toBeDefined();
  expect(catalogoDePinturas).toBeNull();
  expect(edicoes).toEqual([]);
  expect(historicoDaCasa).toEqual([]);
  const contadores = { ...antigo.contadores };
  delete contadores[CONTADOR_DE_REVISOES_DOS_OBJETOS];
  const objetos = {
    ...antigo.objetos,
    porId: Object.fromEntries(
      Object.entries(antigo.objetos.porId).map(([id, obj]) => {
        const { revisao, pintura, ...resto } = obj;
        expect(revisao).toBe(1);
        expect(pintura).toBeNull();
        return [id, resto];
      }),
    ),
  };
  const v2 = { ...antigo, versao, contadores, objetos };
  if (versao === 2) return { ...foto, estado: v2 };
  const { fundacao: recibo, catalogoDeAparencias, ...v1 } = v2;
  expect(recibo).toBeNull();
  expect(catalogoDeAparencias).toBeNull();
  return { ...foto, estado: v1 };
}

describe("Morada: retirada em fotografia conserva o formato persistido", () => {
  it.each([1, 2] as const)("conserva V%s sem reiniciar moradores, saldos ou relógio", (versao) => {
    const mundo = criarMundoDaProva({ fundadores: [LIA, BRUNO] });
    primeiroMorador(mundo.estado).preferidoDe = LIA;
    const foto = legado(mundo.fotografar(), versao),
      original = copiar(foto);
    const saida = retirarFoto(foto, LIA, politica);
    expect(saida.estado.versao).toBe(versao);
    expect(saida.versao).toBe(1);
    expect(Object.keys(saida.estado).sort()).toEqual(Object.keys(foto.estado).sort());
    expect(saida.estado).not.toHaveProperty("loja");
    const reaberta = abrirFotografia(saida);
    expect(reaberta.estado.moradores.ordem).toEqual(mundo.estado.moradores.ordem);
    expect(reaberta.estado.familias).toEqual(mundo.estado.familias);
    expect(reaberta.estado.relogio).toEqual(mundo.estado.relogio);
    expect(reaberta.estado.acessos).toEqual(
      mundo.estado.acessos.filter((a) => a.perfilId === BRUNO),
    );
    expect(verificarInvariantes(reaberta.estado)).toEqual([]);
    expect(retirarFoto(saida, LIA, politica)).toEqual(saida);
    expect(foto).toEqual(original);
  });

  it("retira nomes de uma fundação V2 sem promover a versão gravada", () => {
    const mundo = fundacao();
    const foto = legado(mundo.fotografar(), 2);
    const saida = retirarFoto(foto, LIA, politica);
    expect(saida.estado.versao).toBe(2);
    expect(JSON.stringify(saida)).not.toContain("Nome pessoal");
    expect(JSON.stringify(saida)).not.toContain(LIA);
    expect(abrirFotografia(saida).estado.fundacao?.autor).toBe("perfil-retirado");
  });

  it("conserva V3 e recusa versão futura ou campo raiz desconhecido", () => {
    const foto = criarMundoDaProva({ fundadores: [LIA] }).fotografar();
    expect(retirarFoto(foto, LIA, politica).estado.versao).toBe(3);
    expect(() =>
      retirarFoto({ ...foto, estado: { ...foto.estado, versao: 4 } }, LIA, politica),
    ).toThrow();
    expect(() =>
      retirarFoto({ ...foto, estado: { ...foto.estado, campoNovo: "conteudo" } }, LIA, politica),
    ).toThrow();
  });

  it("recusa legado com campo novo que a migração em memória descartaria", () => {
    const foto = legado(criarMundoDaProva().fotografar(), 2);
    foto.estado.contadores[CONTADOR_DE_REVISOES_DOS_OBJETOS] = 7;
    expect(() => retirarFoto(foto, LIA, politica)).toThrowError(
      expect.objectContaining({ codigo: "INTEGRIDADE" }),
    );
    expect(foto.estado.contadores[CONTADOR_DE_REVISOES_DOS_OBJETOS]).toBe(7);
  });

  it("não reescreve envelope com relógio ou mundo divergente", () => {
    const foto = criarMundoDaProva().fotografar();
    expect(() => retirarFoto({ ...foto, tick: foto.tick + 1 }, LIA, politica)).toThrow();
    expect(() => retirarFoto({ ...foto, mundoId: "outro-mundo" }, LIA, politica)).toThrow();
  });
});
