import { randomBytes, randomUUID } from "node:crypto";
import { and, db, eq, inArray, sql } from "@informach/db";
import {
  recreioSpaceInvites as invites,
  recreioSpaceMembers as members,
} from "@informach/db/schema";
import { ConviteCriadoSchema } from "@informach/recreio/contrato";
import { beforeEach, describe, expect, it } from "vitest";
import {
  apagarConvitesAntigos,
  LOTE_DE_CONVITES_ANTIGOS,
  SQL_LIMPAR_CONVITES_ANTIGOS,
} from "@/features/manutencao/repository";
import { aceitarConvite, criarConvite } from "@/features/mundos/service";
import { env } from "@/lib/env";
import { novoJogador, sinal } from "./apoio";
import { mundoDe } from "./jogo-apoio";
import { despachar, ORIGEM, pedir } from "./rotas";

function usaFaixaDoIndice(valor: unknown): boolean {
  if (Array.isArray(valor)) return valor.some(usaFaixaDoIndice);
  if (!valor || typeof valor !== "object") return false;
  if (
    "Index Name" in valor &&
    valor["Index Name"] === "recreio_space_invites_unused_expires" &&
    "Index Cond" in valor &&
    typeof valor["Index Cond"] === "string" &&
    valor["Index Cond"].includes("expires_at")
  )
    return true;
  return Object.values(valor).some(usaFaixaDoIndice);
}

async function contexto() {
  const pessoa = await novoJogador();
  const mundoId = await mundoDe(pessoa);
  const [membro] = await db.select().from(members).where(eq(members.spaceId, mundoId));
  if (!membro) throw new Error("Responsável de prova ausente");
  return { pessoa, mundoId, membro };
}

async function convites(quantidade: number) {
  const c = await contexto();
  const estados = ["pending_approval", "sent", "expired", "revoked"] as const;
  const inicio = Date.now() - 3 * 86_400_000;
  const linhas = Array.from({ length: quantidade }, (_, n) => ({
    id: randomUUID(),
    spaceId: c.mundoId,
    invitedByMemberId: c.membro.id,
    form: "member" as const,
    codeHash: randomBytes(32).toString("hex"),
    state: estados[n % estados.length] ?? "sent",
    expiresAt: new Date(inicio + n),
    createdAt: new Date(inicio - 86_400_000),
  }));
  await db.insert(invites).values([...linhas].reverse());
  return { ...c, linhas };
}

