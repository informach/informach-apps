"use server";
import { z } from "zod";
import { type ActionResult, twoFactorSetupAction } from "@/lib/action";
import { reportOperationalError } from "@/lib/observability";
import { confirmSetupCode, sendSetupCode } from "./proof";
import { CODE_TTL_MINUTES, normalizeSetupCode, PROOF_TTL_MINUTES } from "./service";

/** Manda o código de ativação para o e-mail da conta. Até 3 por hora. */
export const sendSetupCodeAction = twoFactorSetupAction({
  schema: z.object({}),
  rateLimit: { key: "bastidores:2fa-email-send", max: 3, window: "1h" },
  run: async (_input, { staff, sessionId }): Promise<ActionResult> => {
    const result = await sendSetupCode(staff, sessionId);
    if (result.ok)
      return {
        ok: true,
        message: `Mandamos um código para ${staff.email}. Ele vale por ${CODE_TTL_MINUTES} minutos e só uma vez.`,
      };
    if (result.reason === "blocked")
      return {
        ok: false,
        error:
          "O provedor de e-mail está recusando mensagens para este endereço. Fale com a titular para conferir a conta antes de ativar.",
      };
    reportOperationalError("two_factor.code_not_sent", undefined, { actorId: staff.id });
    return {
      ok: false,
      error: "Não deu para enviar o código agora. Tente de novo em alguns minutos.",
    };
  },
});

/**
 * Confere o código. Até 5 tentativas por hora por conta, contadas no banco: com
 * 6 números e código novo a cada pedido, adivinhar fica fora de alcance.
 */
export const confirmSetupCodeAction = twoFactorSetupAction({
  schema: z.object({ code: z.string().max(20) }),
  rateLimit: { key: "bastidores:2fa-email-check", max: 5, window: "1h" },
  run: async (input, { staff, sessionId }): Promise<ActionResult> => {
    const code = normalizeSetupCode(input.code);
    if (!code) return { ok: false, error: "O código tem 6 números. Confira e digite de novo." };
    if (!(await confirmSetupCode(staff, sessionId, code)))
      return {
        ok: false,
        error: "Código não confere ou venceu. Use o e-mail mais recente ou peça um código novo.",
      };
    return {
      ok: true,
      message: `E-mail confirmado. Nos próximos ${PROOF_TTL_MINUTES} minutos, confirme a senha para gerar a chave do autenticador.`,
    };
  },
});
