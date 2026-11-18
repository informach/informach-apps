import { db, eq } from "@informach/db";
import {
  recreioTrialEnrollments as enrollments,
  recreioGroups as groups,
  sessions,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import { VERSAO_DA_DECLARACAO_ADULTA } from "@/features/grupo/convites-constantes";
import { VERSAO_DO_TESTE } from "@/features/teste/constantes";
import {
  autorizarExperimento,
  consultarMeuTeste,
  retirarConsentimentoDoTeste,
} from "@/features/teste/service";
import { env } from "@/lib/env";
import { adultoDoTeste, pedidoDeTeste } from "./teste-apoio";

if (env.RECREIO_TRIAL_MODE !== "off") throw new Error("A regressão exige o teste desligado");

describe("teste sem cartão desligado", () => {
  it("recusa preparação sem criar grupo ou iniciar relógio", async () => {
    const p = await adultoDoTeste();
    await expect(autorizarExperimento(p.autor, pedidoDeTeste())).rejects.toMatchObject({
      code: "INDISPONIVEL",
    });
    expect(await db.select().from(groups).where(eq(groups.ownerUserId, p.conta.id))).toEqual([]);
    expect(await consultarMeuTeste(p.autor)).toMatchObject({
      modo: "off",
      consentimento: null,
      teste: null,
    });
  });

  it("permite retirar consentimento anterior mesmo sem login recente ou plano", async () => {
    const p = await adultoDoTeste();
    const [grupo] = await db.insert(groups).values({ ownerUserId: p.conta.id }).returning();
    if (!grupo) throw new Error("Grupo ausente");
    const [aceite] = await db
      .insert(enrollments)
      .values({
        payerUserId: p.conta.id,
        groupId: grupo.id,
        policyVersion: VERSAO_DO_TESTE,
        adultDeclarationVersion: VERSAO_DA_DECLARACAO_ADULTA,
        acceptedAt: new Date(),
      })
      .returning();
    if (!aceite) throw new Error("Consentimento anterior ausente");
    await db
      .update(sessions)
      .set({ createdAt: new Date(Date.now() - 11 * 60_000) })
      .where(eq(sessions.id, p.autor.login.authSessionId));
    expect(await retirarConsentimentoDoTeste(p.autor, aceite.id)).toMatchObject({
      id: aceite.id,
      retiradoEm: expect.any(String),
    });
    expect((await consultarMeuTeste(p.autor)).teste).toBeNull();
  });
});
