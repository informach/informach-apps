import { AuditPersistenceError } from "@informach/auth";
import { db, eq, inArray, sql } from "@informach/db";
import {
  recreioSocialBlocks as blocks,
  recreioFriendCodes as codes,
  recreioFriendConsents as consents,
  recreioFriendships as friends,
  recreioProfiles as profiles,
  recreioFriendRequests as requests,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import {
  LOTE_DE_EXPIRACAO_SOCIAL,
  limparRegistrosSociais,
} from "@/features/social/retencao-repository";
import {
  aceitarAmizade,
  aprovarAmizade,
  emitirCodigoDeAmigo,
  pedirAmizade,
  protegerContato,
  removerAmizade,
} from "@/features/social/service";
import { eventosCom, novoJogador, sinal } from "./apoio";
import { familiaSocial, referenciaSocial as ref } from "./social-apoio";

async function vencidos(quantidade: number) {
  const a = await novoJogador({ comAcesso: false });
  // Linhas suspensas só para o ensaio de armazenamento; não têm autoridade de jogador.
  const alvos = await db
    .insert(profiles)
    .values(
      Array.from({ length: quantidade }, () => ({
        kind: "minor" as const,
        status: "suspended" as const,
        nickname: "Teste",
      })),
    )
    .returning({ id: profiles.id });
  const linhas = await db
    .insert(requests)
    .values(
      alvos.map((alvo) => ({
        originProfileId: a.perfil.id,
        targetProfileId: alvo.id,
        clientKey: crypto.randomUUID(),
        requestHash: "a".repeat(64),
        createdAt: new Date(Date.now() - 60_000),
        expiresAt: new Date(Date.now() - 30_000),
      })),
    )
    .returning();
  return linhas;
}

describe("retenção social delimitada sem apagar autoridade ativa", () => {
  it("vence pedido uma vez sem repetir a auditoria", async () => {
    const [linha] = await vencidos(1);
    if (!linha) throw new Error("Pedido ausente");
    await limparRegistrosSociais();
    await limparRegistrosSociais();
    expect((await db.select().from(requests).where(eq(requests.id, linha.id)))[0]).toMatchObject({
      state: "expired",
    });
    expect(
      (await eventosCom("requestId", linha.id)).filter(
        (e) => e.eventType === "recreio.friend_request_expired",
      ),
    ).toHaveLength(1);
  });
  it("apaga código velho, conserva recibo da amizade ativa e proteção após remoção", async () => {
    const a = await novoJogador({ comAcesso: false });
    const b = await novoJogador({ comAcesso: false });
    const codigo = await emitirCodigoDeAmigo(ref(b));
    const pedido = await pedirAmizade(ref(a), {
      codigo: codigo.codigo,
      pedidoId: crypto.randomUUID(),
    });
    await aceitarAmizade(ref(b), pedido.pedidoId);
    const criado = new Date(Date.now() - 3 * 86_400_000);
    const aceito = new Date(criado.getTime() + 60_000);
    await db
      .update(codes)
      .set({
        createdAt: criado,
        expiresAt: new Date(criado.getTime() + 30 * 60_000),
        consumedAt: aceito,
      })
      .where(eq(codes.id, codigo.codigoId));
    await db
      .update(requests)
      .set({
        createdAt: criado,
        expiresAt: new Date(criado.getTime() + 72 * 60 * 60_000),
        targetAcceptedAt: aceito,
        finishedAt: aceito,
      })
      .where(eq(requests.id, pedido.pedidoId));
    await limparRegistrosSociais();
    expect(await db.select().from(codes).where(eq(codes.id, codigo.codigoId))).toHaveLength(0);
    expect(
      (await db.select().from(requests).where(eq(requests.id, pedido.pedidoId)))[0],
    ).toMatchObject({ state: "accepted", codeId: null });
    expect(
      (await db.select().from(friends).where(eq(friends.requestId, pedido.pedidoId)))[0],
    ).toMatchObject({ state: "active" });
    await protegerContato(ref(a), { perfilId: b.perfil.id, bloqueado: false, silenciado: true });
    await removerAmizade(ref(a), b.perfil.id);
    await db
      .update(friends)
      .set({
        createdAt: new Date(Date.now() - 41 * 86_400_000),
        removedAt: new Date(Date.now() - 40 * 86_400_000),
      })
      .where(eq(friends.requestId, pedido.pedidoId));
    const limpeza = await limparRegistrosSociais();
    expect(limpeza.recibosSociaisApagados).toBeGreaterThanOrEqual(1);
    expect(limpeza.relacoesSociaisApagadas).toBeGreaterThanOrEqual(1);
    expect(await db.select().from(requests).where(eq(requests.id, pedido.pedidoId))).toHaveLength(
      0,
    );
    expect(
      await db.select().from(blocks).where(eq(blocks.actorProfileId, a.perfil.id)),
    ).toMatchObject([{ muted: true }]);
  });
  it("aprovação infantil de amizade ativa não é apagada como recibo antigo", async () => {
    const r = await familiaSocial();
    const a = await novoJogador({ comAcesso: false });
    const codigo = await emitirCodigoDeAmigo(r.referencia);
    const pedido = await pedirAmizade(ref(a), {
      codigo: codigo.codigo,
      pedidoId: crypto.randomUUID(),
    });
    const [perfil] = await db.select().from(profiles).where(eq(profiles.id, r.perfil.id));
    if (!perfil) throw new Error("Perfil ausente");
    await aprovarAmizade(r.autor, {
      pedidoId: pedido.pedidoId,
      perfilId: r.perfil.id,
      versao: perfil.policyVersion,
    });
    await aceitarAmizade(r.referencia, pedido.pedidoId);
    const criado = new Date(Date.now() - 3 * 86_400_000),
      aceito = new Date(criado.getTime() + 60_000);
    await db
      .update(requests)
      .set({
        createdAt: criado,
        expiresAt: new Date(criado.getTime() + 72 * 60 * 60_000),
        targetAcceptedAt: aceito,
        finishedAt: aceito,
      })
      .where(eq(requests.id, pedido.pedidoId));
    await limparRegistrosSociais();
    expect(
      await db.select().from(consents).where(eq(consents.requestId, pedido.pedidoId)),
    ).toHaveLength(1);
    expect(await db.select().from(requests).where(eq(requests.id, pedido.pedidoId))).toHaveLength(
      1,
    );
  });
  it("falha na auditoria de expurgo reverte a exclusão do código", async () => {
    const a = await novoJogador({ comAcesso: false });
    const codigo = await emitirCodigoDeAmigo(ref(a));
    const criado = new Date(Date.now() - 3 * 86_400_000);
    await db
      .update(codes)
      .set({ createdAt: criado, expiresAt: new Date(criado.getTime() + 30 * 60_000) })
      .where(eq(codes.id, codigo.codigoId));
    await db.execute(
      sql`create function audit.falhar_expurgo_social_teste() returns trigger language plpgsql as $$ begin if new.event_type='recreio.social_records_purged' then raise exception 'audit unavailable'; end if; return new; end $$`,
    );
    await db.execute(
      sql`create trigger falhar_expurgo_social_teste before insert on audit.events for each row execute function audit.falhar_expurgo_social_teste()`,
    );
    try {
      await expect(limparRegistrosSociais()).rejects.toBeInstanceOf(AuditPersistenceError);
      expect(await db.select().from(codes).where(eq(codes.id, codigo.codigoId))).toHaveLength(1);
    } finally {
      await db.execute(sql`drop trigger falhar_expurgo_social_teste on audit.events`);
      await db.execute(sql`drop function audit.falhar_expurgo_social_teste()`);
    }
  });
  it("lote limita o trabalho e pula uma linha travada sem perder o restante", async () => {
    while ((await limparRegistrosSociais()).pedidosSociaisVencidos > 0) {
      /* esvazia a fixture isolada */
    }
    const linhas = await vencidos(LOTE_DE_EXPIRACAO_SOCIAL + 1);
    const primeiro = linhas[0];
    if (!primeiro) throw new Error("Pedido ausente");
    const travado = sinal<void>(),
      soltar = sinal<void>();
    const trava = db.transaction(async (tx) => {
      await tx.select().from(requests).where(eq(requests.id, primeiro.id)).for("update");
      travado.concluir();
      await soltar.promessa;
    });
    await travado.promessa;
    try {
      expect((await limparRegistrosSociais()).pedidosSociaisVencidos).toBe(
        LOTE_DE_EXPIRACAO_SOCIAL,
      );
      expect((await db.select().from(requests).where(eq(requests.id, primeiro.id)))[0]?.state).toBe(
        "pending",
      );
    } finally {
      soltar.concluir();
      await trava;
    }
    expect((await limparRegistrosSociais()).pedidosSociaisVencidos).toBe(1);
    expect(
      await db
        .select()
        .from(requests)
        .where(
          inArray(
            requests.id,
            linhas.map((p) => p.id),
          ),
        ),
    ).toHaveLength(linhas.length);
  });
  it("auditoria indisponível reverte o lote vencido", async () => {
    const [linha] = await vencidos(1);
    if (!linha) throw new Error("Pedido ausente");
    await db.execute(
      sql`create function audit.falhar_expiracao_social_teste() returns trigger language plpgsql as $$ begin if new.event_type='recreio.friend_request_expired' then raise exception 'audit unavailable'; end if; return new; end $$`,
    );
    await db.execute(
      sql`create trigger falhar_expiracao_social_teste before insert on audit.events for each row execute function audit.falhar_expiracao_social_teste()`,
    );
    try {
      await expect(limparRegistrosSociais()).rejects.toBeInstanceOf(AuditPersistenceError);
      expect((await db.select().from(requests).where(eq(requests.id, linha.id)))[0]?.state).toBe(
        "pending",
      );
    } finally {
      await db.execute(sql`drop trigger falhar_expiracao_social_teste on audit.events`);
      await db.execute(sql`drop function audit.falhar_expiracao_social_teste()`);
    }
  });
});
