import { db, eq } from "@informach/db";
import { recreioGroups as groups, recreioProfiles as profiles, users } from "@informach/db/schema";
import { expect, it } from "vitest";
import { codigoDoBanco, novaConta, novoJogador, RESTRICAO } from "./apoio";

it("exclusão global do titular sem jogador não derruba a cobertura de outro adulto", async () => {
  const titular = await novaConta();
  const membro = await novoJogador();
  const [grupo] = await db.insert(groups).values({ ownerUserId: titular.id }).returning();
  if (!grupo) throw new Error("Grupo ausente");
  await db.update(profiles).set({ groupId: grupo.id }).where(eq(profiles.id, membro.perfil.id));
  const antes = await db.select().from(profiles).where(eq(profiles.id, membro.perfil.id));
  expect(RESTRICAO).toContain(
    await codigoDoBanco(db.delete(users).where(eq(users.id, titular.id))),
  );
  expect(await db.select().from(groups).where(eq(groups.id, grupo.id))).toEqual([grupo]);
  expect(await db.select().from(profiles).where(eq(profiles.id, membro.perfil.id))).toEqual(antes);
  expect(await db.select().from(users).where(eq(users.id, titular.id))).toHaveLength(1);
});

it("perfil sem grupo exige resolução explícita antes de apagar a conta", async () => {
  const titular = await novaConta();
  const [perfil] = await db
    .insert(profiles)
    .values({ userId: titular.id, kind: "adult", nickname: "Lua", avatar: "padrao", groupId: null })
    .returning();
  if (!perfil) throw new Error("Perfil ausente");
  expect(RESTRICAO).toContain(
    await codigoDoBanco(db.delete(users).where(eq(users.id, titular.id))),
  );
  expect(await db.select().from(profiles).where(eq(profiles.id, perfil.id))).toEqual([perfil]);
  await db.delete(profiles).where(eq(profiles.id, perfil.id));
  await db.delete(users).where(eq(users.id, titular.id));
  expect(await db.select().from(users).where(eq(users.id, titular.id))).toHaveLength(0);
});
