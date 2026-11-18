import { AuditPersistenceError } from "@informach/auth";
import { db, eq, sql } from "@informach/db";
import {
  recreioGameSessions as games,
  recreioSpaceVisitInvites as invites,
  recreioSpaceMembers as members,
  recreioSessionSavePermits as permits,
  recreioWorldHostPresences as presences,
  recreioGameTickets as tickets,
  recreioWorldVisitSessions as visitSessions,
  recreioWorldVisits as visits,
} from "@informach/db/schema";
import { SessaoDeJogoIdSchema } from "@informach/recreio";
import {
  ControleDaSessaoSchema,
  EntradaDeVisitanteSchema,
  MARGEM_DE_SALVAMENTO_S,
  VisitaAbertaSchema,
} from "@informach/recreio/contrato";
import { criarRecreio } from "@informach/recreio/sdk";
import { afterEach, expect, it, vi } from "vitest";
import { selecionarPerfil } from "@/features/perfis/service";
import { resolverAtor } from "@/features/sessao/service";
import {
  emitirIngresso,
  renovarSessao,
  sairDaSessao,
  sessaoDeJogoDoToken,
  trocarIngresso,
} from "@/features/sessao-de-jogo/service";
import {
  aceitarAmizade,
  emitirCodigoDeAmigo,
  pedirAmizade,
  protegerContato,
} from "@/features/social/service";
import { traduzirRecusaDeVisita } from "@/features/visitas/http";
import { limparSessoesVisitantesOrfas } from "@/features/visitas/orfas-repository";
import { mundoAtualDaVisita } from "@/features/visitas/pagina-repository";
import { limparRecibosDeVisita } from "@/features/visitas/retencao-repository";
import { emitirConviteDeVisita, responderConviteDeVisita } from "@/features/visitas/service";
import { env } from "@/lib/env";
import { SessoesVisitantesDaInstancia } from "../e2e/servidor/visitas";
import { revogar } from "../scripts/concessoes";
import {
  aposentarInstancias,
  CHECAGEM,
  codigoDoBanco,
  eventosCom,
  loginReal,
  novoJogador,
  RESTRICAO,
  UNICO,
} from "./apoio";
import {
  abrirPelaRota,
  cabecalhosDoHost,
  claimsDe,
  entrarNoJogo,
  MORADA,
  mundoDe,
  novaInstancia,
  OUTRO_JOGO,
} from "./jogo-apoio";
import { despachar, ORIGEM, pedir } from "./rotas";
import { referenciaSocial } from "./social-apoio";

type Cenario = Awaited<ReturnType<typeof cenario>>;
type Sessao = Awaited<ReturnType<typeof abrir>>;
async function consultaDaPresenca(c: Cenario) {
  const [p] = await db.select().from(presences).where(eq(presences.id, c.presenca.presencaId));
  if (!p) throw new Error("Atestado fixture ausente");
  return {
    mundoId: c.mundoId,
    cerca: c.posse.cerca,
    sid: c.host.sid,
    perfilId: c.origem.perfil.id,
    chaveDeEntrada: p.clientKey,
  };
}
function renovar(c: Cenario, s: Sessao) {
  return c.instancia.cliente.renovarVisitas([
    { ...entrada(c, s), sessaoDeVisitaId: s.finalidade.id },
  ]);
}
function fechar(c: Cenario, s: Sessao) {
  return c.instancia.cliente.encerrarSessaoDeVisita({
    ...entrada(c, s),
    sessaoDeVisitaId: s.finalidade.id,
    motivo: "sair",
  });
}
async function recolher(s: Sessao) {
  // Drena lotes reais das fixtures anteriores, sem ampliar o limite do worker.
  for (let lote = 0; lote < 4; lote++) {
    const resultado = await limparSessoesVisitantesOrfas();
    expect(resultado.sessoesDeVisitaOrfaConferidas).toBeLessThanOrEqual(100);
    const [vinculo] = await db
      .select()
      .from(visitSessions)
      .where(eq(visitSessions.id, s.finalidade.id));
    if (vinculo?.state === "closed") return;
  }
  throw new Error("O worker não recolheu o vínculo órfão das fixtures limitadas.");
}
function entrada(c: Cenario, s: Sessao) {
  return {
    mundoId: c.mundoId,
    cerca: c.posse.cerca,
    sid: s.sid,
    perfilId: c.destino.perfil.id,
    visitaId: c.visitaId,
    sessaoDeVisitaId: s.finalidade.id,
  };
}
function admitir(c: Cenario, s: Sessao) {
  return c.instancia.cliente.verificarEntradaDeVisita(entrada(c, s));
}
function foto(c: Cenario, revisaoEsperada: number) {
  return c.instancia.cliente.gravarFotografia({
    mundoId: c.mundoId,
    cerca: c.posse.cerca,
    revisaoEsperada,
    diarioSeq: 0,
    tick: 0,
    schemaVersion: 1,
    tipo: "checkpoint",
    bytes: new TextEncoder().encode(JSON.stringify({ contador: 9 })),
  });
}

it.each(["emitir", "aceitar", "recusar", "revogar"] as const)(
  "SDK de outro jogo não executa %s nem recupera recibo da visita",
  async (operacao) => {
    const c = await cenario(),
      origem = operacao === "emitir" || operacao === "revogar";
    if (origem) await sairDaSessao(c.host.token);
    const outraPartida = await entrarNoJogo(origem ? c.origem : c.destino, MORADA),
      autor = await sessaoDeJogoDoToken(outraPartida.token),
      [convite] = await db.select().from(invites).where(eq(invites.id, c.convite.conviteId)),
      [antes] = await db.select().from(visits).where(eq(visits.id, c.visitaId));
    if (!convite || !antes) throw new Error("Recibo fixture ausente");
    const pedido = {
      mundoId: c.mundoId,
      perfilId: c.destino.perfil.id,
      presencaId: c.presenca.presencaId,
      pedidoId: convite.clientKey,
    };
    const operacaoRemota =
      operacao === "emitir"
        ? emitirConviteDeVisita(autor, pedido)
        : responderConviteDeVisita(autor, { conviteId: convite.id, acao: operacao });
    await expect(operacaoRemota.catch(traduzirRecusaDeVisita)).rejects.toMatchObject({
      codigo: operacao === "emitir" ? "SESSAO_INVALIDA" : "SEM_PERMISSAO",
    });
    expect((await db.select().from(invites).where(eq(invites.id, convite.id)))[0]).toEqual(convite);
    expect((await db.select().from(visits).where(eq(visits.id, c.visitaId)))[0]).toEqual(antes);
    // O recibo próprio da conta continua disponível pela autoridade nativa.
    if (operacao === "emitir")
      expect(await emitirConviteDeVisita(c.autor, pedido)).toEqual({
        ...c.convite,
        estado: "accepted",
      });
    if (operacao === "aceitar")
      expect(
        (await responderConviteDeVisita(c.alvo, { conviteId: convite.id, acao: "aceitar" })).visita
          ?.visitaId,
      ).toBe(c.visitaId);
    await sairDaSessao(outraPartida.token);
    const mesmaPartida = await entrarNoJogo(origem ? c.origem : c.destino, OUTRO_JOGO),
      mesmoJogo = await sessaoDeJogoDoToken(mesmaPartida.token);
    if (operacao === "emitir")
      expect(await emitirConviteDeVisita(mesmoJogo, pedido)).toEqual({
        ...c.convite,
        estado: "accepted",
      });
    else {
      const resultado = await responderConviteDeVisita(mesmoJogo, {
        conviteId: convite.id,
        acao: operacao,
      });
      expect(resultado.convite.conviteId).toBe(convite.id);
      expect(resultado.visita?.estado).toBe(operacao === "aceitar" ? "active" : "revoked");
    }
  },
);

it("prévia nativa confere concessão sem emitir SID, vínculo ou membro e sem revelar o anfitrião", async () => {
  const c = await cenario();
  const antes = await db
    .select()
    .from(visitSessions)
    .where(eq(visitSessions.profileId, c.destino.perfil.id));
  const mundo = await mundoAtualDaVisita(c.alvo, OUTRO_JOGO, c.mundoId, c.visitaId);
  expect(mundo).toEqual({ id: c.mundoId, nome: expect.any(String) });
  expect(
    await db.select().from(visitSessions).where(eq(visitSessions.profileId, c.destino.perfil.id)),
  ).toEqual(antes);
  expect(
    await db.select().from(games).where(eq(games.profileId, c.destino.perfil.id)),
  ).toHaveLength(0);
  expect(await db.select().from(members).where(eq(members.spaceId, c.mundoId))).toHaveLength(1);
  expect(await mundoAtualDaVisita(c.autor, OUTRO_JOGO, c.mundoId, c.visitaId)).toBeNull();
  expect(await mundoAtualDaVisita(c.alvo, "morada", c.mundoId, c.visitaId)).toBeNull();
});

it.each(["host", "concessao", "bloqueio", "posse", "aparelho"] as const)(
  "prévia não entrega nome após perda de %s",
  async (tipo) => {
    const c = await cenario();
    if (tipo === "host") await sairDaSessao(c.host.token);
    if (tipo === "concessao")
      await responderConviteDeVisita(c.autor, { conviteId: c.convite.conviteId, acao: "revogar" });
    if (tipo === "bloqueio")
      await protegerContato(c.alvo, {
        perfilId: c.origem.perfil.id,
        bloqueado: true,
        silenciado: false,
      });
    if (tipo === "posse")
      await c.instancia.cliente.liberarPosse({
        mundoId: c.mundoId,
        cerca: c.posse.cerca,
        motivo: "erro",
      });
    const autor =
      tipo === "aparelho" ? { ...c.alvo, sessaoDeAparelhoId: c.autor.sessaoDeAparelhoId } : c.alvo;
    expect(await mundoAtualDaVisita(autor, OUTRO_JOGO, c.mundoId, c.visitaId)).toBeNull();
  },
);