describe("retenção limitada dos convites sem aceite", () => {
  beforeEach(async () => {
    // Exclusivamente o banco descartável obrigatório: separar sobras de outras jornadas.
    await db.execute(sql`delete from recreio.space_invites
      where state <> 'accepted' and expires_at < statement_timestamp() - interval '1 day'`);
  });

  it("limita e ordena o lote, conserva vencidos recentes e credenciais válidas", async () => {
    const { mundoId, linhas } = await convites(LOTE_DE_CONVITES_ANTIGOS + 3);
    const base = linhas[0];
    if (!base) throw new Error("Convite de prova ausente");
    const recentes = [-23 * 3_600_000, 3_600_000].map((prazo) => ({
      ...base,
      id: randomUUID(),
      codeHash: randomBytes(32).toString("hex"),
      state: "sent" as const,
      expiresAt: new Date(Date.now() + prazo),
    }));
    await db.insert(invites).values(recentes);
    expect(await apagarConvitesAntigos()).toBe(500);
    const restantes = await db.select().from(invites).where(eq(invites.spaceId, mundoId));
    expect(restantes.map((r) => r.id).sort()).toEqual(
      [...linhas.slice(-3), ...recentes].map((r) => r.id).sort(),
    );
    expect(await apagarConvitesAntigos()).toBe(3);
    expect(await apagarConvitesAntigos()).toBe(0);
  });

  it("conserva integralmente convite aceito, participação e membro", async () => {
    const { pessoa, mundoId } = await contexto();
    const convidado = await novoJogador();
    const { codigo } = ConviteCriadoSchema.parse(
      await criarConvite({ perfilId: pessoa.perfil.id, jogo: null }, mundoId, {
        forma: "member",
        participacao: "familia:origem",
      }),
    );
    await aceitarConvite({ perfilId: convidado.perfil.id }, { codigo });
    await db
      .update(invites)
      .set({
        expiresAt: new Date(Date.now() - 3 * 86_400_000),
        createdAt: new Date(Date.now() - 4 * 86_400_000),
        acceptedAt: new Date(Date.now() - 4 * 86_400_000 + 60_000),
      })
      .where(eq(invites.spaceId, mundoId));
    const antes = await db.select().from(invites).where(eq(invites.spaceId, mundoId));
    const membrosAntes = await db.select().from(members).where(eq(members.spaceId, mundoId));
    expect(await apagarConvitesAntigos()).toBe(0);
    expect(await db.select().from(invites).where(eq(invites.spaceId, mundoId))).toEqual(antes);
    expect(await db.select().from(members).where(eq(members.spaceId, mundoId))).toEqual(
      membrosAntes,
    );
  });

  it("o código vencido continua recusado depois da remoção", async () => {
    const { pessoa, mundoId } = await contexto();
    const convidado = await novoJogador();
    const { codigo } = ConviteCriadoSchema.parse(
      await criarConvite({ perfilId: pessoa.perfil.id, jogo: null }, mundoId, { forma: "member" }),
    );
    await db
      .update(invites)
      .set({ expiresAt: new Date(Date.now() - 25 * 3_600_000) })
      .where(eq(invites.spaceId, mundoId));
    const aceitar = () => aceitarConvite({ perfilId: convidado.perfil.id }, { codigo });
    await expect(aceitar()).rejects.toMatchObject({ codigo: "CONVITE_INVALIDO" });
    expect(await apagarConvitesAntigos()).toBe(1);
    await expect(aceitar()).rejects.toMatchObject({ codigo: "CONVITE_INVALIDO" });
    expect(
      await db
        .select()
        .from(members)
        .where(and(eq(members.spaceId, mundoId), eq(members.profileId, convidado.perfil.id))),
    ).toHaveLength(0);
  });

  it("execuções concorrentes pulam linhas travadas e continuam após sua liberação", async () => {
    const { linhas } = await convites(750);
    const protegidos = linhas.slice(0, 250).map((r) => r.id);
    const travou = sinal<void>(),
      soltar = sinal<void>();
    const trava = db.transaction(async (tx) => {
      await tx.select().from(invites).where(inArray(invites.id, protegidos)).for("update");
      travou.concluir();
      await soltar.promessa;
    });
    try {
      await Promise.race([travou.promessa, trava]);
      const contagens = await Promise.all([apagarConvitesAntigos(), apagarConvitesAntigos()]);
      expect(contagens.every((n) => n >= 0 && n <= 500)).toBe(true);
      expect(contagens.reduce((a, b) => a + b, 0)).toBe(500);
      expect(await db.select().from(invites).where(inArray(invites.id, protegidos))).toHaveLength(
        250,
      );
    } finally {
      soltar.concluir();
      await trava;
    }
    expect(await apagarConvitesAntigos()).toBe(250);
    expect(await apagarConvitesAntigos()).toBe(0);
  });

  it("nega chamada sem autorização e comunica falha real de exclusão com retomada", async () => {
    const { mundoId } = await convites(2);
    expect((await despachar(`${ORIGEM}/api/jobs/manutencao`, { method: "POST" })).status).toBe(401);
    expect(await db.select().from(invites).where(eq(invites.spaceId, mundoId))).toHaveLength(2);
    await db.execute(sql`create function recreio.recusar_limpeza_convite_teste()
      returns trigger language plpgsql as $$ begin raise exception 'exclusão indisponível (teste)'; end $$`);
    await db.execute(sql`create trigger recusar_limpeza_convite_teste before delete on recreio.space_invites
      for each row execute function recreio.recusar_limpeza_convite_teste()`);
    try {
      expect(
        await pedir("POST", "/api/jobs/manutencao", {
          headers: { authorization: `Bearer ${env.CRON_SECRET}` },
        }),
      ).toMatchObject({ status: 503, corpo: { status: "failed", incident: expect.any(String) } });
      expect(await db.select().from(invites).where(eq(invites.spaceId, mundoId))).toHaveLength(2);
    } finally {
      await db.execute(sql`drop trigger recusar_limpeza_convite_teste on recreio.space_invites`);
      await db.execute(sql`drop function recreio.recusar_limpeza_convite_teste()`);
    }
    expect(
      await pedir("POST", "/api/jobs/manutencao", {
        headers: { authorization: `Bearer ${env.CRON_SECRET}` },
      }),
    ).toMatchObject({ status: 200, corpo: { convitesApagados: 2 } });
    expect(await apagarConvitesAntigos()).toBe(0);
  });

  it("a consulta real usa faixa do índice em volume sintético sem executar o DELETE no EXPLAIN", async () => {
    const { mundoId, membro } = await contexto();
    await db.execute(sql`insert into recreio.space_invites
      (id, space_id, invited_by_member_id, form, code_hash, state, expires_at)
      select gen_random_uuid(), ${mundoId}::uuid, ${membro.id}::uuid, 'member',
        md5(${mundoId} || n::text) || md5(n::text || ${mundoId}), 'sent',
        statement_timestamp() + interval '7 days'
      from generate_series(1, 20000) n`);
    await db.insert(invites).values({
      spaceId: mundoId,
      invitedByMemberId: membro.id,
      form: "member",
      codeHash: randomBytes(32).toString("hex"),
      state: "sent",
      expiresAt: new Date(Date.now() - 3 * 86_400_000),
    });
    await db.execute(sql`analyze recreio.space_invites`);
    const plano = await db.execute(sql`explain (format json) ${SQL_LIMPAR_CONVITES_ANTIGOS}`);
    expect(usaFaixaDoIndice(plano)).toBe(true);
    const contar = async () => {
      const [r] = await db
        .select({ total: sql<number>`count(*)::integer` })
        .from(invites)
        .where(eq(invites.spaceId, mundoId));
      return r?.total;
    };
    expect(await contar()).toBe(20001);
    expect(await apagarConvitesAntigos()).toBe(1);
    expect(await contar()).toBe(20000);
  });
});
