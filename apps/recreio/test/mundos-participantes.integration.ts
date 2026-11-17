import { AuditPersistenceError } from "@informach/auth";
import { and, db, eq, sql } from "@informach/db";
import {
  recreioSpaceMembers as members,
  recreioProfiles as profiles,
  recreioSafetyReports as reports,
  recreioSpaces as spaces,
} from "@informach/db/schema";
import { criarRecreio } from "@informach/recreio/sdk";
import { afterEach, expect, it } from "vitest";
import { denunciarContato, denunciarContatoDoMenor } from "@/features/moderacao/denuncias-service";
import { participantesDoMundo } from "@/features/mundos/participantes-repository";
import { aceitarConvite, criarConvite } from "@/features/mundos/service";
import { emitirIngresso } from "@/features/sessao-de-jogo/service";
import { protegerContato } from "@/features/social/service";
import { protegerContatoDoMenor } from "@/features/social/supervisao-service";
import { env } from "@/lib/env";
import { revogar } from "../scripts/concessoes";
import { eventosCom, novoJogador, sinal } from "./apoio";
import { mundoDe } from "./jogo-apoio";
import { despachar, ORIGEM, pedir } from "./rotas";
import { familiaSocial, referenciaSocial as ref } from "./social-apoio";

afterEach(() => {
  env.RECREIO_SOCIAL_MODE = "on";
});
async function cenario() {
  const a = await novoJogador({ apelido: "Sol" }),
    b = await novoJogador({ apelido: "Mar" }),
    mundoId = await mundoDe(a);
  const convite = await criarConvite({ ...ref(a), jogo: null }, mundoId, { forma: "member" });
  await aceitarConvite(ref(b), { codigo: convite.codigo });
  return {
    a,
    b,
    mundoId,
    entrada: {
      perfilId: b.perfil.id,
      categoria: "outro" as const,
      denunciaId: crypto.randomUUID(),
    },
  };
}

it("participante sem amizade consulta o mínimo e denuncia com evidência capturada pelo servidor", async () => {
  const c = await cenario();
  expect(await participantesDoMundo(ref(c.a), { mundoId: c.mundoId })).toEqual({
    participantes: [
      {
        perfilId: c.b.perfil.id,
        apelido: "Mar",
        avatar: "padrao",
        bloqueado: false,
        silenciado: false,
      },
    ],
    proximo: null,
  });
  const r = await denunciarContato(ref(c.a), c.entrada);
  expect((await db.select().from(reports).where(eq(reports.id, r.protocolo)))[0]).toMatchObject({
    evidenceKind: "mundo",
    evidenceId: c.mundoId,
    evidenceRevision: null,
    actorUserId: c.a.conta.id,
  });
  expect(await denunciarContato(ref(c.a), c.entrada)).toEqual({
    protocolo: r.protocolo,
    repetida: true,
  });
  expect(
    (await eventosCom("reportId", r.protocolo)).filter(
      (e) => e.eventType === "recreio.safety_reported",
    ),
  ).toHaveLength(1);
});

it("bloquear e silenciar sem amizade conservam participações e funcionam com contatos novos e cobertura encerrados", async () => {
  const c = await cenario();
  await revogar({ email: c.a.conta.email, motivo: "teste_integracao" });
  env.RECREIO_SOCIAL_MODE = "off";
  await protegerContato(ref(c.a), { perfilId: c.b.perfil.id, bloqueado: true, silenciado: true });
  expect(await participantesDoMundo(ref(c.a), { mundoId: c.mundoId })).toMatchObject({
    participantes: [{ apelido: null, avatar: null, bloqueado: true, silenciado: true }],
  });
  expect(await db.select().from(members).where(eq(members.spaceId, c.mundoId))).toHaveLength(2);
  expect(
    (
      await db
        .select()
        .from(members)
        .where(and(eq(members.spaceId, c.mundoId), eq(members.profileId, c.b.perfil.id)))
    )[0]?.state,
  ).toBe("active");
  await expect(
    protegerContato(ref(c.a), { perfilId: c.b.perfil.id, bloqueado: false, silenciado: false }),
  ).rejects.toMatchObject({ code: "CONFLITO" });
  await protegerContato(ref(c.a), {
    perfilId: c.b.perfil.id,
    bloqueado: false,
    silenciado: false,
    anterior: { bloqueado: true, silenciado: true },
  });
  expect(
    (await participantesDoMundo(ref(c.a), { mundoId: c.mundoId })).participantes[0]?.apelido,
  ).toBe("Mar");
});