it("consulta só recupera recibo conhecido sem renovar ou atestar presença", async () => {
  const c = await cenario(),
    pedido = await consultaDaPresenca(c),
    antes = await db.select().from(presences).where(eq(presences.id, c.presenca.presencaId)),
    eventos = await eventosCom("presenceId", c.presenca.presencaId);
  expect(await c.instancia.cliente.consultarPresenca(pedido)).toEqual({ presenca: c.presenca });
  expect(await db.select().from(presences).where(eq(presences.id, c.presenca.presencaId))).toEqual(
    antes,
  );
  expect(await eventosCom("presenceId", c.presenca.presencaId)).toEqual(eventos);
});

it("consulta desconhecida não cria atestado mesmo com SID, membro e posse atuais", async () => {
  const c = await cenario(),
    pedido = await consultaDaPresenca(c);
  await c.instancia.cliente.atestarPresenca({
    mundoId: c.mundoId,
    cerca: c.posse.cerca,
    presencaId: c.presenca.presencaId,
    operacao: "sair",
  });
  const antes = await db.select().from(presences).where(eq(presences.spaceId, c.mundoId));
  expect(
    await c.instancia.cliente.consultarPresenca({ ...pedido, chaveDeEntrada: crypto.randomUUID() }),
  ).toEqual({ presenca: null });
  expect(await db.select().from(presences).where(eq(presences.spaceId, c.mundoId))).toEqual(antes);
});

it("consulta própria continua gratuita após SID/cobertura encerrados e modo desligado", async () => {
  const c = await cenario(),
    pedido = await consultaDaPresenca(c);
  await revogar({ email: c.origem.conta.email, motivo: "teste_visita" });
  env.RECREIO_VISITS_MODE = "off";
  env.RECREIO_SOCIAL_MODE = "off";
  expect(await c.instancia.cliente.consultarPresenca(pedido)).toEqual({ presenca: c.presenca });
  await c.instancia.cliente.atestarPresenca({
    mundoId: c.mundoId,
    cerca: c.posse.cerca,
    presencaId: c.presenca.presencaId,
    operacao: "sair",
  });
  expect((await c.instancia.cliente.consultarPresenca(pedido)).presenca?.estado).toBe("closed");
});

it.each(["sid", "perfil", "cerca"] as const)(
  "consulta recusa chave conhecida com %s divergente",
  async (tipo) => {
    const c = await cenario(),
      pedido = await consultaDaPresenca(c);
    await expect(
      c.instancia.cliente.consultarPresenca({
        ...pedido,
        ...(tipo === "sid" ? { sid: SessaoDeJogoIdSchema.parse(crypto.randomUUID()) } : {}),
        ...(tipo === "perfil" ? { perfilId: c.destino.perfil.id } : {}),
        ...(tipo === "cerca" ? { cerca: c.posse.cerca + 1 } : {}),
      }),
    ).rejects.toMatchObject({ codigo: "REVISAO_DIVERGENTE" });
  },
);

it("consulta de outra instância não alcança recibo alheio", async () => {
  const c = await cenario(),
    pedido = await consultaDaPresenca(c),
    outra = await novaInstancia(OUTRO_JOGO);
  expect(await outra.cliente.consultarPresenca(pedido)).toEqual({ presenca: null });
});

it("consulta exige autenticação e corpo sem operação de escrita", async () => {
  const c = await cenario(),
    { mundoId, ...pedido } = await consultaDaPresenca(c),
    caminho = `/api/interno/v1/mundos/${mundoId}/presencas/consultar`;
  expect(await pedir("POST", caminho, { corpo: pedido })).toMatchObject({
    status: 401,
    corpo: { codigo: "NAO_AUTENTICADO" },
  });
  expect(
    await pedir("POST", caminho, {
      headers: cabecalhosDoHost(OUTRO_JOGO, c.instancia.instanciaId),
      corpo: { ...pedido, operacao: "entrar" },
    }),
  ).toMatchObject({ status: 400, corpo: { codigo: "ENTRADA_INVALIDA" } });
});

it("SDK real abre a finalidade de visita e a instância confirma/encerra o SID sem participação permanente", async () => {
  const c = await cenario();
  const contexto = await criarRecreio({
    baseUrl: ORIGEM,
    jogo: OUTRO_JOGO,
    visitas: true,
    visitaId: c.visitaId,
    obterIngresso: async () => c.pedido.ingresso,
    fetch: despachar,
    agendar: () => () => {},
  });
  if (!contexto.visita) throw new Error("Finalidade de visita ausente no SDK");
  const aberta = await contexto.visita.abrir(),
    sid = SessaoDeJogoIdSchema.parse(claimsDe(contexto.sessao.token()).sid);
  expect(aberta.mundoId).toBe(c.mundoId);
  expect((await db.select().from(games).where(eq(games.id, sid)))[0]?.spaceId).toBeNull();
  const entrada = await c.instancia.cliente.verificarEntradaDeVisita({
    mundoId: aberta.mundoId,
    cerca: c.posse.cerca,
    sid,
    perfilId: contexto.perfil.profileId,
    visitaId: contexto.visita.id,
    sessaoDeVisitaId: aberta.sessaoDeVisitaId,
  });
  expect(entrada.visitaId).toBe(c.visitaId);
  await expect(contexto.mundos.abrir(c.mundoId)).rejects.toMatchObject({ codigo: "SEM_PERMISSAO" });
  await contexto.sessao.sair();
  expect(
    await c.instancia.cliente.encerrarSessaoDeVisita({
      mundoId: c.mundoId,
      cerca: c.posse.cerca,
      sid,
      perfilId: contexto.perfil.profileId,
      visitaId: c.visitaId,
      sessaoDeVisitaId: entrada.sessaoDeVisitaId,
      motivo: "sair",
    }),
  ).toMatchObject({ sidEncerrado: true, visitaEncerrada: true });
  expect(await db.select().from(members).where(eq(members.spaceId, c.mundoId))).toHaveLength(1);
});

it.each(["host", "concessao", "sid", "posse", "mundo"] as const)(
  "manutenção recolhe perda de %s sem depender da instância",
  async (tipo) => {
    const c = await cenario(),
      s = await abrir(c);
    await admitir(c, s);
    if (tipo === "host") await sairDaSessao(c.host.token);
    if (tipo === "concessao")
      await responderConviteDeVisita(c.autor, { conviteId: c.convite.conviteId, acao: "revogar" });
    if (tipo === "sid") await sairDaSessao(s.aberta.token);
    if (tipo === "posse")
      await c.instancia.cliente.liberarPosse({
        mundoId: c.mundoId,
        cerca: c.posse.cerca,
        motivo: "erro",
      });
    // Arquivamento é fixture de perda de domínio, não homologação do fluxo de gestão.
    if (tipo === "mundo")
      await db.execute(
        sql`update recreio.spaces set status='archived',management_revision=management_revision+1 where id=${c.mundoId}::uuid`,
      );
    env.RECREIO_VISITS_MODE = "off";
    env.RECREIO_SOCIAL_MODE = "off";
    await recolher(s);
    expect((await db.select().from(games).where(eq(games.id, s.sid)))[0]?.endedAt).toBeInstanceOf(
      Date,
    );
    expect(
      (await db.select().from(visits).where(eq(visits.id, c.visitaId)))[0]?.endedAt,
    ).toBeInstanceOf(Date);
    const [anterior] = await db
      .select()
      .from(visitSessions)
      .where(eq(visitSessions.id, s.finalidade.id));
    await limparSessoesVisitantesOrfas();
    expect(
      (await db.select().from(visitSessions).where(eq(visitSessions.id, s.finalidade.id)))[0],
    ).toEqual(anterior);
    if (tipo !== "host")
      expect(
        (await db.select().from(games).where(eq(games.id, c.host.sid)))[0]?.endedAt,
      ).toBeNull();
  },
);

it("cache local vencido sozinho não vira órfão e permite revalidação completa", async () => {
  const c = await cenario(),
    s = await abrir(c);
  await admitir(c, s);
  // Envelhece somente o cache técnico; SID, presença, posse e concessão continuam atuais.
  await db.execute(
    sql`update recreio.world_visit_sessions set created_at=created_at-interval '1 minute',admitted_at=admitted_at-interval '1 minute',updated_at=updated_at-interval '1 minute',permission_until=permission_until-interval '1 minute' where id=${s.finalidade.id}::uuid`,
  );
  await limparSessoesVisitantesOrfas();
  expect(
    (await db.select().from(visitSessions).where(eq(visitSessions.id, s.finalidade.id)))[0]?.state,
  ).toBe("active");
  expect((await db.select().from(games).where(eq(games.id, s.sid)))[0]?.endedAt).toBeNull();
  expect((await renovar(c, s)).visitas[0]?.estado).toBe("ok");
});

it("auditoria recusada no worker continua falha e permite retomar o recolhimento", async () => {
  const c = await cenario(),
    s = await abrir(c);
  await admitir(c, s);
  await sairDaSessao(c.host.token);
  await db.execute(
    sql`create function audit.visita_orfa_falha() returns trigger language plpgsql as $$ begin if new.event_type='recreio.visit_session_closed' then raise exception 'audit unavailable'; end if; return new; end $$`,
  );
  await db.execute(
    sql`create trigger visita_orfa_falha before insert on audit.events for each row execute function audit.visita_orfa_falha()`,
  );
  try {
    await expect(limparSessoesVisitantesOrfas()).rejects.toBeInstanceOf(AuditPersistenceError);
  } finally {
    await db.execute(sql`drop trigger visita_orfa_falha on audit.events`);
    await db.execute(sql`drop function audit.visita_orfa_falha()`);
  }
  expect((await db.select().from(games).where(eq(games.id, s.sid)))[0]?.endedAt).toBeNull();
  expect((await db.select().from(visits).where(eq(visits.id, c.visitaId)))[0]?.state).toBe(
    "active",
  );
  await recolher(s);
});

