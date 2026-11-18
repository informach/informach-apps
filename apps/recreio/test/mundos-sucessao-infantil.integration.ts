import { createHash } from "node:crypto";
import { AuditPersistenceError } from "@informach/auth";
import { and, db, eq, sql } from "@informach/db";
import {
  recreioGuardianLinks as guardians,
  recreioSpaceMembers as members,
  recreioProfiles as profiles,
  recreioStewardshipGuardianApprovals as proofs,
  recreioSpaceStewardshipRequests as requests,
  sessions,
  recreioSpaceSnapshots as snapshots,
  recreioSpaces as spaces,
} from "@informach/db/schema";
import { expect, it } from "vitest";
import { painelDeAdministracaoDoMundo } from "@/features/mundos/administracao-painel-repository";
import { responderTransferencia } from "@/features/mundos/responsabilidade";
import {
  cancelarTransferenciaDoMenor,
  painelDaTransferenciaDoMenor,
  proporTransferenciaDoMenor,
} from "@/features/mundos/responsabilidade-infantil";
import { desconectarTodosDoMenor } from "@/features/protecao/service";
import { eventosCom, novoJogador } from "./apoio";
import { familiaSocial, referenciaSocial } from "./social-apoio";

async function cenario() {
  const familia = await familiaSocial(),
    adulto = await novoJogador({ comAcesso: false });
  const [mundo] = await db
    .insert(spaces)
    .values({
      gameId: "morada",
      name: "Mundo a transferir",
      contentPolicy: "todas_as_idades",
      stewardProfileId: familia.perfil.id,
      createdByProfileId: familia.perfil.id,
      status: "hibernating",
      revision: 3,
      leaseEpoch: 7,
    })
    .returning();
  if (!mundo) throw new Error("Mundo ausente");
  const [origem] = await db
    .insert(members)
    .values({ spaceId: mundo.id, profileId: familia.perfil.id, role: "steward", state: "active" })
    .returning();
  if (!origem) throw new Error("Origem ausente");
  const [destino] = await db
    .insert(members)
    .values({
      spaceId: mundo.id,
      profileId: adulto.perfil.id,
      role: "member",
      state: "active",
      invitedByMemberId: origem.id,
    })
    .returning();
  const [login] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, adulto.login.authSessionId));
  if (!destino || !login) throw new Error("Destinatário ausente");
  await db.insert(snapshots).values({
    spaceId: mundo.id,
    revision: 3,
    fence: 7,
    schemaVersion: 2,
    journalSeq: 0,
    tick: 12,
    kind: "hibernate",
    storage: "pg",
    data: Buffer.from("mundo"),
    byteSize: 5,
    sha256: createHash("sha256").update("mundo").digest("hex"),
  });
  const autor = {
    ...referenciaSocial(adulto),
    contaId: adulto.conta.id,
    login: { authSessionId: login.id, criadoEm: login.createdAt, expiraEm: login.expiresAt },
  };
  const pedido = { mundoId: mundo.id, membroId: destino.id, versaoDaGestao: 1, confirmo: true };
  return { familia, adulto, mundo, origem, destino, autor, pedido };
}
const propor = (c: Awaited<ReturnType<typeof cenario>>) =>
  proporTransferenciaDoMenor(c.familia.autor, c.familia.perfil.id, c.pedido);

