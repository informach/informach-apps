import { randomUUID } from "node:crypto";
import { AuditPersistenceError } from "@informach/auth";
import { db, eq, sql } from "@informach/db";
import {
  recreioProfileRestrictions,
  recreioProfiles,
  recreioRestrictionReviews,
  recreioSafetyReports,
  users,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import { lerFilaDeSeguranca } from "./repository";
import { consultarFilaDeSeguranca } from "./service";

async function preparar() {
  const contaId = randomUUID(),
    outroId = randomUUID();
  for (const id of [contaId, outroId])
    await db
      .insert(users)
      .values({ id, name: "NOME_PRIVADO", email: `${id}@example.test`, emailVerified: true });
  const [origem] = await db
    .insert(recreioProfiles)
    .values({ userId: contaId, kind: "adult", nickname: "ORIGEM_PRIVADA" })
    .returning();
  const [alvo] = await db
    .insert(recreioProfiles)
    .values({
      userId: outroId,
      kind: "adult",
      nickname: "ALVO_PRIVADO",
      status: "suspended",
      policyVersion: 7,
    })
    .returning();
  if (!origem || !alvo) throw new Error("Perfis ausentes");
  const agora = new Date();
  const [caso] = await db
    .insert(recreioSafetyReports)
    .values({
      reporterProfileId: origem.id,
      targetProfileId: alvo.id,
      actorUserId: contaId,
      actorKind: "jogador",
      clientKey: randomUUID(),
      requestHash: "a".repeat(64),
      category: "ameaca",
      priority: true,
      evidenceKind: "protecao",
      createdAt: agora,
      updatedAt: agora,
      expiresAt: new Date(agora.getTime() + 180 * 86_400_000),
    })
    .returning();
  if (!caso) throw new Error("Caso ausente");
  return { contaId, origem, alvo, caso, agora };
}
describe("fila do Recreio na conexão somente de leitura", () => {
  it("projeta referências e categorias sem nomes, contas, hashes ou autoria da denúncia", async () => {
    const r = await preparar();
    const fila = await lerFilaDeSeguranca(r.caso.id);
    expect(fila.denuncias).toHaveLength(1);
    expect(fila.denuncias[0]).toMatchObject({
      protocolo: r.caso.id,
      categoria: "ameaca",
      prioridade: true,
      versaoDoPerfil: 7,
      estadoDoPerfil: "suspended",
    });
    const texto = JSON.stringify(fila);
    for (const segredo of [
      "ORIGEM_PRIVADA",
      "ALVO_PRIVADO",
      "NOME_PRIVADO",
      "@example.test",
      r.contaId,
      r.origem.id,
      r.caso.clientKey,
      r.caso.requestHash,
    ])
      expect(texto).not.toContain(segredo);
    expect(Object.keys(fila.denuncias[0] ?? {})).not.toContain("actorUserId");
  });
  it("recurso próprio não incorpora denunciante e some da leitura após o prazo", async () => {
    const r = await preparar();
    await db.insert(recreioProfileRestrictions).values({
      profileId: r.alvo.id,
      revision: 7,
      state: "suspended",
      reason: "medida_preventiva",
      sourceReportId: r.caso.id,
      createdAt: r.agora,
      updatedAt: r.agora,
    });
    const [recurso] = await db
      .insert(recreioRestrictionReviews)
      .values({
        profileId: r.alvo.id,
        restrictionRevision: 7,
        clientKey: randomUUID(),
        requestHash: "b".repeat(64),
        actorUserId: r.alvo.userId,
        actorKind: "titular",
        createdAt: r.agora,
        expiresAt: new Date(r.agora.getTime() + 180 * 86_400_000),
      })
      .returning();
    if (!recurso) throw new Error("Recurso ausente");
    const antes = await lerFilaDeSeguranca(recurso.id);
    expect(antes.recursos).toHaveLength(1);
    expect(JSON.stringify(antes)).not.toMatch(
      /PRIVAD|actorUserId|sourceReportId|requestHash|clientKey/,
    );
    expect(JSON.stringify(antes)).not.toContain(r.caso.id);
    const criado = new Date(Date.now() - 181 * 86_400_000);
    await db
      .update(recreioRestrictionReviews)
      .set({ createdAt: criado, expiresAt: new Date(criado.getTime() + 180 * 86_400_000) })
      .where(eq(recreioRestrictionReviews.id, recurso.id));
    expect((await lerFilaDeSeguranca(recurso.id)).recursos).toHaveLength(0);
  });
  it("sem auditoria a consulta não devolve a fila", async () => {
    const r = await preparar();
    await db.execute(
      sql`create function audit.falhar_fila_recreio_teste() returns trigger language plpgsql as $$ begin if new.event_type='admin.recreio_safety_viewed' then raise exception 'audit unavailable'; end if; return new; end $$`,
    );
    await db.execute(
      sql`create trigger falhar_fila_recreio_teste before insert on audit.events for each row execute function audit.falhar_fila_recreio_teste()`,
    );
    try {
      await expect(
        consultarFilaDeSeguranca(
          { id: r.contaId, role: "admin", name: "Equipe", email: "equipe@example.test" },
          r.caso.id,
        ),
      ).rejects.toBeInstanceOf(AuditPersistenceError);
    } finally {
      await db.execute(sql`drop trigger falhar_fila_recreio_teste on audit.events`);
      await db.execute(sql`drop function audit.falhar_fila_recreio_teste()`);
    }
  });
});
