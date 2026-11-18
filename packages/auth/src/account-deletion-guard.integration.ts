import { randomUUID } from "node:crypto";
import { db, eq } from "@informach/db";
import {
  recreioAdultDeclarations as declarations,
  recreioGroups as groups,
  recreioGuardianLinks as guardians,
  recreioMinorProfiles as minors,
  recreioProfiles as profiles,
  users,
} from "@informach/db/schema";
import { expect, it } from "vitest";
import { assertAccountDeletionReady } from "./account-deletion-guard";

const url = process.env.DATABASE_URL;
if (
  !url ||
  process.env.COMPASSO_ISOLATED_DATABASE !== "1" ||
  !["localhost", "127.0.0.1", "postgres"].includes(new URL(url).hostname)
)
  throw new Error("Disposable database required");

async function conta() {
  const id = randomUUID();
  await db
    .insert(users)
    .values({ id, name: "Conta sintética", email: `${id}@example.test`, emailVerified: true });
  return id;
}
const recusa = { body: { code: "RECREIO_ACCOUNT_DELETION_REQUIRES_SUPPORT" } };

it("titular sem jogador resolve o grupo antes da exclusão compartilhada", async () => {
  const id = await conta();
  const [grupo] = await db.insert(groups).values({ ownerUserId: id }).returning();
  if (!grupo) throw new Error("Grupo ausente");
  await expect(assertAccountDeletionReady(id)).rejects.toMatchObject(recusa);
  await db.delete(groups).where(eq(groups.id, grupo.id));
  await expect(assertAccountDeletionReady(id)).resolves.toBeUndefined();
});

it("jogador fora de grupo continua protegido", async () => {
  const id = await conta();
  await db
    .insert(profiles)
    .values({ userId: id, kind: "adult", groupId: null, nickname: "Lua", avatar: "padrao" });
  await expect(assertAccountDeletionReady(id)).rejects.toMatchObject(recusa);
});

it("responsabilidade infantil continua protegida sem grupo ou jogador do adulto", async () => {
  const id = await conta();
  const [declaracao] = await db
    .insert(declarations)
    .values({ userId: id, version: "responsabilidade-2026-11-16" })
    .returning();
  const [perfil] = await db
    .insert(profiles)
    .values({ kind: "minor", nickname: "Protegido", avatar: "padrao" })
    .returning();
  if (!declaracao || !perfil) throw new Error("Cadastro ausente");
  await db.insert(minors).values({ profileId: perfil.id, birthMonth: 1, birthYear: 2018 });
  await db
    .insert(guardians)
    .values({ profileId: perfil.id, guardianUserId: id, declarationId: declaracao.id });
  await expect(assertAccountDeletionReady(id)).rejects.toMatchObject(recusa);
});

it("conta sem vínculos não herda a recusa de outra conta", async () => {
  await expect(assertAccountDeletionReady(await conta())).resolves.toBeUndefined();
});