it("encerramento concorrente fecha só o SID visitante e sua concessão uma vez", async () => {
  const c = await cenario(),
    s = await abrir(c);
  await admitir(c, s);
  const [a, b] = await Promise.all([fechar(c, s), fechar(c, s)]);
  expect(a).toEqual(b);
  expect(a).toMatchObject({ estado: "closed", sidEncerrado: true, visitaEncerrada: true });
  const [sessao] = await db.select().from(games).where(eq(games.id, s.sid));
  expect(sessao).toMatchObject({
    endedAt: expect.any(Date),
    endReason: "left",
    endedSeq: expect.any(Number),
  });
  expect((await db.select().from(visits).where(eq(visits.id, c.visitaId)))[0]).toMatchObject({
    state: "revoked",
    endReason: "left",
  });
  expect((await db.select().from(games).where(eq(games.id, c.host.sid)))[0]?.endedAt).toBeNull();
  expect((await db.select().from(permits).where(eq(permits.sessionId, s.sid)))[0]?.status).toBe(
    "ready",
  );
  const eventos = await eventosCom("sessionId", s.sid);
  expect(eventos.filter((e) => e.eventType === "recreio.game_session_ended")).toHaveLength(1);
  expect(eventos.filter((e) => e.eventType === "recreio.visit_session_closed")).toHaveLength(1);
  await expect(admitir(c, s)).rejects.toMatchObject({ codigo: "SESSAO_ENCERRADA" });
});

it("encerramento preparado reduz a intenção sem fingir admissão ou ACK", async () => {
  const c = await cenario(),
    s = await abrir(c);
  expect(await fechar(c, s)).toMatchObject({ sidEncerrado: true, visitaEncerrada: true });
  expect(
    (await db.select().from(visitSessions).where(eq(visitSessions.id, s.finalidade.id)))[0],
  ).toMatchObject({ state: "closed", admittedAt: null, permissionUntil: null });
  expect(
    (await eventosCom("sessionId", s.sid)).filter(
      (e) => e.eventType === "recreio.visit_session_admitted",
    ),
  ).toHaveLength(0);
});

it("encerramento continua gratuito após saída do anfitrião, perda da posse/cobertura e modos desligados", async () => {
  const c = await cenario(),
    s = await abrir(c);
  await admitir(c, s);
  await sairDaSessao(c.host.token);
  await c.instancia.cliente.atestarPresenca({
    mundoId: c.mundoId,
    cerca: c.posse.cerca,
    presencaId: c.presenca.presencaId,
    operacao: "sair",
  });
  await c.instancia.cliente.liberarPosse({
    mundoId: c.mundoId,
    cerca: c.posse.cerca,
    motivo: "erro",
  });
  await revogar({ email: c.destino.conta.email, motivo: "teste_visita" });
  env.RECREIO_VISITS_MODE = "off";
  env.RECREIO_SOCIAL_MODE = "off";
  expect(await fechar(c, s)).toMatchObject({ sidEncerrado: true, visitaEncerrada: true });
  expect(
    (await db.select().from(visitSessions).where(eq(visitSessions.id, s.finalidade.id)))[0]?.state,
  ).toBe("closed");
});

it.each(["sid", "perfil", "vinculo", "cerca", "instancia"] as const)(
  "encerramento recusa %s diferente da prova original",
  async (tipo) => {
    const c = await cenario(),
      s = await abrir(c);
    await admitir(c, s);
    const cliente =
      tipo === "instancia" ? (await novaInstancia(OUTRO_JOGO)).cliente : c.instancia.cliente;
    await expect(
      cliente.encerrarSessaoDeVisita({
        ...entrada(c, s),
        sessaoDeVisitaId: s.finalidade.id,
        motivo: "sair",
        ...(tipo === "sid" ? { sid: c.host.sid } : {}),
        ...(tipo === "perfil" ? { perfilId: c.origem.perfil.id } : {}),
        ...(tipo === "vinculo" ? { sessaoDeVisitaId: crypto.randomUUID() } : {}),
        ...(tipo === "cerca" ? { cerca: c.posse.cerca + 1 } : {}),
      }),
    ).rejects.toMatchObject({ codigo: "NAO_ENCONTRADO" });
    expect((await db.select().from(games).where(eq(games.id, s.sid)))[0]?.endedAt).toBeNull();
    expect((await db.select().from(games).where(eq(games.id, c.host.sid)))[0]?.endedAt).toBeNull();
  },
);

it("encerramento preserva a razão de uma revogação anterior", async () => {
  const c = await cenario(),
    s = await abrir(c);
  await admitir(c, s);
  await responderConviteDeVisita(c.autor, { conviteId: c.convite.conviteId, acao: "revogar" });
  const [antes] = await db.select().from(visits).where(eq(visits.id, c.visitaId));
  await fechar(c, s);
  expect((await db.select().from(visits).where(eq(visits.id, c.visitaId)))[0]).toEqual(antes);
});

it("mensagem atrasada nunca encerra outra partida do mesmo perfil", async () => {
  const c = await cenario();
  c.pedido.suportaSalvamento = false;
  const s = await abrir(c);
  await admitir(c, s);
  await sairDaSessao(s.aberta.token);
  const mundoId = await mundoDe(c.destino, OUTRO_JOGO),
    atual = await entrarNoJogo(c.destino, OUTRO_JOGO);
  expect((await abrirPelaRota(atual, mundoId)).status).toBe(200);
  await c.instancia.cliente.reivindicarPosse(mundoId);
  await fechar(c, s);
  expect((await db.select().from(games).where(eq(games.id, atual.sid)))[0]?.endedAt).toBeNull();
});

it("intenção antiga nunca revoga o sucessor admitido quando ela própria não chegou a entrar", async () => {
  const c = await cenario();
  c.pedido.suportaSalvamento = false;
  const antiga = await abrir(c);
  await sairDaSessao(antiga.aberta.token);
  const ingresso = await emitirIngresso(c.destino.ator, { jogo: OUTRO_JOGO });
  c.pedido.ingresso = ingresso.ingresso;
  c.pedido.chaveDeTroca = "b".repeat(43);
  const nova = await abrir(c);
  await admitir(c, nova);
  expect(await fechar(c, antiga)).toMatchObject({ visitaEncerrada: false, sidEncerrado: true });
  expect((await db.select().from(games).where(eq(games.id, nova.sid)))[0]?.endedAt).toBeNull();
  expect((await db.select().from(visits).where(eq(visits.id, c.visitaId)))[0]?.state).toBe(
    "active",
  );
});

it.each(["recreio.visit_closed", "recreio.visit_session_closed"] as const)(
  "falha em %s reverte vínculo, concessão e cursor do SID",
  async (evento) => {
    const c = await cenario(),
      s = await abrir(c);
    await admitir(c, s);
    await db.execute(
      sql`create function audit.visita_encerramento_falha() returns trigger language plpgsql as $$ begin if new.event_type='${sql.raw(evento)}' then raise exception 'audit unavailable'; end if; return new; end $$`,
    );
    await db.execute(
      sql`create trigger visita_encerramento_falha before insert on audit.events for each row execute function audit.visita_encerramento_falha()`,
    );
    try {
      await expect(fechar(c, s)).rejects.toMatchObject({ codigo: "INDISPONIVEL" });
    } finally {
      await db.execute(sql`drop trigger visita_encerramento_falha on audit.events`);
      await db.execute(sql`drop function audit.visita_encerramento_falha()`);
    }
    expect((await db.select().from(games).where(eq(games.id, s.sid)))[0]).toMatchObject({
      endedAt: null,
      endedSeq: null,
      endReason: null,
    });
    expect((await db.select().from(visits).where(eq(visits.id, c.visitaId)))[0]?.state).toBe(
      "active",
    );
    expect(
      (await db.select().from(visitSessions).where(eq(visitSessions.id, s.finalidade.id)))[0]
        ?.state,
    ).toBe("active");
    await fechar(c, s);
  },
);

it("renovação em lote conserva vínculo/janela e não emite novas admissões", async () => {
  const c = await cenario(),
    s = await abrir(c),
    inicial = await admitir(c, s),
    [concessao] = await db.select().from(visits).where(eq(visits.id, c.visitaId)),
    renovadas = await renovar(c, s);
  expect(renovadas.visitas).toEqual([
    {
      sessaoDeVisitaId: s.finalidade.id,
      estado: "ok",
      permissaoAte: expect.any(String),
      agora: expect.any(String),
    },
  ]);
  expect((await db.select().from(visits).where(eq(visits.id, c.visitaId)))[0]?.expiresAt).toEqual(
    concessao?.expiresAt,
  );
  expect(renovadas.visitas[0]?.sessaoDeVisitaId).toBe(inicial.sessaoDeVisitaId);
  expect(
    (await eventosCom("sessionId", s.sid)).filter(
      (e) => e.eventType === "recreio.visit_session_admitted",
    ),
  ).toHaveLength(1);
});

it("renovação não admite intenção preparada nem troca a identidade do vínculo", async () => {
  const c = await cenario(),
    s = await abrir(c);
  expect((await renovar(c, s)).visitas).toEqual([
    { sessaoDeVisitaId: s.finalidade.id, estado: "perdida" },
  ]);
  expect((await db.select().from(games).where(eq(games.id, s.sid)))[0]?.spaceId).toBeNull();
  expect(
    (await db.select().from(visitSessions).where(eq(visitSessions.id, s.finalidade.id)))[0]?.state,
  ).toBe("prepared");
  await admitir(c, s);
  const alheio = crypto.randomUUID();
  expect(
    (await c.instancia.cliente.renovarVisitas([{ ...entrada(c, s), sessaoDeVisitaId: alheio }]))
      .visitas,
  ).toEqual([{ sessaoDeVisitaId: alheio, estado: "perdida" }]);
});

