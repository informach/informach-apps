import { AuditPersistenceError } from "@informach/auth";
import { and, db, eq, sql } from "@informach/db";
import { events, recreioGroups as groups, recreioProfiles as profiles } from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import { criarPerfilProprio } from "@/features/perfis/service";
import { atorDaConta, novaConta } from "./apoio";

describe("auditoria atômica da criação de perfil", () => {
  it("concorrência e repetição deixam exatamente um evento junto do perfil", async () => {
    const conta = await novaConta();
    const resultados = await Promise.all(
      Array.from({ length: 8 }, async () =>
        criarPerfilProprio(await atorDaConta(conta), { apelido: "Nome privado", avatar: "sol" }),
      ),
    );
    const registros = await db
      .select()
      .from(events)
      .where(and(eq(events.actorId, conta.id), eq(events.eventType, "recreio.profile_created")));
    expect(resultados.filter((resultado) => resultado.criado)).toHaveLength(1);
    expect(registros).toHaveLength(1);
    expect(registros[0]?.payload).toEqual({
      app: "recreio",
      profileId: resultados[0]?.perfil.id,
      kind: "adult",
    });
    expect(JSON.stringify(registros)).not.toContain("Nome privado");
    expect(JSON.stringify(registros)).not.toContain(conta.email);
  });

  it("falha de auditoria desfaz perfil e grupo; uma nova tentativa pode concluir", async () => {
    const conta = await novaConta();
    await db.execute(sql`
      create function audit.recusar_perfil_em_teste() returns trigger language plpgsql as $$
      begin
        if new.event_type = 'recreio.profile_created' then
          raise exception 'auditoria indisponível (teste)';
        end if;
        return new;
      end $$`);
    await db.execute(sql`
      create trigger recusar_perfil_em_teste before insert on audit.events
      for each row execute function audit.recusar_perfil_em_teste()`);
    try {
      await expect(
        criarPerfilProprio(await atorDaConta(conta), { apelido: "Lia", avatar: "sol" }),
      ).rejects.toBeInstanceOf(AuditPersistenceError);
      expect(await db.select().from(profiles).where(eq(profiles.userId, conta.id))).toEqual([]);
      expect(await db.select().from(groups).where(eq(groups.ownerUserId, conta.id))).toEqual([]);
    } finally {
      await db.execute(sql`drop trigger recusar_perfil_em_teste on audit.events`);
      await db.execute(sql`drop function audit.recusar_perfil_em_teste()`);
    }
    expect(
      await criarPerfilProprio(await atorDaConta(conta), { apelido: "Lia", avatar: "sol" }),
    ).toMatchObject({
      criado: true,
    });
  });
});
