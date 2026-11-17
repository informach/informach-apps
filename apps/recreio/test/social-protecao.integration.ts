import { AuditPersistenceError } from "@informach/auth";
import { and, db, eq, sql } from "@informach/db";
import {
  recreioSocialBlocks as blocks,
  recreioFriendships as friends,
  recreioProfiles as profiles,
  recreioFriendRequests as requests,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import {
  aceitarAmizade,
  emitirCodigoDeAmigo,
  encerrarPedidoDeAmizade,
  pedirAmizade,
  protegerContato,
  removerAmizade,
} from "@/features/social/service";
import { eventosCom, novoJogador } from "./apoio";
import { referenciaSocial as ref } from "./social-apoio";

async function par(aceito = false) {
  const a = await novoJogador({ comAcesso: false });
  const b = await novoJogador({ comAcesso: false });
  const codigo = await emitirCodigoDeAmigo(ref(b));
  const pedido = await pedirAmizade(ref(a), {
    codigo: codigo.codigo,
    pedidoId: crypto.randomUUID(),
  });
  if (aceito) await aceitarAmizade(ref(b), pedido.pedidoId);
  return { a, b, pedido };
}
const relacao = async (id: string) =>
  (await db.select().from(friends).where(eq(friends.requestId, id)))[0];
const pedidoAtual = async (id: string) =>
  (await db.select().from(requests).where(eq(requests.id, id)))[0];

describe("proteção social é autoridade própria e não reativa contato", () => {
  it("bloquear revoga pedido, repete sem novo evento e desbloquear não o restaura", async () => {
    const r = await par();
    const entrada = { perfilId: r.b.perfil.id, bloqueado: true, silenciado: false };
    await protegerContato(ref(r.a), entrada);
    await protegerContato(ref(r.a), entrada);
    expect(await pedidoAtual(r.pedido.pedidoId)).toMatchObject({ state: "revoked" });
    await expect(aceitarAmizade(ref(r.b), r.pedido.pedidoId)).rejects.toMatchObject({
      code: "PEDIDO",
    });
    const eventos = await eventosCom("targetProfileId", r.b.perfil.id);
    expect(eventos.filter((e) => e.eventType === "recreio.social_protection_changed")).toHaveLength(
      1,
    );
    await protegerContato(ref(r.a), {
      ...entrada,
      bloqueado: false,
      anterior: { bloqueado: true, silenciado: false },
    });
    expect(await pedidoAtual(r.pedido.pedidoId)).toMatchObject({ state: "revoked" });
    expect(await relacao(r.pedido.pedidoId)).toBeUndefined();
  });
  it("silenciar conserva amizade; remover e liberar silêncio não a reativam", async () => {
    const r = await par(true);
    await protegerContato(ref(r.a), {
      perfilId: r.b.perfil.id,
      bloqueado: false,
      silenciado: true,
    });
    expect(await relacao(r.pedido.pedidoId)).toMatchObject({ state: "active", revision: 1 });
    await removerAmizade(ref(r.a), r.b.perfil.id);
    await removerAmizade(ref(r.a), r.b.perfil.id);
    await protegerContato(ref(r.a), {
      perfilId: r.b.perfil.id,
      bloqueado: false,
      silenciado: false,
      anterior: { bloqueado: false, silenciado: true },
    });
    await aceitarAmizade(ref(r.b), r.pedido.pedidoId);
    expect(await relacao(r.pedido.pedidoId)).toMatchObject({ state: "removed", revision: 2 });
    expect(
      (await eventosCom("targetProfileId", r.b.perfil.id)).filter(
        (e) => e.eventType === "recreio.friendship_removed",
      ),
    ).toHaveLength(1);
  });
  it("alvo suspenso continua bloqueável e cada ponta conserva sua própria proteção", async () => {
    const r = await par(true);
    await protegerContato(ref(r.b), { perfilId: r.a.perfil.id, bloqueado: true, silenciado: true });
    await db.update(profiles).set({ status: "suspended" }).where(eq(profiles.id, r.b.perfil.id));
    await protegerContato(ref(r.a), {
      perfilId: r.b.perfil.id,
      bloqueado: true,
      silenciado: false,
    });
    await protegerContato(ref(r.a), {
      perfilId: r.b.perfil.id,
      bloqueado: false,
      silenciado: false,
      anterior: { bloqueado: true, silenciado: false },
    });
    expect(
      await db
        .select()
        .from(blocks)
        .where(
          and(eq(blocks.actorProfileId, r.b.perfil.id), eq(blocks.targetProfileId, r.a.perfil.id)),
        ),
    ).toMatchObject([{ blocked: true, muted: true }]);
    expect(await relacao(r.pedido.pedidoId)).toMatchObject({ state: "removed" });
  });
  it.each(["recusar", "revogar"] as const)(
    "%s exige a ponta correta e não reabre recibo",
    async (acao) => {
      const r = await par();
      const correta = acao === "recusar" ? r.b : r.a;
      const incorreta = acao === "recusar" ? r.a : r.b;
      const entrada = { pedidoId: r.pedido.pedidoId, acao };
      await expect(encerrarPedidoDeAmizade(ref(incorreta), entrada)).rejects.toMatchObject({
        code: "PEDIDO",
      });
      await encerrarPedidoDeAmizade(ref(correta), entrada);
      await encerrarPedidoDeAmizade(ref(correta), entrada);
      expect(await pedidoAtual(r.pedido.pedidoId)).toMatchObject({
        state: acao === "recusar" ? "rejected" : "revoked",
      });
      expect(await relacao(r.pedido.pedidoId)).toBeUndefined();
    },
  );
  it("uma tela antiga não desfaz bloqueio ao tentar retirar silêncio", async () => {
    const r = await par(true);
    await protegerContato(ref(r.a), {
      perfilId: r.b.perfil.id,
      bloqueado: false,
      silenciado: true,
    });
    const antigo = {
      perfilId: r.b.perfil.id,
      bloqueado: false,
      silenciado: false,
      anterior: { bloqueado: false, silenciado: true },
    };
    await protegerContato(ref(r.a), { perfilId: r.b.perfil.id, bloqueado: true, silenciado: true });
    await expect(protegerContato(ref(r.a), antigo)).rejects.toMatchObject({ code: "CONFLITO" });
    await expect(
      protegerContato(ref(r.a), { perfilId: r.b.perfil.id, bloqueado: false, silenciado: true }),
    ).rejects.toMatchObject({ code: "CONFLITO" });
    expect(
      await db.select().from(blocks).where(eq(blocks.actorProfileId, r.a.perfil.id)),
    ).toMatchObject([{ blocked: true, muted: true }]);
    await protegerContato(ref(r.a), {
      ...antigo,
      silenciado: true,
      anterior: { bloqueado: true, silenciado: true },
    });
    expect(await relacao(r.pedido.pedidoId)).toMatchObject({ state: "removed" });
  });
  it("bloqueio concorrente ao aceite termina sem amizade ativa", async () => {
    const r = await par();
    const resultados = await Promise.allSettled([
      aceitarAmizade(ref(r.b), r.pedido.pedidoId),
      protegerContato(ref(r.a), { perfilId: r.b.perfil.id, bloqueado: true, silenciado: false }),
    ]);
    expect(resultados[1]?.status).toBe("fulfilled");
    expect((await relacao(r.pedido.pedidoId))?.state).not.toBe("active");
    expect(
      await db.select().from(blocks).where(eq(blocks.actorProfileId, r.a.perfil.id)),
    ).toMatchObject([{ blocked: true }]);
  });
  it("falha da auditoria reverte proteção e remoção de amizade juntas", async () => {
    const r = await par(true);
    await db.execute(
      sql`create function audit.falhar_protecao_teste() returns trigger language plpgsql as $$ begin if new.event_type='recreio.social_protection_changed' then raise exception 'audit unavailable'; end if; return new; end $$`,
    );
    await db.execute(
      sql`create trigger falhar_protecao_teste before insert on audit.events for each row execute function audit.falhar_protecao_teste()`,
    );
    try {
      await expect(
        protegerContato(ref(r.a), { perfilId: r.b.perfil.id, bloqueado: true, silenciado: false }),
      ).rejects.toBeInstanceOf(AuditPersistenceError);
      expect(await relacao(r.pedido.pedidoId)).toMatchObject({ state: "active", revision: 1 });
      expect(
        await db.select().from(blocks).where(eq(blocks.actorProfileId, r.a.perfil.id)),
      ).toHaveLength(0);
      expect(
        (await eventosCom("targetProfileId", r.b.perfil.id)).filter(
          (e) => e.eventType === "recreio.friendship_removed",
        ),
      ).toHaveLength(0);
    } finally {
      await db.execute(sql`drop trigger falhar_protecao_teste on audit.events`);
      await db.execute(sql`drop function audit.falhar_protecao_teste()`);
    }
  });
});