it("lote mistura prova atual e SID desconhecido preservando ordem e escopo", async () => {
  const c = await cenario(),
    s = await abrir(c);
  await admitir(c, s);
  const alheio = crypto.randomUUID(),
    resposta = await c.instancia.cliente.renovarVisitas([
      { ...entrada(c, s), sessaoDeVisitaId: s.finalidade.id },
      {
        ...entrada(c, s),
        sid: SessaoDeJogoIdSchema.parse(crypto.randomUUID()),
        sessaoDeVisitaId: alheio,
      },
    ]);
  expect(resposta.visitas).toMatchObject([
    { sessaoDeVisitaId: s.finalidade.id, estado: "ok" },
    { sessaoDeVisitaId: alheio, estado: "perdida" },
  ]);
});

it.each(["revogada", "modo", "sid_vencido"] as const)(
  "renovação nega %s sem fabricar encerramento de SID",
  async (tipo) => {
    const c = await cenario(),
      s = await abrir(c);
    await admitir(c, s);
    if (tipo === "revogada")
      await responderConviteDeVisita(c.autor, { conviteId: c.convite.conviteId, acao: "revogar" });
    if (tipo === "modo") env.RECREIO_VISITS_MODE = "off";
    if (tipo === "sid_vencido")
      await db.execute(
        sql`update recreio.game_sessions set expires_at=clock_timestamp()-interval '1 second' where id=${s.sid}::uuid`,
      );
    expect((await renovar(c, s)).visitas).toEqual([
      { sessaoDeVisitaId: s.finalidade.id, estado: "perdida" },
    ]);
    expect((await db.select().from(games).where(eq(games.id, s.sid)))[0]?.endedAt).toBeNull();
  },
);

it("falha operacional na renovação devolve erro e reverte o item, em vez de declarar perda de autorização", async () => {
  const c = await cenario(),
    s = await abrir(c);
  await admitir(c, s);
  const [antes] = await db
    .select()
    .from(visitSessions)
    .where(eq(visitSessions.id, s.finalidade.id));
  await db.execute(
    sql`create function recreio.visita_renovacao_falha() returns trigger language plpgsql as $$ begin raise exception 'database unavailable'; end $$`,
  );
  await db.execute(
    sql`create trigger visita_renovacao_falha before update on recreio.world_visit_sessions for each row execute function recreio.visita_renovacao_falha()`,
  );
  try {
    await expect(renovar(c, s)).rejects.toMatchObject({ codigo: "INDISPONIVEL" });
  } finally {
    await db.execute(sql`drop trigger visita_renovacao_falha on recreio.world_visit_sessions`);
    await db.execute(sql`drop function recreio.visita_renovacao_falha()`);
  }
  expect(
    (await db.select().from(visitSessions).where(eq(visitSessions.id, s.finalidade.id)))[0],
  ).toEqual(antes);
  expect((await renovar(c, s)).visitas[0]?.estado).toBe("ok");
});

it.each(["vazio", "duplicado", "grande"] as const)(
  "lote recusa %s antes de executar qualquer item",
  async (tipo) => {
    const c = await cenario(),
      s = await abrir(c),
      base = { ...entrada(c, s), sessaoDeVisitaId: s.finalidade.id },
      visitas =
        tipo === "vazio"
          ? []
          : tipo === "duplicado"
            ? [base, base]
            : Array.from({ length: 65 }, () => ({
                ...base,
                sid: crypto.randomUUID(),
                sessaoDeVisitaId: crypto.randomUUID(),
              }));
    const resposta = await pedir("POST", "/api/interno/v1/visitas/renovar", {
      headers: cabecalhosDoHost(OUTRO_JOGO, c.instancia.instanciaId),
      corpo: { visitas },
    });
    expect(resposta).toMatchObject({ status: 400, corpo: { codigo: "ENTRADA_INVALIDA" } });
    expect(
      (await db.select().from(visitSessions).where(eq(visitSessions.id, s.finalidade.id)))[0]
        ?.state,
    ).toBe("prepared");
  },
);

it("abertura pública só aponta à posse original e entrada autenticada admite sem membro", async () => {
  const c = await cenario(),
    s = await abrir(c),
    resposta = await pedir("POST", "/api/sdk/v1/visitas/abrir", {
      token: s.aberta.token,
      corpo: { visitaId: c.visitaId },
    });
  expect(resposta.status).toBe(200);
  expect(VisitaAbertaSchema.parse(resposta.corpo)).toMatchObject({
    visitaId: c.visitaId,
    sessaoDeVisitaId: s.finalidade.id,
    mundoId: c.mundoId,
  });
  expect((await db.select().from(games).where(eq(games.id, s.sid)))[0]?.spaceId).toBeNull();
  const permitida = EntradaDeVisitanteSchema.parse(await admitir(c, s));
  expect(Object.keys(permitida).sort()).toEqual([
    "agora",
    "apelido",
    "avatar",
    "permissaoAte",
    "politica",
    "presencaDoAnfitriaoId",
    "sessaoDeVisitaId",
    "visitaId",
  ]);
  expect(permitida.sessaoDeVisitaId).toBe(s.finalidade.id);
  expect(permitida.presencaDoAnfitriaoId).toBe(c.presenca.presencaId);
  expect(resposta.corpo).not.toHaveProperty("presencaDoAnfitriaoId");
  expect(new Date(permitida.permissaoAte).getTime()).toBeGreaterThan(Date.now());
  expect(new Date(permitida.permissaoAte).getTime()).toBeLessThanOrEqual(Date.now() + 30_000);
  expect((await db.select().from(games).where(eq(games.id, s.sid)))[0]?.spaceId).toBe(c.mundoId);
  expect(
    (await db.select().from(visitSessions).where(eq(visitSessions.id, s.finalidade.id)))[0]?.state,
  ).toBe("active");
  expect(await db.select().from(members).where(eq(members.spaceId, c.mundoId))).toHaveLength(1);
});

it("entradas concorrentes/reconexão mantêm o mesmo vínculo e um evento de admissão", async () => {
  const c = await cenario(),
    s = await abrir(c),
    [a, b] = await Promise.all([admitir(c, s), admitir(c, s)]);
  expect(a.sessaoDeVisitaId).toBe(b.sessaoDeVisitaId);
  expect(
    (await eventosCom("sessionId", s.sid)).filter(
      (e) => e.eventType === "recreio.visit_session_admitted",
    ),
  ).toHaveLength(1);
});

it.each(["instancia", "cerca", "perfil", "mundo"] as const)(
  "entrada recusa %s alheio sem vincular o SID",
  async (tipo) => {
    const c = await cenario(),
      s = await abrir(c),
      outro =
        tipo === "instancia"
          ? await novaInstancia(OUTRO_JOGO, 10, { suportaVisitas: true })
          : c.instancia,
      pedido = {
        ...entrada(c, s),
        ...(tipo === "cerca" ? { cerca: c.posse.cerca + 1 } : {}),
        ...(tipo === "perfil" ? { perfilId: c.origem.perfil.id } : {}),
        ...(tipo === "mundo" ? { mundoId: await mundoDe(c.origem, OUTRO_JOGO) } : {}),
      };
    await expect(outro.cliente.verificarEntradaDeVisita(pedido)).rejects.toMatchObject({
      codigo: expect.stringMatching(/POSSE_PERDIDA|SESSAO_ENCERRADA/),
    });
    expect((await db.select().from(games).where(eq(games.id, s.sid)))[0]?.spaceId).toBeNull();
  },
);

it.each(["bloqueio", "gestao", "host", "revogacao", "modo"] as const)(
  "revalidação recusa %s mesmo após primeira entrada",
  async (tipo) => {
    const c = await cenario(),
      s = await abrir(c);
    await admitir(c, s);
    if (tipo === "bloqueio")
      await protegerContato(c.alvo, {
        perfilId: c.origem.perfil.id,
        bloqueado: true,
        silenciado: false,
      });
    if (tipo === "gestao")
      await db.execute(
        sql`update recreio.spaces set management_revision=management_revision+1 where id=${c.mundoId}::uuid`,
      );
    if (tipo === "host") await sairDaSessao(c.host.token);
    if (tipo === "revogacao")
      await responderConviteDeVisita(c.autor, { conviteId: c.convite.conviteId, acao: "revogar" });
    if (tipo === "modo") env.RECREIO_VISITS_MODE = "off";
    await expect(admitir(c, s)).rejects.toMatchObject({
      codigo:
        tipo === "host"
          ? "SESSAO_ENCERRADA"
          : tipo === "gestao"
            ? "REVISAO_DIVERGENTE"
            : tipo === "modo"
              ? "INDISPONIVEL"
              : "SEM_PERMISSAO",
    });
    expect(
      (await eventosCom("sessionId", s.sid)).filter(
        (e) => e.eventType === "recreio.visit_session_admitted",
      ),
    ).toHaveLength(1);
  },
);

it("entrada não admitida encerra SID exato e conserva a concessão para primeira entrada real", async () => {
  const c = await cenario(),
    s = await abrir(c);
  const [antes] = await db.select().from(visits).where(eq(visits.id, c.visitaId));
  const tentativa = { ...entrada(c, s), motivo: "entrada_nao_concluida" as const };
  expect(await c.instancia.cliente.encerrarSessaoDeVisita(tentativa)).toEqual({
    sessaoDeVisitaId: s.finalidade.id,
    estado: "closed",
    sidEncerrado: true,
    visitaEncerrada: false,
  });
  expect((await db.select().from(visits).where(eq(visits.id, c.visitaId)))[0]).toEqual(antes);
  expect((await db.select().from(permits).where(eq(permits.sessionId, s.sid)))[0]?.status).toBe(
    "ready",
  );
  expect(
    (await db.select().from(visitSessions).where(eq(visitSessions.id, s.finalidade.id)))[0],
  ).toMatchObject({ state: "closed", admittedAt: null });
  const ingresso = await emitirIngresso(c.destino.ator, { jogo: OUTRO_JOGO });
  const nova = await abrir({
    ...c,
    pedido: { ...c.pedido, ingresso: ingresso.ingresso, chaveDeTroca: "b".repeat(43) },
  });
  expect(nova.sid).not.toBe(s.sid);
  expect((await admitir(c, nova)).sessaoDeVisitaId).toBe(nova.finalidade.id);
  // Replay da tentativa antiga não derruba a primeira entrada real posterior.
  expect((await c.instancia.cliente.encerrarSessaoDeVisita(tentativa)).visitaEncerrada).toBe(false);
  expect((await db.select().from(games).where(eq(games.id, nova.sid)))[0]?.endedAt).toBeNull();
  expect((await db.select().from(visits).where(eq(visits.id, c.visitaId)))[0]).toEqual(antes);
  expect((await db.select().from(games).where(eq(games.id, c.host.sid)))[0]?.endedAt).toBeNull();
});

