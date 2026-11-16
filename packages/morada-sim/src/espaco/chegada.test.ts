import { describe, expect, it } from "vitest";
import { BAIRRO_INICIAL } from "../conteudo";
import { listar, obter, tabelaVazia } from "../dominio/tabela";
import type { Objeto } from "../dominio/tipos";
import { criarMundo } from "../execucao";
import { chegadaDaFamilia } from "./chegada";
import { pegadaNoLote } from "./colocacao";
import { criarNavegador } from "./navegador";

function cenario() {
  const mundo = criarMundo({
    mundoId: "chegada",
    semente: 42,
    definicao: BAIRRO_INICIAL,
    fundadores: [],
  });
  const estado = mundo.fotografar().estado;
  const lote = listar(estado.lotes).find((l) => l.imovelId);
  const imovel = lote?.imovelId ? obter(estado.imoveis, lote.imovelId) : null;
  const piso = imovel?.andares[0];
  if (!lote || !imovel || !piso) throw new Error("Casa ausente");
  lote.tamanho = [6000, 6000];
  lote.entrada = [125, 125];
  piso.paredes = [];
  piso.aberturas = [];
  estado.objetos = tabelaVazia();
  estado.moradores = tabelaVazia();
  const objeto = (catalogo: string): Objeto => ({
    id: "obj_chegada",
    loteId: lote.id,
    catalogo,
    versao: 1,
    revisao: 1,
    pos: [625, 625, piso.z],
    andar: 0,
    giro: 0,
    cor: 0xffffff,
    pintura: null,
    ocupacao: {},
  });
  const inserir = (o: Objeto) => {
    estado.objetos = { ordem: [o.id], porId: { [o.id]: o } };
  };
  const chegada = (n = 1) =>
    chegadaDaFamilia(estado, lote, criarNavegador(lote, imovel, listar(estado.objetos)), n);
  return { estado, lote, piso, objeto, inserir, chegada };
}

describe("chegada sem sobreposição física", () => {
  it("entrada na borda mantém o corpo inteiro dentro do lote", () => {
    const c = cenario();
    expect(c.chegada()).toEqual([[375, 375]]);
    const pontos = c.chegada(8);
    expect(pontos).toHaveLength(8);
    for (const [x, y] of pontos ?? []) {
      expect(x).toBeGreaterThanOrEqual(300);
      expect(y).toBeGreaterThanOrEqual(300);
      expect(x).toBeLessThanOrEqual(5700);
      expect(y).toBeLessThanOrEqual(5700);
    }
  });

  it.each([
    "tapete_persa_medalhao",
    "tapete_persa_pequeno",
    "tapete_listras_amarelo_verde",
    "tapete_redondo_aneis_turquesa",
  ])("%s não ocupa o volume de quem chega", (catalogo) => {
    const c = cenario();
    c.inserir(c.objeto(catalogo));
    expect(c.chegada()).toEqual([[375, 375]]);
  });

  it("a distância até o móvel considera o corpo inteiro, além da célula navegável", () => {
    const c = cenario(),
      objeto = c.objeto("rack_pes_2portas_vermelho");
    objeto.pos = [1125, 1125, c.piso.z];
    c.inserir(objeto);
    const area = pegadaNoLote(objeto);
    if (!area) throw new Error("Pegada ausente");
    const pontos = c.chegada(8);
    expect(pontos).toHaveLength(8);
    for (const [x, y] of pontos ?? [])
      expect(
        x + 300 <= area[0] || x - 300 >= area[2] || y + 300 <= area[1] || y - 300 >= area[3],
      ).toBe(true);
  });

  it("não coloca um corpo atravessando a parede, mesmo com células livres dos dois lados", () => {
    const c = cenario();
    c.piso.paredes = [{ id: "parede", a: [1000, 0], b: [1000, 6000] }];
    const pontos = c.chegada(4);
    expect(pontos).toHaveLength(4);
    for (const [x] of pontos ?? []) expect(x).toBeLessThanOrEqual(700);
  });
});
