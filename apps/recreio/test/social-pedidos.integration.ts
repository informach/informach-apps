import { AuditPersistenceError } from "@informach/auth";
import { and, db, eq, sql } from "@informach/db";
import {
  recreioSocialBlocks as blocks,
  recreioFriendCodes as codes,
  recreioFriendships as friends,
  recreioSocialNotices as notices,
  recreioProfiles as profiles,
  recreioFriendRequests as requests,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import { desconectarTodosDoMenor } from "@/features/protecao/service";
import { emitirCodigoDeAmigo, pedirAmizade } from "@/features/social/service";
import { eventosCom, novaConta, novoJogador } from "./apoio";
import { familiaSocial, referenciaSocial } from "./social-apoio";

async function preparar() {
  const a = await novoJogador({ comAcesso: false });
  const b = await novoJogador({ comAcesso: false });
  const codigo = await emitirCodigoDeAmigo(referenciaSocial(b));
  const pedido = { codigo: codigo.codigo, pedidoId: crypto.randomUUID() };
  return { a, b, codigo, pedido };
}
describe("código de uso único e pedido privado de amizade", () => {
  it("pedido repete o mesmo recibo sem consumir novo código ou criar amizade", async () => {
    const r = await preparar();
    const primeiro = await pedirAmizade(referenciaSocial(r.a), r.pedido);
    expect(primeiro).toMatchObject({ estado: "pending", repetido: false });
    const repetido = await pedirAmizade(referenciaSocial(r.a), {
      ...r.pedido,
      codigo:
        `${r.pedido.codigo.slice(0, 4)}-${r.pedido.codigo.slice(4, 8)}-${r.pedido.codigo.slice(8)}`.toLowerCase(),
    });
    expect(repetido).toEqual({ ...primeiro, repetido: true });
    expect(
      await db.select().from(requests).where(eq(requests.originProfileId, r.a.perfil.id)),
    ).toHaveLength(1);
    expect(
      await db.select().from(friends).where(eq(friends.requestId, primeiro.pedidoId)),
    ).toHaveLength(0);
    const [codigo] = await db.select().from(codes).where(eq(codes.id, r.codigo.codigoId));
    expect(codigo?.codeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(codigo?.codeHash).not.toBe(r.codigo.codigo);
    expect(codigo?.consumedAt).not.toBeNull();
    const auditoria = await eventosCom("requestId", primeiro.pedidoId);
    expect(auditoria.filter((e) => e.eventType === "recreio.friend_request_created")).toHaveLength(
      1,
    );
    expect(JSON.stringify(auditoria)).not.toContain(r.codigo.codigo);
    expect(JSON.stringify(auditoria)).not.toContain(codigo?.codeHash);
    const terceiro = await novoJogador({ comAcesso: false });
    await expect(
      pedirAmizade(referenciaSocial(terceiro), { ...r.pedido, pedidoId: crypto.randomUUID() }),
    ).rejects.toMatchObject({ code: "CONTATO" });
  });
  it("trocar código revoga o anterior e não estende prazo de pedido existente", async () => {
    const r = await preparar();
    const outro = await emitirCodigoDeAmigo(referenciaSocial(r.b));
    await expect(pedirAmizade(referenciaSocial(r.a), r.pedido)).rejects.toMatchObject({
      code: "CONTATO",
    });
    const confirmado = await pedirAmizade(referenciaSocial(r.a), {
      codigo: outro.codigo,
      pedidoId: r.pedido.pedidoId,
    });
    const [antes] = await db.select().from(requests).where(eq(requests.id, confirmado.pedidoId));
    const novo = await emitirCodigoDeAmigo(referenciaSocial(r.b));
    await expect(
      pedirAmizade(referenciaSocial(r.a), { codigo: novo.codigo, pedidoId: r.pedido.pedidoId }),
    ).rejects.toMatchObject({ code: "CONFLITO" });
    await expect(
      pedirAmizade(referenciaSocial(r.a), { codigo: novo.codigo, pedidoId: crypto.randomUUID() }),
    ).rejects.toMatchObject({ code: "PEDIDO_PENDENTE" });
    expect(
      (await db.select().from(requests).where(eq(requests.id, confirmado.pedidoId)))[0],
    ).toEqual(antes);
    expect(
      (await db.select().from(codes).where(eq(codes.id, novo.codigoId)))[0]?.consumedAt,
    ).toBeNull();
  });
  it.each(["origem", "destino"] as const)(
    "bloqueio pela %s impede pedido sem consumir código",
    async (lado) => {
      const r = await preparar();
      await db.insert(blocks).values({
        actorProfileId: lado === "origem" ? r.a.perfil.id : r.b.perfil.id,
        targetProfileId: lado === "origem" ? r.b.perfil.id : r.a.perfil.id,
        blocked: true,
      });
      await expect(pedirAmizade(referenciaSocial(r.a), r.pedido)).rejects.toMatchObject({
        code: "CONTATO",
      });
      expect(
        await db.select().from(requests).where(eq(requests.originProfileId, r.a.perfil.id)),
      ).toHaveLength(0);
      expect(
        (await db.select().from(codes).where(eq(codes.id, r.codigo.codigoId)))[0]?.consumedAt,
      ).toBeNull();
    },
  );
  it.each([8, 14])(
    "perfil protegido de %i anos deixa aviso mínimo ao responsável sem criar amizade",
    async (idade) => {
      const r = await familiaSocial(idade);
      const a = await novoJogador({ comAcesso: false });
      const codigo = await emitirCodigoDeAmigo(r.referencia);
      const pedido = await pedirAmizade(referenciaSocial(a), {
        codigo: codigo.codigo,
        pedidoId: crypto.randomUUID(),
      });
      expect(
        await db
          .select()
          .from(notices)
          .where(
            and(
              eq(notices.guardianUserId, r.conta.id),
              eq(notices.profileId, r.perfil.id),
              eq(notices.requestId, pedido.pedidoId),
            ),
          ),
      ).toHaveLength(1);
      expect(
        await db.select().from(friends).where(eq(friends.requestId, pedido.pedidoId)),
      ).toHaveLength(0);
      await desconectarTodosDoMenor(r.autor, r.perfil.id);
      await expect(emitirCodigoDeAmigo(r.referencia)).rejects.toMatchObject({
        codigo: "SESSAO_INVALIDA",
      });
    },
  );
  it("dois pedidos disputam a última cota do remetente", async () => {
    const r = await preparar();
    const c = await novoJogador({ comAcesso: false });
    const codigoC = await emitirCodigoDeAmigo(referenciaSocial(c));
    const contas = await Promise.all(Array.from({ length: 19 }, () => novaConta()));
    const alvos = await db
      .insert(profiles)
      .values(
        contas.map((conta) => ({
          userId: conta.id,
          kind: "adult" as const,
          nickname: "Outro adulto",
          avatar: "padrao",
        })),
      )
      .returning({ id: profiles.id });
    await db.insert(requests).values(
      alvos.map((p) => ({
        originProfileId: r.a.perfil.id,
        targetProfileId: p.id,
        clientKey: crypto.randomUUID(),
        requestHash: "a".repeat(64),
        expiresAt: new Date(Date.now() + 60_000),
      })),
    );
    const resultado = await Promise.allSettled([
      pedirAmizade(referenciaSocial(r.a), r.pedido),
      pedirAmizade(referenciaSocial(r.a), {
        codigo: codigoC.codigo,
        pedidoId: crypto.randomUUID(),
      }),
    ]);
    expect(resultado.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(resultado.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "LIMITE_DE_CONTATOS" },
    });
    expect(
      await db
        .select()
        .from(requests)
        .where(and(eq(requests.originProfileId, r.a.perfil.id), eq(requests.state, "pending"))),
    ).toHaveLength(20);
  });
  it.each(["auditoria", "prazo"] as const)(
    "%s durante confirmação reverte pedido e consumo",
    async (tipo) => {
      const r = await preparar();
      if (tipo === "prazo")
        await db
          .update(codes)
          .set({ expiresAt: new Date(Date.now() + 1000) })
          .where(eq(codes.id, r.codigo.codigoId));
      await db.execute(
        tipo === "auditoria"
          ? sql`create function audit.falhar_pedido_social_teste() returns trigger language plpgsql as $$ begin if new.event_type='recreio.friend_request_created' then raise exception 'audit unavailable'; end if; return new; end $$`
          : sql`create function audit.falhar_pedido_social_teste() returns trigger language plpgsql as $$ begin if new.event_type='recreio.friend_request_created' then perform pg_sleep(1.1); end if; return new; end $$`,
      );
      await db.execute(
        sql`create trigger falhar_pedido_social_teste before insert on audit.events for each row execute function audit.falhar_pedido_social_teste()`,
      );
      try {
        const tentativa = pedirAmizade(referenciaSocial(r.a), r.pedido);
        if (tipo === "auditoria")
          await expect(tentativa).rejects.toBeInstanceOf(AuditPersistenceError);
        else await expect(tentativa).rejects.toMatchObject({ code: "CONTATO" });
        expect(
          await db.select().from(requests).where(eq(requests.originProfileId, r.a.perfil.id)),
        ).toHaveLength(0);
        expect(
          (await db.select().from(codes).where(eq(codes.id, r.codigo.codigoId)))[0]?.consumedAt,
        ).toBeNull();
      } finally {
        await db.execute(sql`drop trigger falhar_pedido_social_teste on audit.events`);
        await db.execute(sql`drop function audit.falhar_pedido_social_teste()`);
      }
    },
  );
});
