import { db, eq } from "@informach/db";
import {
  recreioGroups as groups,
  recreioGroupInvites as invites,
  sessions,
} from "@informach/db/schema";
import { expect, it, vi } from "vitest";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { VERSAO_DA_DECLARACAO_ADULTA } from "@/features/grupo/convites-regras";
import {
  convidarAdulto,
  convitesEnviados,
  convitesRecebidos,
  recusarConviteDeAdulto,
  revogarConviteDeAdulto,
} from "@/features/grupo/convites-service";
import { resolverAtor } from "@/features/sessao/service";
import { loginReal, novaConta } from "./apoio";

vi.mock("@/lib/env", async (original) => {
  const real = await original<typeof import("@/lib/env")>();
  return { ...real, env: { ...real.env, RECREIO_FAMILY_MODE: "off" } };
});

async function titular() {
  const conta = await novaConta();
  const login = await loginReal(conta);
  const contexto = await resolverAtor(login);
  const [sessao] = await db.select().from(sessions).where(eq(sessions.id, login.authSessionId));
  if (!contexto || !sessao) throw new Error("Login ausente");
  const autor: AutorNativoRecente = {
    ...contexto.ator,
    login: { authSessionId: sessao.id, criadoEm: sessao.createdAt, expiraEm: sessao.expiresAt },
  };
  return { conta, autor };
}

it("flag desligada conserva leitura, recusa e revogação das pendências existentes", async () => {
  const a = await titular();
  const b = await titular();
  const [grupo] = await db.insert(groups).values({ ownerUserId: a.conta.id }).returning();
  if (!grupo) throw new Error("Grupo ausente");
  const agora = new Date();
  const anterior = {
    groupId: grupo.id,
    inviterUserId: a.conta.id,
    inviterDeclarationVersion: VERSAO_DA_DECLARACAO_ADULTA,
    recipientEmail: b.conta.email,
    recipientUserId: b.conta.id,
    createdAt: agora,
    expiresAt: new Date(agora.getTime() + 72 * 60 * 60_000),
  };
  const [convite] = await db.insert(invites).values(anterior).returning();
  if (!convite) throw new Error("Convite ausente");
  expect(await convitesEnviados(a.autor)).toHaveLength(1);
  expect(await convitesRecebidos(b.autor)).toHaveLength(1);
  await expect(
    convidarAdulto(a.autor, {
      email: `${crypto.randomUUID()}@example.test`,
      identificacao: "Ana",
      declaroMaioridade: true,
      versaoDaDeclaracao: VERSAO_DA_DECLARACAO_ADULTA,
    }),
  ).rejects.toMatchObject({ code: "FAMILIA_INDISPONIVEL" });
  expect(await recusarConviteDeAdulto(b.autor, convite.id)).toEqual({ alterado: true });
  expect(await convitesRecebidos(b.autor)).toEqual([]);
  const [segundo] = await db.insert(invites).values(anterior).returning();
  if (!segundo) throw new Error("Convite ausente");
  expect(await revogarConviteDeAdulto(a.autor, segundo.id)).toEqual({ alterado: true });
  expect(await convitesEnviados(a.autor)).toEqual([]);
});
