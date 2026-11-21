import { randomUUID } from "node:crypto";
import { AuditPersistenceError } from "@informach/auth";
import { and, db, eq, inArray, sql } from "@informach/db";
import {
  recreioGameSessions as gameSessions,
  recreioProfiles as profiles,
  sessions,
  recreioProfileWorldTraces as traces,
} from "@informach/db/schema";
import { afterEach, expect, it } from "vitest";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { confirmarRetiradaDePerfil } from "@/features/direitos/consentimento-service";
import { criarArmazenamentoDoLivro } from "@/features/direitos/livro/armazenamento";
import { reconciliarRastrosLegados } from "@/features/direitos/rastros-legados-repository";
import { prepararPedidoDeDireitos } from "@/features/direitos/service";
import { aposentarInstancias, eventosCom, novoJogador } from "./apoio";
import {
  abrirPelaRota,
  cabecalhosDoHost,
  entrarNoJogo,
  MORADA,
  mundoDe,
  novaInstancia,
} from "./jogo-apoio";
import { fixtureDoLivro } from "./livro-apoio";
import { criarBucketDoLivro } from "./livro-s3-apoio";
import { pedir } from "./rotas";

const sids: string[] = [];
afterEach(async () => {
  if (sids.length) await db.delete(gameSessions).where(inArray(gameSessions.id, sids.splice(0)));
});
async function legado() {
  await aposentarInstancias();
  const jogador = await novoJogador(),
    mundo = await mundoDe(jogador),
    sessao = await entrarNoJogo(jogador);
  sids.push(sessao.sid);
  const instancia = await novaInstancia();
  expect((await abrirPelaRota(sessao, mundo)).status).toBe(200);
  const posse = await instancia.cliente.reivindicarPosse(mundo);
  expect(
    (
      await pedir("POST", `/api/interno/v1/mundos/${mundo}/entradas`, {
        headers: cabecalhosDoHost(MORADA, instancia.instanciaId),
        corpo: { cerca: posse.cerca, sid: sessao.sid, perfilId: jogador.perfil.id },
      })
    ).status,
  ).toBe(200);
  const alvo = and(eq(traces.profileId, jogador.perfil.id), eq(traces.spaceId, mundo));
  expect(await db.select().from(traces).where(alvo)).toHaveLength(1);
  // Only synthetic fixtures simulate the missing pre-index legacy record.
  await db.delete(traces).where(alvo);
  return { jogador, mundo, sessao, alvo };
}
it("inspeciona sem escrever e adota somente admissão histórica, sem alterar mundo ou datas existentes", async () => {
  const f = await legado();
  const mundoAntes = await db.execute(
      sql`select to_jsonb(w) as w from recreio.spaces w where id=${f.mundo}`,
    ),
    sessaoAntes = await db.select().from(gameSessions).where(eq(gameSessions.id, f.sessao.sid));
  expect(await reconciliarRastrosLegados("inspect")).toEqual({ candidatos: 1, inseridos: 0 });
  expect(await db.select().from(traces).where(f.alvo)).toHaveLength(0);
  expect(await reconciliarRastrosLegados("apply")).toEqual({ candidatos: 1, inseridos: 1 });
  const original = await db.select().from(traces).where(f.alvo);
  expect(await reconciliarRastrosLegados("apply")).toEqual({ candidatos: 0, inseridos: 0 });
  expect(await db.select().from(traces).where(f.alvo)).toEqual(original);
  expect(
    await db.execute(sql`select to_jsonb(w) as w from recreio.spaces w where id=${f.mundo}`),
  ).toEqual(mundoAntes);
  expect(await db.select().from(gameSessions).where(eq(gameSessions.id, f.sessao.sid))).toEqual(
    sessaoAntes,
  );
  const eventos = await eventosCom("source", "game_sessions");
  expect(eventos.filter((e) => e.eventType === "recreio.world_traces_reconciled")).toHaveLength(1);
});
it("ingresso sem admissão num mundo não vira rastro", async () => {
  const jogador = await novoJogador(),
    sessao = await entrarNoJogo(jogador);
  sids.push(sessao.sid);
  expect(await reconciliarRastrosLegados("apply")).toEqual({ candidatos: 0, inseridos: 0 });
  expect(
    await db.select().from(traces).where(eq(traces.profileId, jogador.perfil.id)),
  ).toHaveLength(0);
});
it("falha real de auditoria reverte toda inserção e permite repetir", async () => {
  const f = await legado();
  await db.execute(sql`create function audit.recusar_rastros_legados() returns trigger language plpgsql as $$ begin
    if new.event_type='recreio.world_traces_reconciled' then raise exception 'synthetic audit failure'; end if; return new; end $$`);
  await db.execute(
    sql`create trigger recusar_rastros_legados before insert on audit.events for each row execute function audit.recusar_rastros_legados()`,
  );
  try {
    await expect(reconciliarRastrosLegados("apply")).rejects.toBeInstanceOf(AuditPersistenceError);
    expect(await db.select().from(traces).where(f.alvo)).toHaveLength(0);
  } finally {
    await db.execute(sql`drop trigger recusar_rastros_legados on audit.events`);
    await db.execute(sql`drop function audit.recusar_rastros_legados()`);
  }
  expect(await reconciliarRastrosLegados("apply")).toEqual({ candidatos: 1, inseridos: 1 });
});
it("não reintroduz rastro de perfil com retirada nativa já consentida", async () => {
  const f = await legado(),
    livro = fixtureDoLivro(),
    http = await criarBucketDoLivro();
  const storage = criarArmazenamentoDoLivro({
    cliente: http.cliente,
    bucket: "recreio-fixture",
    assinatura: livro.assinatura,
    tempoLimiteMs: 2000,
  });
  try {
    await storage.iniciarCabecalho(livro.assinatura.assinarCabecalho(livro.inicial));
    const [login] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, f.jogador.login.authSessionId));
    if (!login) throw new Error("Native session absent");
    const autor: AutorNativoRecente = {
      ...f.jogador.ator,
      login: { authSessionId: login.id, criadoEm: login.createdAt, expiraEm: login.expiresAt },
    };
    const previa = await prepararPedidoDeDireitos(autor, {
      pedidoId: randomUUID(),
      tipo: "retirar_perfil",
      perfis: [f.jogador.perfil.id],
    });
    const consentida = await confirmarRetiradaDePerfil(
      autor,
      {
        preparacaoId: previa.preparacaoId,
        planoSha256: previa.planoSha256,
        confirmoRetirada: true,
      },
      { assinatura: livro.assinatura, storage, fonte: "a".repeat(40) },
    );
    const [perfil] = await db.select().from(profiles).where(eq(profiles.id, f.jogador.perfil.id));
    expect(perfil?.rightsOperationId).toBe(consentida.operacaoId);
    await expect(reconciliarRastrosLegados("apply")).rejects.toMatchObject({
      codigo: "RETIRADA_EM_CURSO",
    });
    expect(await db.select().from(traces).where(f.alvo)).toHaveLength(0);
  } finally {
    livro.encerrar();
    await http.fechar();
  }
});
