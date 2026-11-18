import { AuditPersistenceError } from "@informach/auth";
import { db, eq, sql } from "@informach/db";
import {
  recreioSocialBlocks as blocks,
  recreioDeviceSessions as devices,
  recreioFriendships as friends,
  recreioSocialNotices as notices,
  recreioProfiles as profiles,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import { consultarSupervisao, salvarSupervisao } from "@/features/politicas/service";
import {
  aceitarAmizade,
  aprovarAmizade,
  emitirCodigoDeAmigo,
  pedirAmizade,
} from "@/features/social/service";
import {
  consultarContatosDoMenor,
  lerAvisoDoMenor,
  protegerContatoDoMenor,
  removerContatoDoMenor,
} from "@/features/social/supervisao-service";
import { eventosCom, novoJogador } from "./apoio";
import { familiaSocial, referenciaSocial as ref } from "./social-apoio";

async function preparar(aceitar = false) {
  const r = await familiaSocial(),
    a = await novoJogador({ comAcesso: false });
  const codigo = await emitirCodigoDeAmigo(r.referencia);
  const pedido = await pedirAmizade(ref(a), {
    codigo: codigo.codigo,
    pedidoId: crypto.randomUUID(),
  });
  if (aceitar) {
    const [perfil] = await db.select().from(profiles).where(eq(profiles.id, r.perfil.id));
    if (!perfil) throw new Error("Perfil ausente");
    await aprovarAmizade(r.autor, {
      pedidoId: pedido.pedidoId,
      perfilId: r.perfil.id,
      versao: perfil.policyVersion,
    });
    await aceitarAmizade(r.referencia, pedido.pedidoId);
  }
  return { ...r, a, pedido };
}

describe("responsável exerce proteção sem ocupar perfil de jogador", () => {
  it("consulta, analisa pedido e confirma aviso sem criar jogador adulto", async () => {
    const r = await preparar();
    const lista = await consultarContatosDoMenor(r.autor, r.perfil.id);
    expect(lista).toMatchObject({
      perfilId: r.perfil.id,
      apelido: "Protegido",
      avisosNaoLidos: 1,
      contatos: [
        {
          perfilId: r.a.perfil.id,
          apelido: r.a.perfil.apelido,
          aprovacao: { tipo: "pedido" },
        },
      ],
    });
    expect(await db.select().from(profiles).where(eq(profiles.userId, r.conta.id))).toHaveLength(0);
    const avisoId = lista.contatos[0]?.avisoId;
    if (!avisoId) throw new Error("Aviso ausente");
    await lerAvisoDoMenor(r.autor, r.perfil.id, avisoId);
    await lerAvisoDoMenor(r.autor, r.perfil.id, avisoId);
    expect((await consultarContatosDoMenor(r.autor, r.perfil.id)).avisosNaoLidos).toBe(0);
    const eventos = (await eventosCom("noticeId", avisoId)).filter(
      (e) => e.eventType === "recreio.social_notice_read",
    );
    expect(eventos).toHaveLength(1);
    expect(eventos[0]?.actorId).toBe(r.conta.id);
  });
  it("leitura dispensa login recente; alteração exige prova recente da conta nativa", async () => {
    const r = await preparar();
    const antigo = {
      ...r.autor,
      login: { ...r.autor.login, criadoEm: new Date(Date.now() - 11 * 60_000) },
    };
    const lista = await consultarContatosDoMenor(antigo, r.perfil.id);
    const avisoId = lista.contatos[0]?.avisoId;
    if (!avisoId) throw new Error("Aviso ausente");
    await expect(lerAvisoDoMenor(antigo, r.perfil.id, avisoId)).rejects.toMatchObject({
      code: "LOGIN_RECENTE",
    });
    await expect(
      protegerContatoDoMenor(antigo, r.perfil.id, {
        perfilId: r.a.perfil.id,
        bloqueado: true,
        silenciado: false,
      }),
    ).rejects.toMatchObject({ code: "LOGIN_RECENTE" });
  });
  it("outra conta e aparelho pareado não herdam autoridade do responsável", async () => {
    const r = await preparar(),
      outra = await familiaSocial();
    await expect(consultarContatosDoMenor(outra.autor, r.perfil.id)).rejects.toMatchObject({
      code: "PEDIDO",
    });
    await expect(
      protegerContatoDoMenor(outra.autor, r.perfil.id, {
        perfilId: r.a.perfil.id,
        bloqueado: true,
        silenciado: false,
      }),
    ).rejects.toMatchObject({ code: "PEDIDO" });
    await expect(
      consultarContatosDoMenor(
        { ...r.autor, sessaoDeAparelhoId: r.referencia.sessaoDeAparelhoId },
        r.perfil.id,
      ),
    ).rejects.toMatchObject({ code: "AUTH" });
    expect(
      await db.select().from(blocks).where(eq(blocks.actorProfileId, r.perfil.id)),
    ).toHaveLength(0);
  });
  it("responsável bloqueia com contatos desabilitados e alvo suspenso, registrando o ator real", async () => {
    const r = await preparar(true);
    const supervisao = await consultarSupervisao(r.autor, r.perfil.id);
    await salvarSupervisao(r.autor, {
      perfilId: r.perfil.id,
      versao: supervisao.versao,
      configuracao: { ...supervisao.configuracao, contatos: false },
      reconheco: true,
    });
    await db.update(profiles).set({ status: "suspended" }).where(eq(profiles.id, r.a.perfil.id));
    await protegerContatoDoMenor(r.autor, r.perfil.id, {
      perfilId: r.a.perfil.id,
      bloqueado: true,
      silenciado: false,
    });
    expect(
      (await db.select().from(friends).where(eq(friends.requestId, r.pedido.pedidoId)))[0]?.state,
    ).toBe("removed");
    const evento = (await eventosCom("targetProfileId", r.a.perfil.id)).find(
      (e) => e.eventType === "recreio.social_protection_changed",
    );
    expect(evento?.actorId).toBe(r.conta.id);
    expect(
      await db.select().from(blocks).where(eq(blocks.actorProfileId, r.perfil.id)),
    ).toMatchObject([{ blocked: true }]);
  });
  it("remoção pelo responsável preserva recibo e não cria nova participação", async () => {
    const r = await preparar(true);
    await removerContatoDoMenor(r.autor, r.perfil.id, r.a.perfil.id);
    expect(
      (await db.select().from(friends).where(eq(friends.requestId, r.pedido.pedidoId)))[0],
    ).toMatchObject({ state: "removed", revision: 2 });
    expect(
      (await eventosCom("targetProfileId", r.a.perfil.id)).find(
        (e) => e.eventType === "recreio.friendship_removed",
      )?.actorId,
    ).toBe(r.conta.id);
  });
  it("prazo do aparelho adulto atravessado na auditoria reverte a proteção", async () => {
    const r = await preparar(true);
    await db
      .update(devices)
      .set({ expiresAt: new Date(Date.now() + 1000) })
      .where(eq(devices.id, r.autor.sessaoDeAparelhoId));
    await db.execute(
      sql`create function audit.esperar_protecao_responsavel_teste() returns trigger language plpgsql as $$ begin if new.event_type='recreio.social_protection_changed' then perform pg_sleep(1.1); end if; return new; end $$`,
    );
    await db.execute(
      sql`create trigger esperar_protecao_responsavel_teste before insert on audit.events for each row execute function audit.esperar_protecao_responsavel_teste()`,
    );
    try {
      await expect(
        protegerContatoDoMenor(r.autor, r.perfil.id, {
          perfilId: r.a.perfil.id,
          bloqueado: true,
          silenciado: false,
        }),
      ).rejects.toMatchObject({ code: "AUTH" });
      expect(
        await db.select().from(blocks).where(eq(blocks.actorProfileId, r.perfil.id)),
      ).toHaveLength(0);
      expect(
        (await db.select().from(friends).where(eq(friends.requestId, r.pedido.pedidoId)))[0]?.state,
      ).toBe("active");
    } finally {
      await db.execute(sql`drop trigger esperar_protecao_responsavel_teste on audit.events`);
      await db.execute(sql`drop function audit.esperar_protecao_responsavel_teste()`);
    }
  });
  it("aviso só fica lido junto da auditoria", async () => {
    const r = await preparar();
    const avisoId = (await consultarContatosDoMenor(r.autor, r.perfil.id)).contatos[0]?.avisoId;
    if (!avisoId) throw new Error("Aviso ausente");
    await db.execute(
      sql`create function audit.falhar_aviso_social_teste() returns trigger language plpgsql as $$ begin if new.event_type='recreio.social_notice_read' then raise exception 'audit unavailable'; end if; return new; end $$`,
    );
    await db.execute(
      sql`create trigger falhar_aviso_social_teste before insert on audit.events for each row execute function audit.falhar_aviso_social_teste()`,
    );
    try {
      await expect(lerAvisoDoMenor(r.autor, r.perfil.id, avisoId)).rejects.toBeInstanceOf(
        AuditPersistenceError,
      );
      expect(
        (await db.select().from(notices).where(eq(notices.id, avisoId)))[0]?.readAt,
      ).toBeNull();
    } finally {
      await db.execute(sql`drop trigger falhar_aviso_social_teste on audit.events`);
      await db.execute(sql`drop function audit.falhar_aviso_social_teste()`);
    }
  });
});