it("desistência não desfaz admissão gravada cuja resposta se perdeu", async () => {
  const c = await cenario(),
    s = await abrir(c);
  await admitir(c, s);
  expect(
    await c.instancia.cliente.encerrarSessaoDeVisita({
      ...entrada(c, s),
      motivo: "entrada_nao_concluida",
    }),
  ).toMatchObject({
    sidEncerrado: true,
    visitaEncerrada: true,
  });
  expect((await db.select().from(visits).where(eq(visits.id, c.visitaId)))[0]?.state).toBe(
    "revoked",
  );
  expect((await db.select().from(permits).where(eq(permits.sessionId, s.sid)))[0]?.status).toBe(
    "ready",
  );
  const ingresso = await emitirIngresso(c.destino.ator, { jogo: OUTRO_JOGO });
  await expect(
    trocarIngresso({
      ingresso: ingresso.ingresso,
      suportaSalvamento: true,
      chaveDeTroca: "c".repeat(43),
    }),
  ).rejects.toMatchObject({ codigo: "CHECKPOINT_PENDENTE", detalhe: { motivo: "saving" } });
});

it("admissão e desistência concorrentes resolvem pela evidência persistida, sem reiniciar prazo", async () => {
  const c = await cenario(),
    s = await abrir(c);
  const [antes] = await db.select().from(visits).where(eq(visits.id, c.visitaId));
  const [admissao, fechamento] = await Promise.allSettled([
    admitir(c, s),
    c.instancia.cliente.encerrarSessaoDeVisita({
      ...entrada(c, s),
      motivo: "entrada_nao_concluida",
    }),
  ]);
  if (fechamento.status !== "fulfilled") throw fechamento.reason;
  const [vinculo] = await db
    .select()
    .from(visitSessions)
    .where(eq(visitSessions.id, s.finalidade.id));
  const [visita] = await db.select().from(visits).where(eq(visits.id, c.visitaId));
  if (!vinculo || !visita || !antes) throw new Error("Evidência da corrida ausente");
  expect(vinculo.state).toBe("closed");
  expect(fechamento.value.sidEncerrado).toBe(true);
  expect(fechamento.value.visitaEncerrada).toBe(vinculo.admittedAt !== null);
  expect(visita.state).toBe(vinculo.admittedAt === null ? "active" : "revoked");
  expect(visita.expiresAt).toEqual(antes.expiresAt);
  if (admissao.status === "rejected")
    expect(admissao.reason).toMatchObject({
      codigo: expect.stringMatching(/SESSAO_ENCERRADA|SEM_PERMISSAO|ACESSO_PERDIDO/),
    });
  else expect(vinculo.admittedAt).toBeInstanceOf(Date);
  expect((await db.select().from(games).where(eq(games.id, c.host.sid)))[0]?.endedAt).toBeNull();
});

it("desistência técnica nunca prolonga ou reabre uma concessão vencida", async () => {
  const c = await cenario(),
    s = await abrir(c);
  await db.execute(
    sql`update recreio.world_visits set accepted_at=accepted_at-interval '1 hour',updated_at=updated_at-interval '1 hour',expires_at=expires_at-interval '1 hour' where id=${c.visitaId}::uuid`,
  );
  expect(
    (
      await c.instancia.cliente.encerrarSessaoDeVisita({
        ...entrada(c, s),
        motivo: "entrada_nao_concluida",
      })
    ).visitaEncerrada,
  ).toBe(true);
  expect((await db.select().from(visits).where(eq(visits.id, c.visitaId)))[0]?.state).toBe(
    "expired",
  );
});

it("registro da instância conserva fechamento que falha e recupera só o SID real", async () => {
  const c = await cenario(),
    s = await abrir(c),
    erros: unknown[] = [];
  const registro = new SessoesVisitantesDaInstancia((_mundo, erro) => erros.push(erro));
  registro.reservar(entrada(c, s), c.instancia.cliente);
  await admitir(c, s);
  registro.admitir(s.finalidade.id);
  await db.execute(
    sql`create function audit.visita_registro_falha() returns trigger language plpgsql as $$ begin if new.event_type='recreio.visit_session_closed' then raise exception 'audit unavailable'; end if; return new; end $$`,
  );
  await db.execute(
    sql`create trigger visita_registro_falha before insert on audit.events for each row execute function audit.visita_registro_falha()`,
  );
  try {
    registro.encerrar(s.finalidade.id, "sair");
    await registro.processar();
    expect(erros).toHaveLength(1);
    expect((await db.select().from(games).where(eq(games.id, s.sid)))[0]?.endedAt).toBeNull();
    expect(() => registro.reservar(entrada(c, s), c.instancia.cliente)).toThrow(
      "CHECKPOINT_PENDENTE",
    );
  } finally {
    await db.execute(sql`drop trigger visita_registro_falha on audit.events`);
    await db.execute(sql`drop function audit.visita_registro_falha()`);
  }
  env.RECREIO_VISITS_MODE = "off";
  await registro.processar();
  expect((await db.select().from(games).where(eq(games.id, s.sid)))[0]?.endReason).toBe("left");
  expect((await db.select().from(games).where(eq(games.id, c.host.sid)))[0]?.endedAt).toBeNull();
  expect((await db.select().from(permits).where(eq(permits.sessionId, s.sid)))[0]?.status).toBe(
    "ready",
  );
  expect(await db.select().from(members).where(eq(members.spaceId, c.mundoId))).toHaveLength(1);
  await registro.processar();
  expect(
    (await eventosCom("visitSessionId", s.finalidade.id)).filter(
      (e) => e.eventType === "recreio.visit_session_closed",
    ),
  ).toHaveLength(1);
});

it("registro recupera resposta de encerramento descartada após o commit sem duplicar auditoria", async () => {
  const c = await cenario(),
    s = await abrir(c),
    erros: unknown[] = [];
  let descartar = true;
  const cliente: typeof c.instancia.cliente = {
    ...c.instancia.cliente,
    async encerrarSessaoDeVisita(pedido) {
      const recibo = await c.instancia.cliente.encerrarSessaoDeVisita(pedido);
      if (descartar) {
        descartar = false;
        throw new Error("Resposta perdida após commit");
      }
      return recibo;
    },
  };
  const registro = new SessoesVisitantesDaInstancia((_mundo, erro) => erros.push(erro));
  registro.reservar(entrada(c, s), cliente);
  await admitir(c, s);
  registro.admitir(s.finalidade.id);
  registro.encerrar(s.finalidade.id, "sair");
  await registro.processar();
  expect(erros).toHaveLength(1);
  expect((await db.select().from(games).where(eq(games.id, s.sid)))[0]?.endReason).toBe("left");
  expect(() => registro.reservar(entrada(c, s), cliente)).toThrow("CHECKPOINT_PENDENTE");
  await registro.processar();
  expect(
    (await eventosCom("visitSessionId", s.finalidade.id)).filter(
      (e) => e.eventType === "recreio.visit_session_closed",
    ),
  ).toHaveLength(1);
  expect((await db.select().from(permits).where(eq(permits.sessionId, s.sid)))[0]?.status).toBe(
    "ready",
  );
});

it("registro fecha admissão incerta pelo vínculo preparado sem permitir segunda conexão em voo", async () => {
  const c = await cenario(),
    s = await abrir(c),
    erros: unknown[] = [];
  const registro = new SessoesVisitantesDaInstancia((_mundo, erro) => erros.push(erro));
  registro.reservar(entrada(c, s), c.instancia.cliente);
  expect(() => registro.reservar(entrada(c, s), c.instancia.cliente)).toThrow(
    "CHECKPOINT_PENDENTE",
  );
  // Commit remoto cuja resposta não chega à etapa admitir do registro local.
  await admitir(c, s);
  registro.encerrar(s.finalidade.id, "autoridade_perdida");
  await registro.processar();
  expect(erros).toEqual([]);
  expect((await db.select().from(games).where(eq(games.id, s.sid)))[0]?.endReason).toBe(
    "access_lost",
  );
  expect(() => registro.admitir(s.finalidade.id)).toThrow("SESSAO_ENCERRADA");
  expect((await db.select().from(games).where(eq(games.id, c.host.sid)))[0]?.endedAt).toBeNull();
});

it("vínculo divergente não admite o SID nem altera a intenção preparada", async () => {
  const c = await cenario(),
    s = await abrir(c);
  await expect(
    c.instancia.cliente.verificarEntradaDeVisita({
      ...entrada(c, s),
      sessaoDeVisitaId: crypto.randomUUID(),
    }),
  ).rejects.toMatchObject({ codigo: "SEM_PERMISSAO" });
  expect((await db.select().from(games).where(eq(games.id, s.sid)))[0]?.spaceId).toBeNull();
  expect(
    (await db.select().from(visitSessions).where(eq(visitSessions.id, s.finalidade.id)))[0],
  ).toMatchObject({
    state: "prepared",
    admittedAt: null,
  });
  expect(
    (await eventosCom("sessionId", s.sid)).filter(
      (e) => e.eventType === "recreio.visit_session_admitted",
    ),
  ).toHaveLength(0);
});

