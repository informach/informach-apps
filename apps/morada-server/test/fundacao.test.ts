import { listar, type RascunhoDaFamilia, verificarInvariantes } from "@informach/morada-sim";
import { BAIRRO_INICIAL } from "@informach/morada-sim/conteudo";
import { POSSE_TTL_MS } from "@informach/recreio";
import { expect, it } from "vitest";
import { criarBancada, mundoDe } from "./apoio";

const rascunho: RascunhoDaFamilia = {
  nome: "Ipê novo",
  moradores: [
    {
      nome: "Lia nova",
      fase: "adulto",
      linha: "f",
      pele: 13008984,
      cabelo: "coque_alto",
      roupa: "casual_vestido",
      tracos: ["carinhoso"],
    },
  ],
  relacoes: [],
};

it("só o host concede a criação; membros presentes recebem o acesso compartilhado após o fato", async () => {
  const bancada = await criarBancada({ definicao: BAIRRO_INICIAL });
  const a = await bancada.novaInstancia();
  const lia = bancada.jogador("Lia");
  const bruno = bancada.jogador("Bruno");
  const id = bancada.criarMundo(lia);
  bancada.convidar(id, bruno);
  await bancada.entrar(lia, id);
  await bancada.entrar(bruno, id);
  const recusado = await bruno.comando(null, { t: "fundar_familia", rascunho });
  await bancada.andar(1);
  expect(bruno.resultados.get(recusado)).toMatchObject({ ok: false, motivo: "sem_permissao" });
  expect(listar(mundoDe(a.instancia, id).estado.familias)).toEqual([]);
  const aceito = await lia.comando(null, { t: "fundar_familia", rascunho });
  await bancada.andar(1);
  expect(lia.resultados.get(aceito)).toMatchObject({ ok: true });
  const mundo = mundoDe(a.instancia, id);
  expect(listar(mundo.estado.familias)).toHaveLength(1);
  expect(mundo.estado.acessos.map((acesso) => acesso.perfilId).sort()).toEqual(
    [lia.jogadorId, bruno.jogadorId].sort(),
  );
  expect(
    mundo.estado.acessos.find((acesso) => acesso.perfilId === bruno.jogadorId)?.permissoes,
  ).not.toContain("gerir_financas");
  const moradora = bruno.moradorDeNome("Lia nova");
  const reserva = await bruno.comando(moradora.id, { t: "reservar" });
  await bancada.andar(1);
  expect(bruno.resultados.get(reserva)).toMatchObject({ ok: true });
  expect(verificarInvariantes(mundo.estado, mundo.presenca)).toEqual([]);
});

it("diário indisponível não entrega confirmação nem revela a família antes de persistir", async () => {
  const bancada = await criarBancada({ definicao: BAIRRO_INICIAL });
  const a = await bancada.novaInstancia();
  const lia = bancada.jogador("Lia");
  const id = bancada.criarMundo(lia);
  await bancada.entrar(lia, id);
  a.host.foraDoAr = true;
  a.host.soFalha = ["anexarAoDiario"];
  const comando = await lia.comando(null, { t: "fundar_familia", rascunho });
  await bancada.andar(2);
  expect(lia.resultados.has(comando)).toBe(false);
  expect(lia.visao?.familias.ordem).toEqual([]);
  a.host.foraDoAr = false;
  await bancada.andar(1);
  expect(lia.resultados.get(comando)).toMatchObject({ ok: true });
  expect(lia.visao?.familias.ordem).toHaveLength(1);
});

it("queda após o diário recupera a fundação e repete o recibo sem outro saldo", async () => {
  const bancada = await criarBancada({ definicao: BAIRRO_INICIAL, checkpointMs: 1_000_000 });
  const a = await bancada.novaInstancia("wss://a.test");
  const lia = bancada.jogador("Lia");
  const id = bancada.criarMundo(lia);
  await bancada.entrar(lia, id);
  const comando = await lia.comando(null, { t: "fundar_familia", rascunho });
  a.falhas.armar("depois_do_diario");
  await expect(bancada.andar(1)).rejects.toMatchObject({ ponto: "depois_do_diario" });
  expect(lia.resultados.has(comando)).toBe(false);
  const gravado = bancada.plataforma.mundo(id);
  expect(gravado.diarioSeq).toBeGreaterThan(gravado.fotografias.at(-1)?.diarioSeq ?? 0);
  a.host.foraDoAr = true;
  lia.cair();
  bancada.esperar(POSSE_TTL_MS + 1);
  const b = await bancada.novaInstancia("wss://b.test");
  await bancada.entrar(lia, id);
  const mundo = mundoDe(b.instancia, id);
  const antes = listar(mundo.estado.familias).map((familia) => ({
    id: familia.id,
    fundo: familia.fundo,
  }));
  await lia.comando(null, { t: "fundar_familia", rascunho }, comando);
  await bancada.andar(1, [b.instancia]);
  expect(lia.resultados.get(comando)).toMatchObject({ ok: true, repetido: true });
  expect(
    listar(mundo.estado.familias).map((familia) => ({ id: familia.id, fundo: familia.fundo })),
  ).toEqual(antes);
  expect(verificarInvariantes(mundo.estado, mundo.presenca)).toEqual([]);
});
