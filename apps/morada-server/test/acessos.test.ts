import {
  listar,
  PERMISSOES_DE_QUEM_DIVIDE,
  PERMISSOES_DO_FUNDADOR,
  type RascunhoDaFamilia,
  verificarInvariantes,
} from "@informach/morada-sim";
import { BAIRRO_DA_PROVA, BAIRRO_INICIAL } from "@informach/morada-sim/conteudo";
import { FECHAMENTO } from "@informach/morada-sim/protocolo";
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

async function familiaAberta() {
  const bancada = await criarBancada({ definicao: BAIRRO_INICIAL, checkpointMs: 1_000_000 });
  const a = await bancada.novaInstancia();
  const lia = bancada.jogador("Lia");
  const bruno = bancada.jogador("Bruno");
  const id = bancada.criarMundo(lia);
  bancada.convidar(id, bruno);
  await bancada.entrar(lia, id);
  await bancada.entrar(bruno, id);
  const comando = await lia.comando(null, { t: "fundar_familia", rascunho });
  await bancada.andar(1);
  expect(lia.resultados.get(comando)).toMatchObject({ ok: true });
  return { bancada, a, lia, bruno, id, mundo: mundoDe(a.instancia, id) };
}

it("promoção e rebaixamento releem o papel na admissão e persistem sem trocar o membro", async () => {
  const { bancada, a, lia, bruno, id, mundo } = await familiaAberta();
  const membroId = bruno.jogadorId;
  const dados = structuredClone({
    familias: mundo.estado.familias,
    moradores: mundo.estado.moradores,
  });
  const acesso = () => mundo.estado.acessos.find((item) => item.perfilId === membroId);
  expect(acesso()?.permissoes).toEqual(PERMISSOES_DE_QUEM_DIVIDE);

  for (const [papel, permissoes] of [
    ["steward", PERMISSOES_DO_FUNDADOR],
    ["member", PERMISSOES_DE_QUEM_DIVIDE],
  ] as const) {
    const sid = bancada.sessaoDe(bruno);
    if (!sid) throw new Error("Sessão esperada na bancada.");
    bancada.plataforma.mudarPapelDoMembro(id, bruno.perfilId, papel);
    bancada.plataforma.encerrarSessao(sid, "permissions_changed");
    await a.instancia.batimento();
    expect(bruno.fechamento).toBe(FECHAMENTO.semAcesso);
    expect(lia.fechamento).toBeNull();
    await bancada.entrar(bruno, id, true);
    expect(bruno.fechamento).toBeNull();
    expect(bruno.jogadorId).toBe(membroId);
    expect(acesso()?.permissoes).toEqual(permissoes);
  }
  expect({ familias: mundo.estado.familias, moradores: mundo.estado.moradores }).toEqual(dados);
  const acessos = structuredClone(mundo.estado.acessos);
  a.host.foraDoAr = true;
  lia.cair();
  bruno.cair();
  bancada.esperar(POSSE_TTL_MS + 1);
  const b = await bancada.novaInstancia("wss://b.test");
  await bancada.entrar(bruno, id);
  const recuperado = mundoDe(b.instancia, id);
  expect(recuperado.estado.acessos).toEqual(acessos);
  expect({ familias: recuperado.estado.familias, moradores: recuperado.estado.moradores }).toEqual(
    dados,
  );
  expect(verificarInvariantes(recuperado.estado, recuperado.presenca)).toEqual([]);
});

it("a fundação mantém o direito próprio da família após mudar quem responde pelo mundo", async () => {
  const { bancada, a, lia, bruno, id, mundo } = await familiaAberta();
  const antes = structuredClone(mundo.estado.fundacao);
  const dados = structuredClone({
    familias: mundo.estado.familias,
    moradores: mundo.estado.moradores,
  });
  bancada.plataforma.mudarPapelDoMembro(id, bruno.perfilId, "steward");
  bancada.plataforma.mudarPapelDoMembro(id, lia.perfilId, "member");
  const sid = bancada.sessaoDe(lia);
  if (!sid) throw new Error("Sessão esperada na bancada.");
  bancada.plataforma.encerrarSessao(sid, "permissions_changed");
  await a.instancia.batimento();
  await bancada.entrar(lia, id, true);
  expect(lia.fechamento).toBeNull();
  expect(mundo.estado.acessos.find((item) => item.perfilId === lia.jogadorId)?.permissoes).toEqual(
    PERMISSOES_DO_FUNDADOR,
  );
  expect(mundo.estado.fundacao).toEqual(antes);
  expect({ familias: mundo.estado.familias, moradores: mundo.estado.moradores }).toEqual(dados);
});