it("responsável sem jogador propõe e o adulto destinatário aceita sem cobertura, preservando mundo e membros", async () => {
  const c = await cenario(),
    proposta = await propor(c);
  const terceiro = await novoJogador({ comAcesso: false });
  const [participacao] = await db
    .insert(members)
    .values({
      spaceId: c.mundo.id,
      profileId: terceiro.perfil.id,
      role: "coadmin",
      state: "no_access",
    })
    .returning();
  expect(await propor(c)).toEqual(proposta);
  expect(
    (await db.select().from(spaces).where(eq(spaces.id, c.mundo.id)))[0]?.stewardProfileId,
  ).toBe(c.familia.perfil.id);
  const [prova] = await db.select().from(proofs).where(eq(proofs.requestId, proposta.pedidoId));
  expect(prova).toMatchObject({
    profileId: c.familia.perfil.id,
    approvedByUserId: c.familia.conta.id,
    managementRevision: 1,
  });
  const aceito = await responderTransferencia(c.autor, c.mundo.id, proposta.pedidoId, "accepted");
  expect(aceito.estado).toBe("accepted");
  expect(await responderTransferencia(c.autor, c.mundo.id, proposta.pedidoId, "accepted")).toEqual(
    aceito,
  );
  expect((await db.select().from(spaces).where(eq(spaces.id, c.mundo.id)))[0]).toMatchObject({
    stewardProfileId: c.adulto.perfil.id,
    createdByProfileId: c.familia.perfil.id,
    managementRevision: 2,
    revision: 3,
    leaseEpoch: 7,
  });
  expect((await db.select().from(members).where(eq(members.id, c.origem.id)))[0]).toMatchObject({
    role: "member",
    state: "active",
    profileId: c.familia.perfil.id,
  });
  expect((await db.select().from(members).where(eq(members.id, c.destino.id)))[0]?.role).toBe(
    "steward",
  );
  expect(
    (await db.select().from(members).where(eq(members.profileId, terceiro.perfil.id)))[0],
  ).toEqual(participacao);
  expect(
    (
      await db.select().from(snapshots).where(eq(snapshots.spaceId, c.mundo.id))
    )[0]?.data?.toString(),
  ).toBe("mundo");
  expect(
    await db.select().from(profiles).where(eq(profiles.userId, c.familia.conta.id)),
  ).toHaveLength(0);
  expect(
    (await eventosCom("requestId", proposta.pedidoId)).filter(
      (e) => e.eventType === "recreio.space_stewardship_requested",
    ),
  ).toMatchObject([
    {
      actorId: c.familia.conta.id,
      payload: { actorKind: "responsavel", profileId: c.familia.perfil.id },
    },
  ]);
  expect(
    (await eventosCom("requestId", proposta.pedidoId)).filter(
      (e) => e.eventType === "recreio.space_stewardship_accepted",
    ),
  ).toHaveLength(1);
  await expect(
    painelDeAdministracaoDoMundo(
      { responsavel: c.familia.autor, perfilId: c.familia.perfil.id },
      c.mundo.id,
    ),
  ).rejects.toMatchObject({ code: "RESPONSAVEL" });
});

it("consulta parental gratuita aceita login antigo, pagina adultos e mostra prova invalidada sem renová-la", async () => {
  const c = await cenario(),
    antigo = {
      ...c.familia.autor,
      login: { ...c.familia.autor.login, criadoEm: new Date(Date.now() - 11 * 60000) },
    };
  expect(await painelDaTransferenciaDoMenor(antigo, c.familia.perfil.id, c.mundo.id)).toMatchObject(
    { candidatos: [{ id: c.destino.id, apelido: c.adulto.perfil.apelido }], proposta: null },
  );
  expect(
    (await painelDaTransferenciaDoMenor(antigo, c.familia.perfil.id, c.mundo.id, c.destino.id))
      .candidatos,
  ).toHaveLength(0);
  const proposta = await propor(c);
  expect(
    (await painelDaTransferenciaDoMenor(antigo, c.familia.perfil.id, c.mundo.id)).proposta,
  ).toMatchObject({ id: proposta.pedidoId, autorizacaoAtual: true });
  await desconectarTodosDoMenor(c.familia.autor, c.familia.perfil.id);
  expect(
    (await painelDaTransferenciaDoMenor(antigo, c.familia.perfil.id, c.mundo.id)).proposta,
  ).toMatchObject({ id: proposta.pedidoId, autorizacaoAtual: false });
  await expect(propor(c)).rejects.toMatchObject({ code: "PEDIDO_PENDENTE" });
  expect(await db.select().from(requests).where(eq(requests.spaceId, c.mundo.id))).toHaveLength(1);
});

