import { db, eq } from "@informach/db";
import { recreioGroups as groups, sessions } from "@informach/db/schema";
import { expect, it, vi } from "vitest";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { usarCoberturaPropria } from "@/features/grupo/participacao-service";
import { atualizarCobertura, consultarGrupo } from "@/features/grupo/service";
import { novoJogador } from "./apoio";

vi.mock("@/lib/env", async (original) => {
  const real = await original<typeof import("@/lib/env")>();
  return { ...real, env: { ...real.env, RECREIO_FAMILY_MODE: "off" } };
});

it("desligar famílias conserva leitura e retirada, mas recusa nova cobertura", async () => {
  const p = await novoJogador();
  const [sessao] = await db.select().from(sessions).where(eq(sessions.id, p.login.authSessionId));
  const [grupo] = await db.select().from(groups).where(eq(groups.ownerUserId, p.conta.id));
  if (!sessao || !grupo) throw new Error("Contexto ausente");
  const autor: AutorNativoRecente = {
    ...p.ator,
    login: { authSessionId: sessao.id, criadoEm: sessao.createdAt, expiraEm: sessao.expiresAt },
  };
  const inicial = await consultarGrupo(autor, grupo.id);
  await atualizarCobertura(autor, {
    grupoId: inicial.grupoId,
    perfis: inicial.perfis.map((p) => ({ perfilId: p.perfilId, versao: p.versao, cobrir: false })),
  });
  const retirada = await consultarGrupo(autor, grupo.id);
  expect(retirada.perfis.every((p) => !p.selecionado && !p.efetivo)).toBe(true);
  await expect(
    atualizarCobertura(autor, {
      grupoId: retirada.grupoId,
      perfis: retirada.perfis.map((p) => ({
        perfilId: p.perfilId,
        versao: p.versao,
        cobrir: true,
      })),
    }),
  ).rejects.toMatchObject({ code: "FAMILIA_INDISPONIVEL" });
  expect(await consultarGrupo(autor, grupo.id)).toEqual(retirada);
  await expect(
    usarCoberturaPropria(autor, { versao: retirada.perfis[0]?.versao }),
  ).rejects.toMatchObject({ code: "FAMILIA_INDISPONIVEL" });
  expect(await consultarGrupo(autor, grupo.id)).toEqual(retirada);
});
