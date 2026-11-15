import { gzipSync } from "node:zlib";
import { criarMundo, VERSAO_DO_MUNDO } from "@informach/morada-sim";
import { BAIRRO_DA_PROVA } from "@informach/morada-sim/conteudo";
import { expect, it } from "vitest";
import { criarBancada, mundoDe } from "./apoio";

async function legado() {
  const bancada = await criarBancada();
  const a = await bancada.novaInstancia();
  const lia = bancada.jogador("Lia");
  const id = bancada.criarMundo(lia);
  bancada.plataforma.abrirMundo(id, lia.perfilId);
  const posse = await a.host.reivindicarPosse(id);
  const mundo = criarMundo({
    mundoId: id,
    semente: 42,
    definicao: BAIRRO_DA_PROVA,
    fundadores: [],
  });
  const foto = mundo.fotografar();
  const { fundacao, catalogoDeAparencias, ...estadoV1 } = foto.estado;
  expect(catalogoDeAparencias).toBeNull();
  expect(fundacao).toBeNull();
  const bytes = gzipSync(JSON.stringify({ ...foto, estado: { ...estadoV1, versao: 1 } }));
  await a.host.gravarFotografia({
    mundoId: id,
    cerca: posse.cerca,
    revisaoEsperada: 0,
    diarioSeq: 0,
    tick: foto.tick,
    schemaVersion: 1,
    tipo: "checkpoint",
    bytes,
  });
  await a.host.liberarPosse({ mundoId: id, cerca: posse.cerca, motivo: "erro" });
  return { bancada, a, lia, id, estadoV1 };
}

it("migra e publica V2 antes de admitir a sessão, mesmo sem diário pendente", async () => {
  const { bancada, a, lia, id, estadoV1 } = await legado();
  await bancada.entrar(lia, id);
  const estado = mundoDe(a.instancia, id).estado;
  expect(estado.versao).toBe(VERSAO_DO_MUNDO);
  expect(estado.fundacao).toBeNull();
  expect(estado.moradores).toEqual(estadoV1.moradores);
  expect(estado.familias).toEqual(estadoV1.familias);
  expect(estado.relacoes).toEqual(estadoV1.relacoes);
  expect(estado.contadores.mor).toBe(estadoV1.contadores.mor);
  expect(bancada.plataforma.mundo(id).fotografias.map((f) => f.schemaVersion)).toEqual([
    1,
    VERSAO_DO_MUNDO,
  ]);
  expect(lia.visao?.moradores).toEqual(estadoV1.moradores);
});

it("não admite a sessão se o checkpoint da migração não foi persistido", async () => {
  const { bancada, a, lia, id } = await legado();
  a.host.foraDoAr = true;
  a.host.soFalha = ["gravarFotografia"];
  await bancada.entrar(lia, id);
  expect(a.instancia.ator(id)).toBeUndefined();
  expect(lia.quadros.some((quadro) => quadro.t === "bem_vindo" || quadro.t === "fotografia")).toBe(
    false,
  );
  expect(bancada.plataforma.mundo(id).fotografias.map((f) => f.schemaVersion)).toEqual([1]);
});