it("falha da auditoria na proposta reverte também a prova parental", async () => {
  const c = await cenario();
  await db.execute(
    sql`create function audit.proposta_menor_teste() returns trigger language plpgsql as $$ begin if new.event_type='recreio.space_stewardship_requested' then raise exception 'audit unavailable'; end if; return new; end $$`,
  );
  await db.execute(
    sql`create trigger proposta_menor_teste before insert on audit.events for each row execute function audit.proposta_menor_teste()`,
  );
  try {
    await expect(propor(c)).rejects.toBeInstanceOf(AuditPersistenceError);
  } finally {
    await db.execute(sql`drop trigger proposta_menor_teste on audit.events`);
    await db.execute(sql`drop function audit.proposta_menor_teste()`);
  }
  expect(await db.select().from(requests).where(eq(requests.spaceId, c.mundo.id))).toHaveLength(0);
  expect(
    await db.select().from(proofs).where(eq(proofs.profileId, c.familia.perfil.id)),
  ).toHaveLength(0);
});

it("prazo vencido durante a auditoria reverte o aceite e as mudanças de autoridade", async () => {
  const c = await cenario(),
    proposta = await propor(c);
  await db
    .update(requests)
    .set({ expiresAt: new Date(Date.now() + 1100) })
    .where(eq(requests.id, proposta.pedidoId));
  await db.execute(
    sql`create function audit.prazo_sucessao_teste() returns trigger language plpgsql as $$ begin if new.event_type='recreio.space_stewardship_accepted' then perform pg_sleep(1.3); end if; return new; end $$`,
  );
  await db.execute(
    sql`create trigger prazo_sucessao_teste before insert on audit.events for each row execute function audit.prazo_sucessao_teste()`,
  );
  try {
    await expect(
      responderTransferencia(c.autor, c.mundo.id, proposta.pedidoId, "accepted"),
    ).rejects.toMatchObject({ code: "CONFLITO" });
  } finally {
    await db.execute(sql`drop trigger prazo_sucessao_teste on audit.events`);
    await db.execute(sql`drop function audit.prazo_sucessao_teste()`);
  }
  expect(
    (await db.select().from(requests).where(eq(requests.id, proposta.pedidoId)))[0]?.state,
  ).toBe("pending");
  expect((await db.select().from(spaces).where(eq(spaces.id, c.mundo.id)))[0]).toMatchObject({
    stewardProfileId: c.familia.perfil.id,
    managementRevision: 1,
    revision: 3,
    leaseEpoch: 7,
  });
});

it("outro responsável, aparelho pareado, login antigo, revisão velha e campos de identidade não propõem", async () => {
  const c = await cenario(),
    outra = await familiaSocial();
  await expect(
    proporTransferenciaDoMenor(outra.autor, c.familia.perfil.id, c.pedido),
  ).rejects.toThrow();
  await expect(
    proporTransferenciaDoMenor(
      { ...c.familia.autor, sessaoDeAparelhoId: c.familia.referencia.sessaoDeAparelhoId },
      c.familia.perfil.id,
      c.pedido,
    ),
  ).rejects.toMatchObject({ code: "AUTH" });
  await expect(
    proporTransferenciaDoMenor(
      {
        ...c.familia.autor,
        login: { ...c.familia.autor.login, criadoEm: new Date(Date.now() - 11 * 60000) },
      },
      c.familia.perfil.id,
      c.pedido,
    ),
  ).rejects.toMatchObject({ code: "LOGIN_RECENTE" });
  await expect(
    proporTransferenciaDoMenor(c.familia.autor, c.familia.perfil.id, {
      ...c.pedido,
      versaoDaGestao: 2,
    }),
  ).rejects.toMatchObject({ code: "CONFLITO" });
  await expect(
    proporTransferenciaDoMenor(c.familia.autor, c.familia.perfil.id, {
      ...c.pedido,
      contaId: c.adulto.conta.id,
    }),
  ).rejects.toThrow();
  expect(await db.select().from(requests).where(eq(requests.spaceId, c.mundo.id))).toHaveLength(0);
});