it.each(["familia:ausente", "familia:", "outro-contexto"])(
  "a participação inválida %s não concede por aproximação nem substitui a conexão existente",
  async (participacao) => {
    const { bancada, a, lia, id, mundo } = await familiaAberta();
    const caio = bancada.jogador("Caio");
    bancada.convidar(id, caio, participacao);
    const antes = structuredClone(mundo.estado.acessos);
    const seq = bancada.plataforma.mundo(id).diarioSeq;
    await bancada.entrar(caio, id);
    expect(caio.fechamento).toBe(FECHAMENTO.semAcesso);
    expect(caio.quadros.some((quadro) => quadro.t === "fotografia")).toBe(false);
    expect(mundo.estado.acessos).toEqual(antes);
    expect(bancada.plataforma.mundo(id).diarioSeq).toBe(seq);
    expect(lia.fechamento).toBeNull();
    expect(a.instancia.medir().conexoes).toBe(2);
  },
);

it("reentrar com o mesmo papel não acrescenta fatos de acesso ao diário", async () => {
  const { bancada, bruno, id, mundo } = await familiaAberta();
  const antes = structuredClone(mundo.estado.acessos);
  const seq = bancada.plataforma.mundo(id).diarioSeq;
  bruno.cair();
  await bancada.entrar(bruno, id);
  expect(bruno.fechamento).toBeNull();
  expect(mundo.estado.acessos).toEqual(antes);
  expect(bancada.plataforma.mundo(id).diarioSeq).toBe(seq);
  expect(listar(mundo.estado.familias)).toHaveLength(1);
});

it("a nova permissão só é apresentada depois da confirmação do diário", async () => {
  const { bancada, a, bruno, id } = await familiaAberta();
  const sid = bancada.sessaoDe(bruno);
  if (!sid) throw new Error("Sessão esperada na bancada.");
  bancada.plataforma.mudarPapelDoMembro(id, bruno.perfilId, "steward");
  bancada.plataforma.encerrarSessao(sid, "permissions_changed");
  await a.instancia.batimento();
  const recebidos = bruno.quadros.length;
  const seq = bancada.plataforma.mundo(id).diarioSeq;
  a.host.foraDoAr = true;
  a.host.soFalha = ["anexarAoDiario"];
  await bancada.entrar(bruno, id, true);
  expect(bruno.quadros.slice(recebidos)).toEqual([]);
  expect(bancada.plataforma.mundo(id).diarioSeq).toBe(seq);
  a.host.foraDoAr = false;
  await bancada.andar(1);
  expect(bruno.quadros.slice(recebidos).map((quadro) => quadro.t)).toContain("fotografia");
  expect(
    bruno.visao?.acessos.find((item) => item.perfilId === bruno.jogadorId)?.permissoes,
  ).toEqual(PERMISSOES_DO_FUNDADOR);
  expect(bancada.plataforma.mundo(id).diarioSeq).toBeGreaterThan(seq);
});

it("o antigo responsável perde os outros acessos e fica apenas na família indicada", async () => {
  const definicao = structuredClone(BAIRRO_DA_PROVA);
  const modelo = definicao.familias[0]?.moradores[0];
  if (!modelo) throw new Error("Morador inicial ausente na bancada.");
  definicao.familias.push({
    ref: "familia_cedro",
    nome: "Cedro",
    lote: "lote_2",
    fundo: 500000,
    moradores: [{ ...modelo, ref: "caio", nome: "Caio" }],
  });
  const bancada = await criarBancada({ definicao });
  const a = await bancada.novaInstancia();
  const lia = bancada.jogador("Lia");
  const bruno = bancada.jogador("Bruno");
  const id = bancada.criarMundo(lia);
  bancada.convidar(id, bruno);
  bancada.plataforma.mudarPapelDoMembro(id, bruno.perfilId, "steward");
  await bancada.entrar(lia, id);
  await bancada.entrar(bruno, id);
  const mundo = mundoDe(a.instancia, id);
  expect(mundo.estado.acessos.filter((item) => item.perfilId === bruno.jogadorId)).toHaveLength(2);
  const cedro = listar(mundo.estado.familias).find((familia) => familia.nome === "Cedro");
  if (!cedro) throw new Error("Família esperada na bancada.");
  const dados = structuredClone({
    familias: mundo.estado.familias,
    moradores: mundo.estado.moradores,
  });
  const sid = bancada.sessaoDe(bruno);
  if (!sid) throw new Error("Sessão esperada na bancada.");
  bancada.plataforma.mudarPapelDoMembro(id, bruno.perfilId, "member");
  bancada.plataforma.mudarParticipacaoDoMembro(id, bruno.perfilId, `familia:${cedro.id}`);
  bancada.plataforma.encerrarSessao(sid, "permissions_changed");
  await a.instancia.batimento();
  await bancada.entrar(bruno, id, true);
  expect(mundo.estado.acessos.filter((item) => item.perfilId === bruno.jogadorId)).toEqual([
    { perfilId: bruno.jogadorId, familiaId: cedro.id, permissoes: [...PERMISSOES_DE_QUEM_DIVIDE] },
  ]);
  expect({ familias: mundo.estado.familias, moradores: mundo.estado.moradores }).toEqual(dados);
  expect(lia.fechamento).toBeNull();
  expect(verificarInvariantes(mundo.estado, mundo.presenca)).toEqual([]);
});
