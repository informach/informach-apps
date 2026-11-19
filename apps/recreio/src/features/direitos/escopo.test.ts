import { describe, expect, it } from "vitest";
import { mesmoEscopoDeDireitos as mesmo } from "./escopo";
import { PlanoDeDireitosSchema } from "./preparacao-contrato";

const perfil = "00000000-0000-4000-8000-000000000001";
const mundo = "00000000-0000-4000-8000-000000000002";
function plano() {
  return PlanoDeDireitosSchema.parse({
    formato: "recreio-previa-direitos-v1",
    tipo: "retirar_perfil",
    contaId: "conta",
    perfis: [{ id: perfil, tipo: "adult", versao: 1, responsabilidadeId: null }],
    mundos: [
      {
        id: mundo,
        jogo: "morada",
        revisao: 2,
        diario: 12,
        gestao: 1,
        cerca: 3,
        estado: "hibernating",
        outrosParticipantes: 1,
      },
    ],
    identidadeGlobalPreservada: true,
    financeiroSeparado: true,
  });
}
describe("direitos: escopo consentível independente do relógio de gameplay", () => {
  it("fotografia, diário, posse e hibernação não alteram pessoas ou vínculos", () => {
    const a = plano(),
      b = plano();
    b.mundos = b.mundos.map((m) => ({ ...m, revisao: 3, diario: 90, cerca: 4, estado: "active" }));
    expect(mesmo(a, b)).toBe(true);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });
  it.each(["autoridade", "gestao", "participantes", "outro_mundo", "tipo", "conta"] as const)(
    "recusa mudança de %s",
    (caso) => {
      const a = plano(),
        b = plano();
      if (caso === "autoridade") b.perfis = b.perfis.map((p) => ({ ...p, versao: 2 }));
      if (caso === "gestao") b.mundos = b.mundos.map((m) => ({ ...m, gestao: 2 }));
      if (caso === "participantes")
        b.mundos = b.mundos.map((m) => ({ ...m, outrosParticipantes: 2 }));
      if (caso === "outro_mundo") b.mundos = [];
      if (caso === "tipo") b.tipo = "encerrar_conta";
      if (caso === "conta") b.contaId = "outra-conta";
      expect(mesmo(a, b)).toBe(false);
    },
  );
});