it.each(["geracao", "politica", "gestao", "vinculo"] as const)(
  "%s alterada invalida a aprovação parental sem transferir",
  async (tipo) => {
    const c = await cenario(),
      proposta = await propor(c);
    if (tipo === "geracao") await desconectarTodosDoMenor(c.familia.autor, c.familia.perfil.id);
    else if (tipo === "politica")
      await db
        .update(profiles)
        .set({ policyVersion: sql`${profiles.policyVersion}+1` })
        .where(eq(profiles.id, c.familia.perfil.id));
    else if (tipo === "gestao")
      await db.update(spaces).set({ managementRevision: 2 }).where(eq(spaces.id, c.mundo.id));
    else await db.delete(guardians).where(eq(guardians.profileId, c.familia.perfil.id));
    await expect(
      responderTransferencia(c.autor, c.mundo.id, proposta.pedidoId, "accepted"),
    ).rejects.toThrow();
    expect(
      (await db.select().from(requests).where(eq(requests.id, proposta.pedidoId)))[0]?.state,
    ).toBe("pending");
    expect(
      (await db.select().from(spaces).where(eq(spaces.id, c.mundo.id)))[0]?.stewardProfileId,
    ).toBe(c.familia.perfil.id);
    if (tipo === "vinculo")
      expect(
        await db.select().from(proofs).where(eq(proofs.requestId, proposta.pedidoId)),
      ).toHaveLength(0);
    else {
      expect(
        (
          await cancelarTransferenciaDoMenor(c.familia.autor, c.familia.perfil.id, {
            mundoId: c.mundo.id,
            pedidoId: proposta.pedidoId,
          })
        ).estado,
      ).toBe("revoked");
    }
  },
);

it("destinatário precisa do próprio login recente e não recebe administração antes do aceite", async () => {
  const c = await cenario(),
    proposta = await propor(c),
    outro = await novoJogador();
  await expect(
    responderTransferencia(
      { ...c.autor, ...referenciaSocial(outro), contaId: outro.conta.id },
      c.mundo.id,
      proposta.pedidoId,
      "accepted",
    ),
  ).rejects.toThrow();
  await expect(
    responderTransferencia(
      { ...c.autor, login: { ...c.autor.login, criadoEm: new Date(Date.now() - 11 * 60000) } },
      c.mundo.id,
      proposta.pedidoId,
      "accepted",
    ),
  ).rejects.toMatchObject({ code: "LOGIN_RECENTE" });
  await expect(painelDeAdministracaoDoMundo(c.autor, c.mundo.id)).rejects.toMatchObject({
    code: "RESPONSAVEL",
  });
  expect(
    (await responderTransferencia(c.autor, c.mundo.id, proposta.pedidoId, "declined")).estado,
  ).toBe("declined");
  expect((await db.select().from(members).where(eq(members.id, c.destino.id)))[0]?.role).toBe(
    "member",
  );
});

it("falha da auditoria no aceite reverte papéis, revisão e recibo", async () => {
  const c = await cenario(),
    proposta = await propor(c);
  await db.execute(
    sql`create function audit.sucessao_menor_teste() returns trigger language plpgsql as $$ begin if new.event_type='recreio.space_stewardship_accepted' then raise exception 'audit unavailable'; end if; return new; end $$`,
  );
  await db.execute(
    sql`create trigger sucessao_menor_teste before insert on audit.events for each row execute function audit.sucessao_menor_teste()`,
  );
  try {
    await expect(
      responderTransferencia(c.autor, c.mundo.id, proposta.pedidoId, "accepted"),
    ).rejects.toBeInstanceOf(AuditPersistenceError);
  } finally {
    await db.execute(sql`drop trigger sucessao_menor_teste on audit.events`);
    await db.execute(sql`drop function audit.sucessao_menor_teste()`);
  }
  expect(
    (await db.select().from(requests).where(eq(requests.id, proposta.pedidoId)))[0]?.state,
  ).toBe("pending");
  expect((await db.select().from(spaces).where(eq(spaces.id, c.mundo.id)))[0]).toMatchObject({
    managementRevision: 1,
    stewardProfileId: c.familia.perfil.id,
    revision: 3,
    leaseEpoch: 7,
  });
  expect(
    await db
      .select()
      .from(members)
      .where(and(eq(members.spaceId, c.mundo.id), eq(members.role, "steward"))),
  ).toMatchObject([{ id: c.origem.id }]);
});