it("UUID conhecido ou ex-participação não concedem consulta, bloqueio ou nova denúncia", async () => {
  const c = await cenario(),
    outra = await novoJogador();
  for (const mundoId of [c.mundoId, crypto.randomUUID()])
    await expect(participantesDoMundo(ref(outra), { mundoId })).rejects.toMatchObject({
      codigo: "NAO_MEMBRO",
    });
  await expect(denunciarContato(ref(outra), c.entrada)).rejects.toMatchObject({ code: "CONTATO" });
  const r = await denunciarContato(ref(c.a), c.entrada);
  await db
    .update(members)
    .set({ state: "former", leftAt: new Date() })
    .where(and(eq(members.spaceId, c.mundoId), eq(members.profileId, c.b.perfil.id)));
  await expect(
    protegerContato(ref(c.a), { perfilId: c.b.perfil.id, bloqueado: true, silenciado: false }),
  ).rejects.toMatchObject({ code: "CONTATO" });
  await expect(
    denunciarContato(ref(c.a), { ...c.entrada, denunciaId: crypto.randomUUID() }),
  ).rejects.toMatchObject({ code: "CONTATO" });
  expect(await denunciarContato(ref(c.a), c.entrada)).toEqual({
    protocolo: r.protocolo,
    repetida: true,
  });
});

it.each(["emissor", "destinatario"] as const)(
  "bloqueio do %s também recusa código adulto anterior, sem consumir o convite",
  async (lado) => {
    const c = await cenario(),
      outro = await mundoDe(c.a);
    const convite = await criarConvite({ ...ref(c.a), jogo: null }, outro, { forma: "member" });
    await protegerContato(ref(lado === "emissor" ? c.a : c.b), {
      perfilId: (lado === "emissor" ? c.b : c.a).perfil.id,
      bloqueado: true,
      silenciado: false,
    });
    await expect(aceitarConvite(ref(c.b), { codigo: convite.codigo })).rejects.toMatchObject({
      codigo: "CONVITE_INVALIDO",
    });
    expect(await db.select().from(members).where(eq(members.spaceId, outro))).toHaveLength(1);
    await protegerContato(ref(lado === "emissor" ? c.a : c.b), {
      perfilId: (lado === "emissor" ? c.b : c.a).perfil.id,
      bloqueado: false,
      silenciado: false,
      anterior: { bloqueado: true, silenciado: false },
    });
    expect(await aceitarConvite(ref(c.b), { codigo: convite.codigo })).toMatchObject({
      mundoId: outro,
    });
  },
);

it("arquivo e suspensão do alvo não impedem proteção de um vínculo existente", async () => {
  const c = await cenario();
  await db.update(spaces).set({ status: "archived" }).where(eq(spaces.id, c.mundoId));
  await db.update(profiles).set({ status: "suspended" }).where(eq(profiles.id, c.b.perfil.id));
  expect(
    (await participantesDoMundo(ref(c.a), { mundoId: c.mundoId })).participantes[0]?.apelido,
  ).toBeNull();
  const r = await denunciarContato(ref(c.a), c.entrada);
  expect(
    (await db.select().from(reports).where(eq(reports.id, r.protocolo)))[0]?.evidenceKind,
  ).toBe("mundo");
  await protegerContato(ref(c.a), { perfilId: c.b.perfil.id, bloqueado: false, silenciado: true });
});

it("responsável nativo sem jogador e aparelho infantil preservam atores distintos na coparticipação", async () => {
  const c = await cenario(),
    familia = await familiaSocial(),
    outra = await familiaSocial();
  // Metadados de coparticipação para proteção. Não autoriza jogar Morada sem classificação.
  await db
    .insert(members)
    .values({ spaceId: c.mundoId, profileId: familia.perfil.id, role: "member", state: "active" });
  const entrada = {
    perfilId: c.b.perfil.id,
    categoria: "assedio",
    denunciaId: crypto.randomUUID(),
  };
  const r = await denunciarContatoDoMenor(familia.autor, familia.perfil.id, entrada);
  const infantil = await denunciarContato(familia.referencia, {
    ...entrada,
    denunciaId: crypto.randomUUID(),
  });
  expect((await db.select().from(reports).where(eq(reports.id, r.protocolo)))[0]).toMatchObject({
    actorKind: "responsavel",
    actorUserId: familia.conta.id,
    evidenceKind: "mundo",
    priority: true,
  });
  expect(
    (await db.select().from(reports).where(eq(reports.id, infantil.protocolo)))[0],
  ).toMatchObject({
    actorKind: "jogador",
    actorUserId: null,
    evidenceKind: "mundo",
    priority: true,
  });
  await protegerContatoDoMenor(familia.autor, familia.perfil.id, {
    perfilId: c.b.perfil.id,
    bloqueado: true,
    silenciado: true,
  });
  await expect(
    denunciarContatoDoMenor(outra.autor, familia.perfil.id, {
      ...entrada,
      denunciaId: crypto.randomUUID(),
    }),
  ).rejects.toMatchObject({ code: "PEDIDO" });
  expect(
    await db.select().from(profiles).where(eq(profiles.userId, familia.conta.id)),
  ).toHaveLength(0);
});