it("vínculo da abertura encerra uma admissão de resposta descartada, sem fabricar ACK", async () => {
  const c = await cenario(),
    s = await abrir(c);
  const resposta = await pedir("POST", "/api/sdk/v1/visitas/abrir", {
    token: s.aberta.token,
    corpo: { visitaId: c.visitaId },
  });
  expect(resposta.status).toBe(200);
  const abertura = VisitaAbertaSchema.parse(resposta.corpo);
  // A resposta da admissão é descartada. O encerramento usa só a abertura anterior.
  await admitir(c, s);
  env.RECREIO_VISITS_MODE = "off";
  expect(
    await c.instancia.cliente.encerrarSessaoDeVisita({
      ...entrada(c, s),
      sessaoDeVisitaId: abertura.sessaoDeVisitaId,
      motivo: "sair",
    }),
  ).toEqual({
    sessaoDeVisitaId: abertura.sessaoDeVisitaId,
    estado: "closed",
    sidEncerrado: true,
    visitaEncerrada: true,
  });
  expect((await db.select().from(games).where(eq(games.id, c.host.sid)))[0]?.endedAt).toBeNull();
  expect((await db.select().from(permits).where(eq(permits.sessionId, s.sid)))[0]?.status).toBe(
    "ready",
  );
  expect(await db.select().from(members).where(eq(members.spaceId, c.mundoId))).toHaveLength(1);
});

it("cliente sem intenção e corpo com papel de membro não passam pela nova entrada", async () => {
  const c = await cenario(),
    { visitaId: _visita, ...legado } = c.pedido,
    aberta = await trocarIngresso(legado),
    sid = SessaoDeJogoIdSchema.parse(claimsDe(aberta.token).sid),
    corpo = {
      visitaId: c.visitaId,
      sessaoDeVisitaId: crypto.randomUUID(),
      cerca: c.posse.cerca,
      perfilId: c.destino.perfil.id,
      sid,
    };
  const resposta = await pedir("POST", `/api/interno/v1/mundos/${c.mundoId}/visitas/entrada`, {
    headers: cabecalhosDoHost(OUTRO_JOGO, c.instancia.instanciaId),
    corpo,
  });
  expect(resposta).toMatchObject({ status: 403, corpo: { codigo: "SEM_PERMISSAO" } });
  const divergente = await pedir("POST", `/api/interno/v1/mundos/${c.mundoId}/visitas/entrada`, {
    headers: cabecalhosDoHost(OUTRO_JOGO, c.instancia.instanciaId),
    corpo: { ...corpo, papel: "steward" },
  });
  expect(divergente.status).toBe(400);
  expect((await db.select().from(games).where(eq(games.id, sid)))[0]?.spaceId).toBeNull();
});

it("orçamento de oito inclui membros e visitante e libera vaga só após saída real", async () => {
  const c = await cenario(),
    s = await abrir(c),
    outros = [];
  for (let i = 0; i < 7; i++) {
    const pessoa = await novoJogador();
    // Só papéis são fixtures; cada SID entra pelo protocolo real de membro.
    await db
      .insert(members)
      .values({ spaceId: c.mundoId, profileId: pessoa.perfil.id, state: "active", role: "member" });
    const sessao = await entrarNoJogo(pessoa, OUTRO_JOGO);
    await c.instancia.cliente.verificarEntrada({
      mundoId: c.mundoId,
      cerca: c.posse.cerca,
      sid: sessao.sid,
      perfilId: pessoa.perfil.id,
    });
    outros.push({ pessoa, sessao });
  }
  await expect(admitir(c, s)).rejects.toMatchObject({ codigo: "MUNDO_CHEIO" });
  const primeiro = outros[0];
  if (!primeiro) throw new Error("Membro fixture ausente");
  await sairDaSessao(primeiro.sessao.token);
  await admitir(c, s);
  const volta = await entrarNoJogo(primeiro.pessoa, OUTRO_JOGO);
  await expect(
    c.instancia.cliente.verificarEntrada({
      mundoId: c.mundoId,
      cerca: c.posse.cerca,
      sid: volta.sid,
      perfilId: primeiro.pessoa.perfil.id,
    }),
  ).rejects.toMatchObject({ codigo: "MUNDO_CHEIO" });
});

it("auditoria de admissão recusada reverte vínculo e mundo do SID", async () => {
  const c = await cenario(),
    s = await abrir(c);
  await db.execute(
    sql`create function audit.visita_entrada_falha() returns trigger language plpgsql as $$ begin if new.event_type='recreio.visit_session_admitted' then raise exception 'audit unavailable'; end if; return new; end $$`,
  );
  await db.execute(
    sql`create trigger visita_entrada_falha before insert on audit.events for each row execute function audit.visita_entrada_falha()`,
  );
  try {
    await expect(admitir(c, s)).rejects.toMatchObject({ codigo: "INDISPONIVEL" });
  } finally {
    await db.execute(sql`drop trigger visita_entrada_falha on audit.events`);
    await db.execute(sql`drop function audit.visita_entrada_falha()`);
  }
  expect((await db.select().from(games).where(eq(games.id, s.sid)))[0]?.spaceId).toBeNull();
  expect(
    (await db.select().from(visitSessions).where(eq(visitSessions.id, s.finalidade.id)))[0]?.state,
  ).toBe("prepared");
  await admitir(c, s);
});

it("visitante revogado ainda conclui apenas o salvamento do próprio SID já admitido", async () => {
  const c = await cenario(),
    s = await abrir(c);
  await admitir(c, s);
  await responderConviteDeVisita(c.autor, { conviteId: c.convite.conviteId, acao: "revogar" });
  const base = { mundoId: c.mundoId, cerca: c.posse.cerca, sid: s.sid };
  expect(await c.instancia.cliente.salvarSessao({ ...base, operacao: "preparar" })).toMatchObject({
    estado: "ready",
  });
  const fotografia = await foto(c, c.posse.revisao);
  expect(
    await c.instancia.cliente.salvarSessao({
      ...base,
      operacao: "concluir",
      revisao: fotografia.revisao,
      diarioSeq: 0,
    }),
  ).toMatchObject({ estado: "completed" });
  expect((await db.select().from(games).where(eq(games.id, s.sid)))[0]?.endedSeq).not.toBeNull();
  expect((await db.select().from(games).where(eq(games.id, c.host.sid)))[0]?.endedAt).toBeNull();
  await expect(admitir(c, s)).rejects.toMatchObject({ codigo: "SESSAO_ENCERRADA" });
});

it("intenção preparada nunca usa o contrato de salvamento de mundo como admissão", async () => {
  const c = await cenario(),
    s = await abrir(c);
  await expect(
    c.instancia.cliente.salvarSessao({
      mundoId: c.mundoId,
      cerca: c.posse.cerca,
      sid: s.sid,
      operacao: "preparar",
    }),
  ).rejects.toMatchObject({ codigo: "SESSAO_INVALIDA" });
  expect((await db.select().from(games).where(eq(games.id, s.sid)))[0]?.endedAt).toBeNull();
});

it("checkpoint real permite sucessor da mesma visita e conserva os dois SIDs sem novo membro", async () => {
  const c = await cenario(),
    s = await abrir(c);
  await admitir(c, s);
  const login = await loginReal(c.destino.conta),
    ator = await resolverAtor(login);
  if (!ator) throw new Error("Aparelho ausente");
  await selecionarPerfil(ator.ator, c.destino.perfil.id);
  const ingresso = await emitirIngresso(
      { ...ator.ator, perfil: c.destino.perfil },
      { jogo: OUTRO_JOGO },
    ),
    pedido = {
      ...c.pedido,
      ingresso: ingresso.ingresso,
      continuarAqui: true,
      chaveDeTroca: "b".repeat(43),
    };
  await expect(trocarIngresso(pedido)).rejects.toMatchObject({
    codigo: "CHECKPOINT_PENDENTE",
    detalhe: { motivo: "requested" },
  });
  const controle = await pedir("GET", "/api/sdk/v1/sessao/controle", { token: s.aberta.token }),
    estado = ControleDaSessaoSchema.parse(controle.corpo);
  if (!estado.checkpoint) throw new Error("Checkpoint ausente");
  const fotografia = await foto(c, c.posse.revisao);
  expect(
    await c.instancia.cliente.confirmarCheckpoint({
      mundoId: c.mundoId,
      cerca: c.posse.cerca,
      sid: s.sid,
      id: estado.checkpoint.id,
      confirmado: true,
      revisao: fotografia.revisao,
      diarioSeq: 0,
    }),
  ).toMatchObject({ estado: "confirmed" });
  const nova = await trocarIngresso(pedido),
    novoSid = SessaoDeJogoIdSchema.parse(claimsDe(nova.token).sid);
  await recolher(s);
  expect(await fechar(c, s)).toMatchObject({ sidEncerrado: true, visitaEncerrada: false });
  const [historica] = await db
    .select()
    .from(visitSessions)
    .where(eq(visitSessions.sessionId, s.sid));
  const aberturaDaSucessora = await pedir("POST", "/api/sdk/v1/visitas/abrir", {
    token: nova.token,
    corpo: { visitaId: c.visitaId },
  });
  expect(aberturaDaSucessora.status).toBe(200);
  const vinculoDaSucessora = VisitaAbertaSchema.parse(aberturaDaSucessora.corpo);
  expect(vinculoDaSucessora.sessaoDeVisitaId).not.toBe(s.finalidade.id);
  const permitida = await c.instancia.cliente.verificarEntradaDeVisita({
    ...entrada(c, s),
    sid: novoSid,
    sessaoDeVisitaId: vinculoDaSucessora.sessaoDeVisitaId,
  });
  expect(permitida.visitaId).toBe(c.visitaId);
  expect(
    (await db.select().from(visitSessions).where(eq(visitSessions.sessionId, s.sid)))[0],
  ).toMatchObject({ state: "closed", closeReason: "replaced" });
  expect(
    (await db.select().from(visitSessions).where(eq(visitSessions.sessionId, novoSid)))[0]?.state,
  ).toBe("active");
  expect((await db.select().from(games).where(eq(games.id, s.sid)))[0]?.endReason).toBe("replaced");
  expect(await fechar(c, s)).toMatchObject({ sidEncerrado: true, visitaEncerrada: false });
  expect(
    (await db.select().from(visitSessions).where(eq(visitSessions.sessionId, s.sid)))[0],
  ).toEqual(historica);
  expect((await db.select().from(games).where(eq(games.id, novoSid)))[0]?.endedAt).toBeNull();
  expect((await db.select().from(visits).where(eq(visits.id, c.visitaId)))[0]?.state).toBe(
    "active",
  );
  expect(await db.select().from(members).where(eq(members.spaceId, c.mundoId))).toHaveLength(1);
  await expect(admitir(c, s)).rejects.toMatchObject({ codigo: "SESSAO_ENCERRADA" });
});

