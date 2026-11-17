import { AuditPersistenceError } from "@informach/auth";
import { and, db, eq, sql } from "@informach/db";
import {
  recreioDeviceSessions as devices,
  events,
  recreioProfiles as profiles,
  sessions,
  users,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { editarPerfilProprio, perfisSelecionaveis } from "@/features/perfis/service";
import { novoJogador } from "./apoio";

const anterior = { apelido: "Lia", avatar: "padrao" };
const novo = { apelido: "Lia do Sol", avatar: "sol" };

async function auditoria(contaId: string) {
  return db
    .select()
    .from(events)
    .where(and(eq(events.actorId, contaId), eq(events.eventType, "recreio.profile_updated")));
}

describe("edição do perfil próprio", () => {
  it.each(["login removido", "conta suspensa", "contexto infantil"])(
    "a transação recusa %s mesmo após resolver o ator",
    async (caso) => {
      const pessoa = await novoJogador({ comAcesso: false });
      if (caso === "conta suspensa")
        await db.update(users).set({ banned: true }).where(eq(users.id, pessoa.conta.id));
      else if (caso === "contexto infantil")
        await db
          .update(devices)
          .set({ minorContextGeneration: crypto.randomUUID() })
          .where(eq(devices.id, pessoa.ator.sessaoDeAparelhoId));
      else {
        const [aparelho] = await db
          .select()
          .from(devices)
          .where(eq(devices.id, pessoa.ator.sessaoDeAparelhoId));
        if (!aparelho?.authSessionId) throw new Error("Login ausente");
        await db.delete(sessions).where(eq(sessions.id, aparelho.authSessionId));
      }
      await expect(editarPerfilProprio(pessoa.ator, { anterior, novo })).rejects.toMatchObject({
        code: "AUTH",
      });
      expect(await perfisSelecionaveis(pessoa.conta.id)).toEqual([pessoa.perfil]);
      expect(await auditoria(pessoa.conta.id)).toEqual([]);
    },
  );
  it("normaliza, preserva identidade/política e audita só os nomes dos campos uma vez", async () => {
    const pessoa = await novoJogador({ comAcesso: false });
    const dados = { anterior, novo: { ...novo, apelido: "  Lia  do Sol  " } };
    const resultados = await Promise.all(
      Array.from({ length: 8 }, () => editarPerfilProprio(pessoa.ator, dados)),
    );
    expect(resultados.every((p) => p.apelido === novo.apelido && p.avatar === novo.avatar)).toBe(
      true,
    );
    expect(resultados[0]).toEqual({ ...pessoa.perfil, apelido: novo.apelido, avatar: novo.avatar });
    const registros = await auditoria(pessoa.conta.id);
    expect(registros).toHaveLength(1);
    expect(registros[0]?.payload).toEqual({
      app: "recreio",
      profileId: pessoa.perfil.id,
      fields: ["nickname", "avatar"],
    });
    expect(JSON.stringify(registros)).not.toContain(novo.apelido);
    expect(JSON.stringify(registros)).not.toContain(pessoa.conta.email);
  });

  it("recusa identificadores, avatar livre e apelido inválido antes de gravar", async () => {
    const pessoa = await novoJogador({ comAcesso: false });
    for (const dados of [
      { anterior, novo, profileId: pessoa.perfil.id },
      { anterior, novo: { ...novo, avatar: "livre" } },
      { anterior, novo: { ...novo, apelido: "L" } },
    ])
      await expect(editarPerfilProprio(pessoa.ator, dados)).rejects.toBeInstanceOf(ZodError);
    expect(await perfisSelecionaveis(pessoa.conta.id)).toEqual([pessoa.perfil]);
    expect(await auditoria(pessoa.conta.id)).toEqual([]);
  });

  it("não usa sessão de outra conta nem muda o perfil dela", async () => {
    const a = await novoJogador({ comAcesso: false });
    const b = await novoJogador({ comAcesso: false });
    await expect(
      editarPerfilProprio(
        {
          contaId: a.conta.id,
          sessaoDeAparelhoId: b.ator.sessaoDeAparelhoId,
        },
        { anterior, novo },
      ),
    ).rejects.toMatchObject({ code: "AUTH" });
    expect(await perfisSelecionaveis(a.conta.id)).toEqual([a.perfil]);
    expect(await perfisSelecionaveis(b.conta.id)).toEqual([b.perfil]);
    expect(await auditoria(a.conta.id)).toEqual([]);
  });

  it.each(["revogada", "vencida", "sem seleção", "suspenso"])(
    "relê a autorização depois de resolver o ator: %s",
    async (caso) => {
      const pessoa = await novoJogador({ comAcesso: false });
      if (caso === "suspenso") {
        await db
          .update(profiles)
          .set({ status: "suspended" })
          .where(eq(profiles.id, pessoa.perfil.id));
      } else {
        await db
          .update(devices)
          .set(
            caso === "revogada"
              ? { revokedAt: new Date() }
              : caso === "vencida"
                ? { expiresAt: new Date(Date.now() - 1000) }
                : { activeProfileId: null },
          )
          .where(eq(devices.id, pessoa.ator.sessaoDeAparelhoId));
      }
      await expect(editarPerfilProprio(pessoa.ator, { anterior, novo })).rejects.toMatchObject({
        code: caso === "suspenso" ? "PERFIL" : "AUTH",
      });
      const [atual] = await perfisSelecionaveis(pessoa.conta.id);
      expect(atual).toMatchObject({ apelido: anterior.apelido, avatar: anterior.avatar });
      expect(await auditoria(pessoa.conta.id)).toEqual([]);
    },
  );

  it("duas abas com a mesma base não sobrescrevem silenciosamente uma à outra", async () => {
    const pessoa = await novoJogador({ comAcesso: false });
    const pedidos = [novo, { apelido: "Lia da Lua", avatar: "lua" }];
    const resultados = await Promise.allSettled(
      pedidos.map((dados) => editarPerfilProprio(pessoa.ator, { anterior, novo: dados })),
    );
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const recusa = resultados.find((r) => r.status === "rejected");
    expect(recusa?.status === "rejected" && recusa.reason).toMatchObject({ code: "CONFLITO" });
    const vencedor = resultados.findIndex((r) => r.status === "fulfilled");
    const [perfil] = await perfisSelecionaveis(pessoa.conta.id);
    expect(perfil).toMatchObject({
      apelido: pedidos[vencedor]?.apelido,
      avatar: pedidos[vencedor]?.avatar,
    });
    expect(await auditoria(pessoa.conta.id)).toHaveLength(1);
  });

  it("falha real da auditoria reverte dados; repetição conclui só uma vez", async () => {
    const pessoa = await novoJogador({ comAcesso: false });
    await db.execute(sql`create function audit.recusar_edicao_em_teste() returns trigger language plpgsql as $$
      begin if new.event_type = 'recreio.profile_updated' then raise exception 'auditoria indisponível (teste)'; end if; return new; end $$`);
    await db.execute(
      sql`create trigger recusar_edicao_em_teste before insert on audit.events for each row execute function audit.recusar_edicao_em_teste()`,
    );
    try {
      await expect(editarPerfilProprio(pessoa.ator, { anterior, novo })).rejects.toBeInstanceOf(
        AuditPersistenceError,
      );
      expect(await perfisSelecionaveis(pessoa.conta.id)).toEqual([pessoa.perfil]);
      expect(await auditoria(pessoa.conta.id)).toEqual([]);
    } finally {
      await db.execute(sql`drop trigger recusar_edicao_em_teste on audit.events`);
      await db.execute(sql`drop function audit.recusar_edicao_em_teste()`);
    }
    const resultado = await editarPerfilProprio(pessoa.ator, { anterior, novo });
    expect(await editarPerfilProprio(pessoa.ator, { anterior, novo })).toEqual(resultado);
    expect(await auditoria(pessoa.conta.id)).toHaveLength(1);
  });
});