it("SID e jogo continuam autoritativos por HTTP e o SDK não envia conta nem identidade no corpo", async () => {
  const c = await cenario();
  const sdk = await criarRecreio({
    baseUrl: ORIGEM,
    jogo: "morada",
    social: true,
    obterIngresso: async () => (await emitirIngresso(c.a.ator, { jogo: "morada" })).ingresso,
    fetch: despachar,
    agendar: () => () => {},
  });
  if (!sdk.social) throw new Error("Social não negociado");
  expect((await sdk.social.participantes(c.mundoId)).participantes).toHaveLength(1);
  // Metadados de outro jogo como precondição de isolamento; não anuncia um título público.
  const [outro] = await db
    .insert(spaces)
    .values({
      gameId: "escopo-interno",
      stewardProfileId: c.a.perfil.id,
      createdByProfileId: c.a.perfil.id,
      name: "Outro escopo",
      contentPolicy: "padrao",
      status: "hibernating",
    })
    .returning({ id: spaces.id });
  if (!outro) throw new Error("Mundo da fixture ausente");
  await db
    .insert(members)
    .values({ spaceId: outro.id, profileId: c.a.perfil.id, role: "steward", state: "active" });
  const outroMundo = outro.id;
  expect(
    await pedir("GET", `/api/sdk/v1/mundos/${outroMundo}/participantes`, {
      token: sdk.sessao.token(),
    }),
  ).toMatchObject({ status: 403, corpo: { codigo: "NAO_MEMBRO" } });
  expect(
    await pedir("GET", `/api/sdk/v1/mundos/${c.mundoId}/participantes?perfilId=${c.b.perfil.id}`, {
      token: sdk.sessao.token(),
    }),
  ).toMatchObject({ status: 400, corpo: { codigo: "ENTRADA_INVALIDA" } });
  expect(
    await pedir("POST", "/api/sdk/v1/social", {
      token: sdk.sessao.token(),
      corpo: { operacao: "denunciar", ...c.entrada, evidenceId: c.mundoId },
    }),
  ).toMatchObject({ status: 400, corpo: { codigo: "ENTRADA_INVALIDA" } });
  const token = sdk.sessao.token();
  await sdk.sessao.sair();
  expect(
    await pedir("GET", `/api/sdk/v1/mundos/${c.mundoId}/participantes`, { token }),
  ).toMatchObject({ status: 403, corpo: { codigo: "SESSAO_ENCERRADA" } });
});

it("falha real da auditoria desfaz a denúncia de participante", async () => {
  const c = await cenario();
  await db.execute(
    sql`create function audit.recusar_coparticipacao_teste() returns trigger language plpgsql as $$ begin if new.event_type='recreio.safety_reported' then raise exception 'audit unavailable'; end if; return new; end $$`,
  );
  await db.execute(
    sql`create trigger recusar_coparticipacao_teste before insert on audit.events for each row execute function audit.recusar_coparticipacao_teste()`,
  );
  try {
    await expect(denunciarContato(ref(c.a), c.entrada)).rejects.toBeInstanceOf(
      AuditPersistenceError,
    );
    expect(
      await db.select().from(reports).where(eq(reports.reporterProfileId, c.a.perfil.id)),
    ).toHaveLength(0);
  } finally {
    await db.execute(sql`drop trigger recusar_coparticipacao_teste on audit.events`);
    await db.execute(sql`drop function audit.recusar_coparticipacao_teste()`);
  }
});

it("espera o mundo antes dos perfis e recusa prova de participação removida durante a espera", async () => {
  const c = await cenario(),
    pronto = sinal<number>(),
    soltar = sinal<void>();
  const segurando = db.transaction(async (tx) => {
    await tx.select({ id: spaces.id }).from(spaces).where(eq(spaces.id, c.mundoId)).for("update");
    const [pid] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
    if (!pid) throw new Error("PID ausente");
    pronto.concluir(pid.pid);
    await soltar.promessa;
    await tx
      .update(members)
      .set({ state: "former", leftAt: new Date() })
      .where(and(eq(members.spaceId, c.mundoId), eq(members.profileId, c.b.perfil.id)));
  });
  const pid = await pronto.promessa;
  const resultado = denunciarContato(ref(c.a), c.entrada).then(
    (valor) => ({ ok: true, valor }),
    (erro) => ({ ok: false, erro }),
  );
  try {
    await expect
      .poll(
        async () => {
          const [r] = await db.execute<{ aguardando: boolean }>(
            sql`select exists(select 1 from pg_stat_activity where ${pid}=any(pg_blocking_pids(pid))) as aguardando`,
          );
          return r?.aguardando;
        },
        { timeout: 700, interval: 10 },
      )
      .toBe(true);
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`select id from recreio.profiles where id in (${c.a.perfil.id},${c.b.perfil.id}) for update nowait`,
      );
    });
  } finally {
    soltar.concluir();
    await segurando;
  }
  expect(await resultado).toMatchObject({ ok: false, erro: { code: "CONTATO" } });
  expect(
    await db.select().from(reports).where(eq(reports.reporterProfileId, c.a.perfil.id)),
  ).toHaveLength(0);
});