vi.mock("@informach/config/jogos", async (original) => {
  const real = await original<typeof import("@informach/config/jogos")>();
  const jogos = [
    ...real.JOGOS,
    {
      ...real.JOGOS[0],
      id: "jogo-de-teste",
      nome: "Sessão visitante interna",
      rota: "/jogar/jogo-de-teste",
      capacidades: { ...real.JOGOS[0].capacidades, visitas: true, checkpoint: "servidor" },
      limites: { ...real.JOGOS[0].limites, jogadoresSimultaneosMax: 8 },
      classificacao: { faixa: "L", descritores: [], interacoes: [] },
    },
  ];
  return {
    ...real,
    JOGOS: jogos,
    jogoPorId: (id: string) => jogos.find((j) => j.id === id) ?? null,
  };
});
const modoCheckpoint = env.RECREIO_CHECKPOINT_MODE;
afterEach(() => {
  env.RECREIO_VISITS_MODE = "off";
  env.RECREIO_SOCIAL_MODE = "on";
  env.RECREIO_CHECKPOINT_MODE = modoCheckpoint;
});

async function cenario() {
  env.RECREIO_VISITS_MODE = "on";
  env.RECREIO_SOCIAL_MODE = "on";
  env.RECREIO_CHECKPOINT_MODE = "on";
  await aposentarInstancias();
  const origem = await novoJogador(),
    destino = await novoJogador(),
    autor = referenciaSocial(origem),
    alvo = referenciaSocial(destino),
    codigo = await emitirCodigoDeAmigo(alvo),
    amizade = await pedirAmizade(autor, { codigo: codigo.codigo, pedidoId: crypto.randomUUID() });
  await aceitarAmizade(alvo, amizade.pedidoId);
  const mundoId = await mundoDe(origem, OUTRO_JOGO),
    host = await entrarNoJogo(origem, OUTRO_JOGO, { suportaVisitas: true }),
    instancia = await novaInstancia(OUTRO_JOGO, 10, { suportaVisitas: true });
  expect((await abrirPelaRota(host, mundoId)).status).toBe(200);
  const posse = await instancia.cliente.reivindicarPosse(mundoId),
    presenca = await instancia.cliente.atestarPresenca({
      mundoId,
      operacao: "entrar",
      cerca: posse.cerca,
      sid: host.sid,
      perfilId: origem.perfil.id,
      chaveDeEntrada: crypto.randomUUID(),
    }),
    convite = await emitirConviteDeVisita(autor, {
      mundoId,
      perfilId: destino.perfil.id,
      presencaId: presenca.presencaId,
      pedidoId: crypto.randomUUID(),
    }),
    aceita = await responderConviteDeVisita(alvo, {
      conviteId: convite.conviteId,
      acao: "aceitar",
    });
  if (!aceita.visita) throw new Error("Concessão ausente");
  const visitaId = aceita.visita.visitaId;
  // Janela curta da fixture: mede o corte sem esperar 24 horas ou alterar o relógio.
  await db
    .update(visits)
    .set({ expiresAt: new Date(Date.now() + 120_000) })
    .where(eq(visits.id, visitaId));
  const ingresso = await emitirIngresso(destino.ator, { jogo: OUTRO_JOGO }),
    pedido = {
      ingresso: ingresso.ingresso,
      visitaId,
      suportaVisitas: true,
      suportaSalvamento: true,
      chaveDeTroca: "a".repeat(43),
    };
  return {
    origem,
    destino,
    autor,
    alvo,
    mundoId,
    host,
    instancia,
    posse,
    presenca,
    convite,
    visitaId,
    pedido,
  };
}
async function abrir(c: Awaited<ReturnType<typeof cenario>>) {
  const { suportaSalvamento, ...pedido } = c.pedido;
  const aberta = await trocarIngresso({
      ...pedido,
      ...(suportaSalvamento ? { suportaSalvamento: true } : {}),
    }),
    sid = SessaoDeJogoIdSchema.parse(claimsDe(aberta.token).sid),
    [finalidade] = await db.select().from(visitSessions).where(eq(visitSessions.sessionId, sid));
  if (!finalidade) throw new Error("Finalidade ausente");
  return { aberta, sid, finalidade };
}

it("intenção real fixa a finalidade e o corte do token/salvamento sem admitir no mundo", async () => {
  const c = await cenario(),
    s = await abrir(c),
    [sessao] = await db.select().from(games).where(eq(games.id, s.sid)),
    [permissao] = await db.select().from(permits).where(eq(permits.sessionId, s.sid)),
    [visita] = await db.select().from(visits).where(eq(visits.id, c.visitaId));
  expect(s.aberta).toMatchObject({ visitas: true, visitaId: c.visitaId });
  expect(s.finalidade).toMatchObject({
    state: "prepared",
    spaceId: c.mundoId,
    profileId: c.destino.perfil.id,
    admittedAt: null,
    permissionUntil: null,
  });
  expect(sessao?.spaceId).toBeNull();
  expect(new Date(s.aberta.expiraEm).getTime()).toBeLessThanOrEqual(
    visita?.expiresAt.getTime() ?? 0,
  );
  expect(permissao?.cutoffAt.toISOString()).toBe(s.aberta.expiraEm);
  expect(permissao?.expiresAt.getTime()).toBe(
    new Date(s.aberta.expiraEm).getTime() + MARGEM_DE_SALVAMENTO_S * 1000,
  );
  expect(await db.select().from(members).where(eq(members.spaceId, c.mundoId))).toHaveLength(1);
});

it("recuperação só repete a mesma finalidade; omissão ou troca não reaproveitam o ingresso", async () => {
  const c = await cenario(),
    s = await abrir(c),
    repetida = await trocarIngresso(c.pedido);
  expect(claimsDe(repetida.token).sid).toBe(s.sid);
  expect(repetida.visitaId).toBe(c.visitaId);
  const { visitaId: _visita, ...semVisita } = c.pedido;
  await expect(trocarIngresso(semVisita)).rejects.toMatchObject({ codigo: "INGRESSO_INVALIDO" });
  await expect(
    trocarIngresso({ ...c.pedido, visitaId: crypto.randomUUID() }),
  ).rejects.toMatchObject({ codigo: "INGRESSO_INVALIDO" });
  expect(
    await db.select().from(visitSessions).where(eq(visitSessions.visitId, c.visitaId)),
  ).toHaveLength(1);
  expect(
    (await eventosCom("sessionId", s.sid)).filter(
      (e) => e.eventType === "recreio.game_session_started",
    ),
  ).toHaveLength(1);
});

it("sessão legada não ganha finalidade de visita numa recuperação posterior", async () => {
  const c = await cenario(),
    { visitaId: _visita, ...pedido } = c.pedido,
    aberta = await trocarIngresso(pedido);
  await expect(trocarIngresso(c.pedido)).rejects.toMatchObject({ codigo: "INGRESSO_INVALIDO" });
  expect(aberta.visitaId).toBeUndefined();
  expect(
    await db.select().from(visitSessions).where(eq(visitSessions.visitId, c.visitaId)),
  ).toHaveLength(0);
});

it("visitante não usa protocolo de membro mesmo se a participação for criada depois", async () => {
  const c = await cenario(),
    s = await abrir(c);
  // Fixture de mudança de papel, sem alegar homologação do fluxo de adesão.
  await db.insert(members).values({
    spaceId: c.mundoId,
    profileId: c.destino.perfil.id,
    role: "member",
    state: "active",
  });
  expect((await abrirPelaRota({ token: s.aberta.token, sid: s.sid }, c.mundoId)).status).toBe(403);
  await expect(
    c.instancia.cliente.verificarEntrada({
      mundoId: c.mundoId,
      cerca: c.posse.cerca,
      sid: s.sid,
      perfilId: c.destino.perfil.id,
    }),
  ).rejects.toMatchObject({ codigo: "NAO_MEMBRO" });
  expect((await db.select().from(games).where(eq(games.id, s.sid)))[0]?.spaceId).toBeNull();
});

it.each(["negociacao", "perfil", "modo", "host"] as const)(
  "abertura recusa %s sem consumir o ingresso nem criar finalidade",
  async (tipo) => {
    const c = await cenario();
    if (tipo === "modo") env.RECREIO_VISITS_MODE = "off";
    if (tipo === "host") await sairDaSessao(c.host.token);
    const outroIngresso =
        tipo === "perfil" ? await emitirIngresso(c.origem.ator, { jogo: OUTRO_JOGO }) : null,
      pedido = {
        ...c.pedido,
        ...(tipo === "negociacao" ? { suportaVisitas: undefined } : {}),
        ...(outroIngresso ? { ingresso: outroIngresso.ingresso } : {}),
      };
    await expect(trocarIngresso(pedido)).rejects.toMatchObject({
      codigo: expect.stringMatching(/INGRESSO_INVALIDO|ACESSO_NEGADO|ACESSO_PERDIDO/),
    });
    const jti = claimsDe(pedido.ingresso).jti;
    if (typeof jti !== "string") throw new Error("JTI ausente");
    expect((await db.select().from(tickets).where(eq(tickets.jti, jti)))[0]?.consumedAt).toBeNull();
    expect(
      await db.select().from(visitSessions).where(eq(visitSessions.visitId, c.visitaId)),
    ).toHaveLength(0);
  },
);

