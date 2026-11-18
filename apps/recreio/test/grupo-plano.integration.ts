import { db, eq } from "@informach/db";
import { recreioGroups as groups, recreioProfiles as profiles } from "@informach/db/schema";
import { GrupoIdSchema } from "@informach/recreio";
import { describe, expect, it } from "vitest";
import { decidirPlanoLido } from "@/features/acesso/decisao";
import { lerFatosDoGrupo } from "@/features/acesso/repository";
import { avaliarAcesso } from "@/features/acesso/service";
import { conceder, revogar } from "../scripts/concessoes";
import { novaConta, novoJogador } from "./apoio";

describe("capacidade comercial sem jogador administrativo", () => {
  it.each([
    ["individual", 1],
    ["family", 4],
  ] as const)("pagante sem perfil consulta %s com %i vagas", async (tier, limite) => {
    const conta = await novaConta();
    const concessao = await conceder({ email: conta.email, tier, dias: 30, motivo: "teste" });
    const fatos = await lerFatosDoGrupo(GrupoIdSchema.parse(concessao.grupoId));
    if (!fatos) throw new Error("Grupo ausente");
    expect(fatos.cobertos).toEqual([]);
    expect(decidirPlanoLido(fatos, new Date())).toMatchObject({
      estado: "ATIVO",
      limiteDePerfis: limite,
      origemId: concessao.concessaoId,
    });
    expect(
      await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.userId, conta.id)),
    ).toEqual([]);
  });

  it("usa fatos revogados e a transação do chamador, sem nova conexão", async () => {
    const conta = await novaConta();
    const concessao = await conceder({
      email: conta.email,
      tier: "family",
      dias: 30,
      motivo: "teste",
    });
    await revogar({ email: conta.email, motivo: "teste" });
    const grupoId = GrupoIdSchema.parse(concessao.grupoId);
    await db.transaction(async (tx) => {
      const fatos = await lerFatosDoGrupo(grupoId, tx);
      if (!fatos) throw new Error("Grupo ausente");
      expect(decidirPlanoLido(fatos, new Date())).toMatchObject({
        estado: "REVOGADO",
        podeJogar: false,
        limiteDePerfis: 0,
      });
      await tx.delete(groups).where(eq(groups.id, grupoId));
      expect(await lerFatosDoGrupo(grupoId, tx)).toBeNull();
    });
  });

  it("a leitura comercial não devolve autoridade ao perfil retirado da cobertura", async () => {
    const jogador = await novoJogador();
    const [perfil] = await db.select().from(profiles).where(eq(profiles.id, jogador.perfil.id));
    if (!perfil?.groupId) throw new Error("Grupo ausente");
    await db.update(profiles).set({ coverageEnabled: false }).where(eq(profiles.id, perfil.id));
    const fatos = await lerFatosDoGrupo(GrupoIdSchema.parse(perfil.groupId));
    if (!fatos) throw new Error("Grupo ausente");
    expect(decidirPlanoLido(fatos, new Date()).limiteDePerfis).toBe(1);
    expect(await avaliarAcesso({ profileId: jogador.perfil.id })).toMatchObject({
      podeJogar: false,
      motivo: "perfil_sem_cobertura",
    });
  });
});
