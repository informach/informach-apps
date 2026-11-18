import { AuditPersistenceError } from "@informach/auth";
import { and, db, eq, sql } from "@informach/db";
import {
  recreioFriendConsents as consents,
  recreioFriendships as friends,
  recreioProfiles as profiles,
  recreioFriendRequests as requests,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import {
  aprovarPareamento,
  consultarPareamento,
  desconectarTodosDoMenor,
  prepararPareamento,
} from "@/features/protecao/service";
import {
  aceitarAmizade,
  aprovarAmizade,
  emitirCodigoDeAmigo,
  pedirAmizade,
} from "@/features/social/service";
import { eventosCom, novoJogador } from "./apoio";
import { familiaSocial, referenciaSocial } from "./social-apoio";

async function entreAdultos() {
  const a = await novoJogador({ comAcesso: false });
  const b = await novoJogador({ comAcesso: false });
  const codigo = await emitirCodigoDeAmigo(referenciaSocial(b));
  const pedido = await pedirAmizade(referenciaSocial(a), {
    codigo: codigo.codigo,
    pedidoId: crypto.randomUUID(),
  });
  return { a, b, pedido };
}
async function versao(perfilId: string) {
  const [perfil] = await db
    .select({ versao: profiles.policyVersion })
    .from(profiles)
    .where(eq(profiles.id, perfilId));
  if (!perfil) throw new Error("Perfil ausente");
  return perfil.versao;
}
describe("aceite explícito e aprovação pessoal atual", () => {
  it("somente o destinatário confirma; repetição não cria outra amizade ou auditoria", async () => {
    const r = await entreAdultos();
    const estranho = await novoJogador({ comAcesso: false });
    await expect(aceitarAmizade(referenciaSocial(r.a), r.pedido.pedidoId)).rejects.toMatchObject({
      code: "PEDIDO",
    });
    await expect(
      aceitarAmizade(referenciaSocial(estranho), r.pedido.pedidoId),
    ).rejects.toMatchObject({ code: "PEDIDO" });
    expect(await aceitarAmizade(referenciaSocial(r.b), r.pedido.pedidoId)).toEqual({
      pedidoId: r.pedido.pedidoId,
      estado: "accepted",
    });
    expect(await aceitarAmizade(referenciaSocial(r.b), r.pedido.pedidoId)).toEqual({
      pedidoId: r.pedido.pedidoId,
      estado: "accepted",
    });
    expect(
      await db.select().from(friends).where(eq(friends.requestId, r.pedido.pedidoId)),
    ).toHaveLength(1);
    const auditoria = await eventosCom("requestId", r.pedido.pedidoId);
    expect(auditoria.filter((e) => e.eventType === "recreio.friend_request_accepted")).toHaveLength(
      1,
    );
    expect(auditoria.filter((e) => e.eventType === "recreio.friendship_started")).toHaveLength(1);
    expect(auditoria.find((e) => e.eventType === "recreio.friendship_started")?.actorId).toBe(
      r.b.conta.id,
    );
  });
  it.each(["antes", "depois"] as const)(
    "responsável sem jogador aprova %s do aceite da criança",
    async (ordem) => {
      const r = await familiaSocial();
      const a = await novoJogador({ comAcesso: false });
      const codigo = await emitirCodigoDeAmigo(r.referencia);
      const pedido = await pedirAmizade(referenciaSocial(a), {
        codigo: codigo.codigo,
        pedidoId: crypto.randomUUID(),
      });
      const entrada = {
        pedidoId: pedido.pedidoId,
        perfilId: r.perfil.id,
        versao: await versao(r.perfil.id),
      };
      if (ordem === "antes") {
        expect(await aprovarAmizade(r.autor, entrada)).toMatchObject({ estado: "pending" });
        expect(await aceitarAmizade(r.referencia, pedido.pedidoId)).toMatchObject({
          estado: "accepted",
        });
      } else {
        expect(await aceitarAmizade(r.referencia, pedido.pedidoId)).toMatchObject({
          estado: "pending",
        });
        expect(
          await db.select().from(friends).where(eq(friends.requestId, pedido.pedidoId)),
        ).toHaveLength(0);
        expect(await aprovarAmizade(r.autor, entrada)).toMatchObject({ estado: "accepted" });
      }
      expect(await db.select().from(profiles).where(eq(profiles.userId, r.conta.id))).toHaveLength(
        0,
      );
      expect(
        await db
          .select()
          .from(consents)
          .where(and(eq(consents.requestId, pedido.pedidoId), eq(consents.profileId, r.perfil.id))),
      ).toHaveLength(1);
      expect(
        await db.select().from(friends).where(eq(friends.requestId, pedido.pedidoId)),
      ).toHaveLength(1);
    },
  );
  it("dois menores precisam de aprovações independentes e atuais", async () => {
    const a = await familiaSocial();
    const b = await familiaSocial();
    const codigo = await emitirCodigoDeAmigo(b.referencia);
    const pedido = await pedirAmizade(a.referencia, {
      codigo: codigo.codigo,
      pedidoId: crypto.randomUUID(),
    });
    await aceitarAmizade(b.referencia, pedido.pedidoId);
    await expect(
      aprovarAmizade(a.autor, {
        pedidoId: pedido.pedidoId,
        perfilId: b.perfil.id,
        versao: await versao(b.perfil.id),
      }),
    ).rejects.toMatchObject({ code: "PEDIDO" });
    expect(
      await aprovarAmizade(a.autor, {
        pedidoId: pedido.pedidoId,
        perfilId: a.perfil.id,
        versao: await versao(a.perfil.id),
      }),
    ).toMatchObject({ estado: "pending" });
    expect(
      await db.select().from(friends).where(eq(friends.requestId, pedido.pedidoId)),
    ).toHaveLength(0);
    expect(
      await aprovarAmizade(b.autor, {
        pedidoId: pedido.pedidoId,
        perfilId: b.perfil.id,
        versao: await versao(b.perfil.id),
      }),
    ).toMatchObject({ estado: "accepted" });
  });
  it("adolescente confirma com código e aviso, sem herdar faixa adulta ou cobrança", async () => {
    const r = await familiaSocial(14);
    const a = await novoJogador({ comAcesso: false });
    const codigo = await emitirCodigoDeAmigo(r.referencia);
    const pedido = await pedirAmizade(referenciaSocial(a), {
      codigo: codigo.codigo,
      pedidoId: crypto.randomUUID(),
    });
    expect(await aceitarAmizade(r.referencia, pedido.pedidoId)).toMatchObject({
      estado: "accepted",
    });
    expect(
      await db.select().from(consents).where(eq(consents.requestId, pedido.pedidoId)),
    ).toHaveLength(0);
    expect(
      (await eventosCom("requestId", pedido.pedidoId)).find(
        (e) => e.eventType === "recreio.friend_request_accepted",
      )?.actorId,
    ).toBeNull();
  });
  it("revogar a geração exige nova aprovação mesmo no mesmo perfil e responsável", async () => {
    const r = await familiaSocial();
    const a = await novoJogador({ comAcesso: false });
    const codigo = await emitirCodigoDeAmigo(r.referencia);
    const pedido = await pedirAmizade(referenciaSocial(a), {
      codigo: codigo.codigo,
      pedidoId: crypto.randomUUID(),
    });
    await aprovarAmizade(r.autor, {
      pedidoId: pedido.pedidoId,
      perfilId: r.perfil.id,
      versao: await versao(r.perfil.id),
    });
    await desconectarTodosDoMenor(r.autor, r.perfil.id);
    const pareamento = await prepararPareamento("198.18.100.1");
    const aprovado = await aprovarPareamento(r.autor, {
      perfilId: r.perfil.id,
      codigo: pareamento.codigo,
    });
    await consultarPareamento(pareamento.segredo);
    const referencia = { perfilId: r.perfil.id, sessaoDeAparelhoId: aprovado.aparelhoId };
    expect(await aceitarAmizade(referencia, pedido.pedidoId)).toMatchObject({ estado: "pending" });
    expect(
      await db.select().from(friends).where(eq(friends.requestId, pedido.pedidoId)),
    ).toHaveLength(0);
    expect(
      await aprovarAmizade(r.autor, {
        pedidoId: pedido.pedidoId,
        perfilId: r.perfil.id,
        versao: await versao(r.perfil.id),
      }),
    ).toMatchObject({ estado: "accepted" });
  });
  it("login antigo do responsável não grava consentimento", async () => {
    const r = await familiaSocial();
    const a = await novoJogador({ comAcesso: false });
    const codigo = await emitirCodigoDeAmigo(r.referencia);
    const pedido = await pedirAmizade(referenciaSocial(a), {
      codigo: codigo.codigo,
      pedidoId: crypto.randomUUID(),
    });
    await expect(
      aprovarAmizade(
        {
          ...r.autor,
          login: {
            ...r.autor.login,
            criadoEm: new Date(Date.now() - 11 * 60_000),
          },
        },
        {
          pedidoId: pedido.pedidoId,
          perfilId: r.perfil.id,
          versao: await versao(r.perfil.id),
        },
      ),
    ).rejects.toMatchObject({ code: "LOGIN_RECENTE" });
    expect(
      await db.select().from(consents).where(eq(consents.requestId, pedido.pedidoId)),
    ).toHaveLength(0);
  });
  it("repetir aceite não reanexa uma amizade removida", async () => {
    const r = await entreAdultos();
    await aceitarAmizade(referenciaSocial(r.b), r.pedido.pedidoId);
    await db
      .update(friends)
      .set({ state: "removed", removedAt: new Date(), revision: 2 })
      .where(eq(friends.requestId, r.pedido.pedidoId));
    await aceitarAmizade(referenciaSocial(r.b), r.pedido.pedidoId);
    expect(
      (await db.select().from(friends).where(eq(friends.requestId, r.pedido.pedidoId)))[0],
    ).toMatchObject({ state: "removed", revision: 2 });
  });
  it.each(["auditoria", "prazo"] as const)(
    "%s na ativação reverte aceite e amizade",
    async (tipo) => {
      const r = await entreAdultos();
      if (tipo === "prazo")
        await db
          .update(requests)
          .set({ expiresAt: new Date(Date.now() + 1000) })
          .where(eq(requests.id, r.pedido.pedidoId));
      await db.execute(
        tipo === "auditoria"
          ? sql`create function audit.falhar_amizade_teste() returns trigger language plpgsql as $$ begin if new.event_type='recreio.friendship_started' then raise exception 'audit unavailable'; end if; return new; end $$`
          : sql`create function audit.falhar_amizade_teste() returns trigger language plpgsql as $$ begin if new.event_type='recreio.friendship_started' then perform pg_sleep(1.1); end if; return new; end $$`,
      );
      await db.execute(
        sql`create trigger falhar_amizade_teste before insert on audit.events for each row execute function audit.falhar_amizade_teste()`,
      );
      try {
        const tentativa = aceitarAmizade(referenciaSocial(r.b), r.pedido.pedidoId);
        if (tipo === "auditoria")
          await expect(tentativa).rejects.toBeInstanceOf(AuditPersistenceError);
        else await expect(tentativa).rejects.toMatchObject({ code: "PEDIDO" });
        expect(
          await db.select().from(friends).where(eq(friends.requestId, r.pedido.pedidoId)),
        ).toHaveLength(0);
        expect(
          (await db.select().from(requests).where(eq(requests.id, r.pedido.pedidoId)))[0],
        ).toMatchObject({ state: "pending", targetAcceptedAt: null, finishedAt: null });
      } finally {
        await db.execute(sql`drop trigger falhar_amizade_teste on audit.events`);
        await db.execute(sql`drop function audit.falhar_amizade_teste()`);
      }
    },
  );
});