it("renovação conserva o corte original da visita e da margem", async () => {
  const c = await cenario(),
    s = await abrir(c),
    renovada = await renovarSessao(s.aberta.token),
    [v] = await db.select().from(visits).where(eq(visits.id, c.visitaId)),
    [p] = await db.select().from(permits).where(eq(permits.sessionId, s.sid));
  expect(new Date(renovada.expiraEm).getTime()).toBeLessThanOrEqual(v?.expiresAt.getTime() ?? 0);
  expect(p?.cutoffAt.toISOString()).toBe(renovada.expiraEm);
  expect(p?.expiresAt.getTime()).toBe(
    new Date(renovada.expiraEm).getTime() + MARGEM_DE_SALVAMENTO_S * 1000,
  );
});

it("revogação recusa renovação e encerra o SID real pelo cursor, preservando o anfitrião", async () => {
  const c = await cenario(),
    s = await abrir(c);
  await responderConviteDeVisita(c.autor, { conviteId: c.convite.conviteId, acao: "revogar" });
  await expect(renovarSessao(s.aberta.token)).rejects.toMatchObject({ codigo: "ACESSO_PERDIDO" });
  const [encerrada] = await db.select().from(games).where(eq(games.id, s.sid));
  expect(encerrada?.endedAt).toBeInstanceOf(Date);
  expect(encerrada?.endedSeq).not.toBeNull();
  expect((await db.select().from(games).where(eq(games.id, c.host.sid)))[0]?.endedAt).toBeNull();
});

it("falha de auditoria reverte SID, intenção, permissão e consumo do ingresso", async () => {
  const c = await cenario();
  await db.execute(
    sql`create function audit.visita_sid_falha() returns trigger language plpgsql as $$ begin if new.event_type='recreio.game_session_started' then raise exception 'audit unavailable'; end if; return new; end $$`,
  );
  await db.execute(
    sql`create trigger visita_sid_falha before insert on audit.events for each row execute function audit.visita_sid_falha()`,
  );
  try {
    await expect(trocarIngresso(c.pedido)).rejects.toBeInstanceOf(AuditPersistenceError);
  } finally {
    await db.execute(sql`drop trigger visita_sid_falha on audit.events`);
    await db.execute(sql`drop function audit.visita_sid_falha()`);
  }
  expect(
    await db.select().from(visitSessions).where(eq(visitSessions.visitId, c.visitaId)),
  ).toHaveLength(0);
  expect(
    await db.select().from(games).where(eq(games.profileId, c.destino.perfil.id)),
  ).toHaveLength(0);
  expect(
    await db.select().from(permits).where(eq(permits.profileId, c.destino.perfil.id)),
  ).toHaveLength(0);
  const aberta = await trocarIngresso(c.pedido);
  expect(aberta.visitaId).toBe(c.visitaId);
});

it("presença vencida durante auditoria reverte abertura, finalidade e consumo", async () => {
  const c = await cenario();
  await db.execute(
    sql`update recreio.world_host_presences set expires_at=clock_timestamp()+interval '1 second' where id=${c.presenca.presencaId}::uuid`,
  );
  await db.execute(
    sql`create function audit.visita_sid_demora() returns trigger language plpgsql as $$ begin if new.event_type='recreio.game_session_started' then perform pg_sleep(1.3); end if; return new; end $$`,
  );
  await db.execute(
    sql`create trigger visita_sid_demora before insert on audit.events for each row execute function audit.visita_sid_demora()`,
  );
  try {
    await expect(trocarIngresso(c.pedido)).rejects.toMatchObject({ codigo: "ACESSO_NEGADO" });
  } finally {
    await db.execute(sql`drop trigger visita_sid_demora on audit.events`);
    await db.execute(sql`drop function audit.visita_sid_demora()`);
  }
  expect(
    await db.select().from(visitSessions).where(eq(visitSessions.visitId, c.visitaId)),
  ).toHaveLength(0);
  expect(
    await db.select().from(games).where(eq(games.profileId, c.destino.perfil.id)),
  ).toHaveLength(0);
});

type Vinculo = typeof visitSessions.$inferInsert;
it.each([
  "ativo_sem_prova",
  "ativo_longo",
  "ativo_sem_prazo",
  "preparado_admitido",
  "fechado_sem_data",
  "fechado_sem_motivo",
  "admissao_parcial",
  "data_anterior",
] as const)("restrição persistida recusa %s, inclusive NULL", async (tipo) => {
  const c = await cenario(),
    s = await abrir(c),
    agora = s.finalidade.createdAt,
    mudanca: Partial<Vinculo> =
      tipo === "ativo_sem_prova"
        ? { state: "active" }
        : tipo === "ativo_longo"
          ? {
              state: "active",
              admittedAt: agora,
              permissionUntil: new Date(agora.getTime() + 46_000),
            }
          : tipo === "ativo_sem_prazo"
            ? { state: "active", admittedAt: agora }
            : tipo === "preparado_admitido"
              ? { admittedAt: agora, permissionUntil: new Date(agora.getTime() + 30_000) }
              : tipo === "fechado_sem_data"
                ? { state: "closed", closeReason: "left" }
                : tipo === "fechado_sem_motivo"
                  ? { state: "closed", closedAt: agora }
                  : tipo === "admissao_parcial"
                    ? { permissionUntil: new Date(agora.getTime() + 30_000) }
                    : { updatedAt: new Date(agora.getTime() - 1) };
  expect(
    await codigoDoBanco(
      db.update(visitSessions).set(mudanca).where(eq(visitSessions.id, s.finalidade.id)),
    ),
  ).toBe(CHECAGEM);
});

it("FKs não permitem emprestar SID/perfil/mundo; uma sessão não tem duas finalidades", async () => {
  const c = await cenario(),
    s = await abrir(c),
    base: Vinculo = {
      sessionId: s.sid,
      visitId: c.visitaId,
      spaceId: c.mundoId,
      profileId: c.destino.perfil.id,
      createdAt: s.finalidade.createdAt,
      updatedAt: s.finalidade.updatedAt,
    };
  expect(await codigoDoBanco(db.insert(visitSessions).values(base))).toBe(UNICO);
  expect(RESTRICAO).toContain(
    await codigoDoBanco(
      db
        .update(visitSessions)
        .set({ sessionId: c.host.sid })
        .where(eq(visitSessions.id, s.finalidade.id)),
    ),
  );
  expect(RESTRICAO).toContain(
    await codigoDoBanco(
      db
        .update(visitSessions)
        .set({ spaceId: crypto.randomUUID() })
        .where(eq(visitSessions.id, s.finalidade.id)),
    ),
  );
  expect(RESTRICAO).toContain(await codigoDoBanco(db.delete(games).where(eq(games.id, s.sid))));
  expect(RESTRICAO).toContain(
    await codigoDoBanco(db.delete(visits).where(eq(visits.id, c.visitaId))),
  );
});

async function envelhecer(c: Awaited<ReturnType<typeof cenario>>) {
  await db.execute(
    sql`with instante as materialized (select clock_timestamp() as agora) update recreio.world_visits v set state='expired',accepted_at=accepted_at-interval '32 days',updated_at=i.agora,expires_at=expires_at-interval '32 days',ended_at=i.agora,end_reason='expired' from instante i where v.id=${c.visitaId}::uuid`,
  );
  await db.execute(
    sql`update recreio.space_visit_invites set created_at=created_at-interval '32 days',expires_at=expires_at-interval '32 days',finished_at=finished_at-interval '32 days',retain_until=retain_until-interval '32 days' where id=${c.convite.conviteId}::uuid`,
  );
}
it("retenção mantém SID aberto e apaga ponte antes da concessão, sem apagar sessão", async () => {
  const c = await cenario(),
    s = await abrir(c);
  await envelhecer(c);
  await limparRecibosDeVisita();
  expect(
    await db.select().from(visitSessions).where(eq(visitSessions.id, s.finalidade.id)),
  ).toHaveLength(1);
  await sairDaSessao(s.aberta.token);
  const resultado = await limparRecibosDeVisita();
  expect(resultado.sessoesDeVisitaApagadas).toBeGreaterThanOrEqual(1);
  expect(
    await db.select().from(visitSessions).where(eq(visitSessions.id, s.finalidade.id)),
  ).toHaveLength(0);
  expect(await db.select().from(visits).where(eq(visits.id, c.visitaId))).toHaveLength(0);
  expect(await db.select().from(invites).where(eq(invites.id, c.convite.conviteId))).toHaveLength(
    0,
  );
  expect((await db.select().from(games).where(eq(games.id, s.sid)))[0]?.endedAt).toBeInstanceOf(
    Date,
  );
});

it("auditoria de expurgo recusada preserva ponte e concessão juntas", async () => {
  const c = await cenario(),
    s = await abrir(c);
  await sairDaSessao(s.aberta.token);
  await envelhecer(c);
  await db.execute(
    sql`create function audit.visita_ponte_expurgo() returns trigger language plpgsql as $$ begin if new.event_type='recreio.visit_receipts_purged' then raise exception 'audit unavailable'; end if; return new; end $$`,
  );
  await db.execute(
    sql`create trigger visita_ponte_expurgo before insert on audit.events for each row execute function audit.visita_ponte_expurgo()`,
  );
  try {
    await expect(limparRecibosDeVisita()).rejects.toBeInstanceOf(AuditPersistenceError);
  } finally {
    await db.execute(sql`drop trigger visita_ponte_expurgo on audit.events`);
    await db.execute(sql`drop function audit.visita_ponte_expurgo()`);
  }
  expect(
    await db.select().from(visitSessions).where(eq(visitSessions.id, s.finalidade.id)),
  ).toHaveLength(1);
  expect(await db.select().from(visits).where(eq(visits.id, c.visitaId))).toHaveLength(1);
  await limparRecibosDeVisita();
});
