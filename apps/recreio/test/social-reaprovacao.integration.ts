import { AuditPersistenceError } from "@informach/auth";
import { db, eq, sql } from "@informach/db";
import {
  recreioFriendConsents as consents,
  recreioFriendships as friends,
  recreioProfiles as profiles,
  recreioMinorProtection as protection,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import { desconectarTodosDoMenor } from "@/features/protecao/service";
import {
  aceitarAmizade,
  aprovarAmizade,
  emitirCodigoDeAmigo,
  pedirAmizade,
  removerAmizade,
  renovarAprovacaoDeAmizade,
} from "@/features/social/service";
import { eventosCom, novoJogador } from "./apoio";
import { familiaSocial, referenciaSocial as ref } from "./social-apoio";

async function preparar() {
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
  const [antes] = await db.select().from(consents).where(eq(consents.requestId, pedido.pedidoId));
  await desconectarTodosDoMenor(r.autor, r.perfil.id);
  const [atual] = await db.select().from(profiles).where(eq(profiles.id, r.perfil.id));
  if (!atual || !antes) throw new Error("Aprovação ausente");
  return {
    ...r,
    a,
    antes,
    entrada: {
      pedidoId: pedido.pedidoId,
      perfilId: r.perfil.id,
      versao: atual.policyVersion,
      revisaoDaAmizade: 1,
      confirmoAmizade: true as const,
    },
  };
}

describe("reaprovação explícita após revogação de autoridade", () => {
  it("renova apenas a aprovação atual, sem reabrir pedido nem duplicar auditoria", async () => {
    const r = await preparar();
    // A repetição da aprovação antiga não tem efeito de nova autorização.
    await aprovarAmizade(r.autor, {
      pedidoId: r.entrada.pedidoId,
      perfilId: r.entrada.perfilId,
      versao: r.entrada.versao,
    });
    expect(
      (await db.select().from(consents).where(eq(consents.requestId, r.entrada.pedidoId)))[0]
        ?.accessGeneration,
    ).toBe(r.antes.accessGeneration);
    await renovarAprovacaoDeAmizade(r.autor, r.entrada);
    await renovarAprovacaoDeAmizade(r.autor, r.entrada);
    const [atual] = await db
      .select()
      .from(consents)
      .where(eq(consents.requestId, r.entrada.pedidoId));
    const [protecao] = await db
      .select()
      .from(protection)
      .where(eq(protection.profileId, r.perfil.id));
    expect(atual?.accessGeneration).toBe(protecao?.accessGeneration);
    expect(atual?.accessGeneration).not.toBe(r.antes.accessGeneration);
    expect(
      (await db.select().from(friends).where(eq(friends.requestId, r.entrada.pedidoId)))[0],
    ).toMatchObject({ state: "active", revision: 1 });
    const eventos = (await eventosCom("requestId", r.entrada.pedidoId)).filter(
      (e) => e.eventType === "recreio.friend_approval_renewed",
    );
    expect(eventos).toHaveLength(1);
    expect(eventos[0]?.actorId).toBe(r.conta.id);
  });
  it("remoção da amizade impede reaprovar pelo recibo antigo", async () => {
    const r = await preparar();
    await removerAmizade(ref(r.a), r.perfil.id);
    await expect(renovarAprovacaoDeAmizade(r.autor, r.entrada)).rejects.toMatchObject({
      code: "CONFLITO",
    });
    expect(
      (await db.select().from(consents).where(eq(consents.requestId, r.entrada.pedidoId)))[0]
        ?.accessGeneration,
    ).toBe(r.antes.accessGeneration);
  });
  it("responsável de outro perfil e revisão antiga não concedem aprovação", async () => {
    const r = await preparar(),
      outro = await familiaSocial();
    await expect(renovarAprovacaoDeAmizade(outro.autor, r.entrada)).rejects.toMatchObject({
      code: "PEDIDO",
    });
    await expect(
      renovarAprovacaoDeAmizade(r.autor, { ...r.entrada, versao: r.entrada.versao - 1 }),
    ).rejects.toMatchObject({ code: "CONFLITO" });
    await expect(
      renovarAprovacaoDeAmizade(r.autor, { ...r.entrada, revisaoDaAmizade: 2 }),
    ).rejects.toMatchObject({ code: "CONFLITO" });
  });
  it("auditoria indisponível não confirma a nova geração", async () => {
    const r = await preparar();
    await db.execute(
      sql`create function audit.falhar_reaprovacao_teste() returns trigger language plpgsql as $$ begin if new.event_type='recreio.friend_approval_renewed' then raise exception 'audit unavailable'; end if; return new; end $$`,
    );
    await db.execute(
      sql`create trigger falhar_reaprovacao_teste before insert on audit.events for each row execute function audit.falhar_reaprovacao_teste()`,
    );
    try {
      await expect(renovarAprovacaoDeAmizade(r.autor, r.entrada)).rejects.toBeInstanceOf(
        AuditPersistenceError,
      );
      expect(
        (await db.select().from(consents).where(eq(consents.requestId, r.entrada.pedidoId)))[0]
          ?.accessGeneration,
      ).toBe(r.antes.accessGeneration);
    } finally {
      await db.execute(sql`drop trigger falhar_reaprovacao_teste on audit.events`);
      await db.execute(sql`drop function audit.falhar_reaprovacao_teste()`);
    }
  });
});
