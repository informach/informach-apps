import { db, eq } from "@informach/db";
import {
  recreioGroupInvites as invites,
  recreioRightsOperations as operations,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import { VERSAO_DA_DECLARACAO_ADULTA } from "@/features/grupo/convites-constantes";
import { convidarAdulto } from "@/features/grupo/convites-service";
import { livroDoEncerramento } from "./encerramento-financeiro-apoio";
import { adultoDoTeste } from "./teste-apoio";

const pedido = (email: string) => ({
  email,
  identificacao: "Adulto",
  declaroMaioridade: true,
  versaoDaDeclaracao: VERSAO_DA_DECLARACAO_ADULTA,
});

describe("encerramento: emissão de convites respeita a barreira do destinatário", () => {
  it("nem convite novo nem repetição de convite anterior repõem dados após closing", async () => {
    const a = await adultoDoTeste(),
      b = await adultoDoTeste(),
      c = await adultoDoTeste();
    const anterior = await convidarAdulto(a.autor, pedido(b.conta.email));
    const livro = await livroDoEncerramento(b.autor, () => {
      throw new Error("No customer");
    });
    try {
      await expect(convidarAdulto(a.autor, pedido(b.conta.email))).rejects.toMatchObject({
        code: "CONVITE",
      });
      await expect(convidarAdulto(c.autor, pedido(b.conta.email))).rejects.toMatchObject({
        code: "CONVITE",
      });
      const recebidos = await db
        .select()
        .from(invites)
        .where(eq(invites.recipientUserId, b.conta.id));
      expect(recebidos.map((r) => r.id)).toEqual([anterior.conviteId]);
      // Existing invitation is a cleanup dependency, not silently removed by
      // the issuance guard. No final closure is claimed here.
    } finally {
      await livro.fechar();
    }
  });

  it("emissão e consentimento concorrentes só admitem convite anterior à barreira", async () => {
    const a = await adultoDoTeste(),
      b = await adultoDoTeste();
    const [emitido, encerramento] = await Promise.allSettled([
      convidarAdulto(a.autor, pedido(b.conta.email)),
      livroDoEncerramento(b.autor, () => {
        throw new Error("No customer");
      }),
    ]);
    if (encerramento.status !== "fulfilled") throw encerramento.reason;
    const livro = encerramento.value;
    try {
      if (emitido.status === "fulfilled") {
        const [convite] = await db
          .select()
          .from(invites)
          .where(eq(invites.id, emitido.value.conviteId));
        const [op] = await db
          .select()
          .from(operations)
          .where(eq(operations.id, livro.recibo.operacaoId));
        if (!convite || !op) throw new Error("Native ordered receipts absent");
        expect(convite.createdAt.getTime()).toBeLessThanOrEqual(op.consentedAt.getTime());
      } else expect(emitido.reason).toMatchObject({ code: "CONVITE" });
      await expect(convidarAdulto(a.autor, pedido(b.conta.email))).rejects.toMatchObject({
        code: "CONVITE",
      });
    } finally {
      await livro.fechar();
    }
  });
});
