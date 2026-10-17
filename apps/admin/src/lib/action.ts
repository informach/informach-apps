import "server-only";
import {
  type AuditEventType,
  AuditPersistenceError,
  ForbiddenError,
  LastOwnerError,
  logAuditEventStrict,
  UnauthorizedError,
} from "@informach/auth";
import {
  enforceRateLimit,
  postgresRateLimitStorage,
  RateLimitError,
} from "@informach/auth/server-actions";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import {
  requireOwnerForAction,
  requireStaffForAction,
  requireTwoFactorSetupForAction,
  type Staff,
} from "./access";
import { reportOperationalError } from "./observability";

/** Resposta das ações para o formulário: sucesso com mensagem, ou erro para mostrar. */
export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

type RateLimitOption = { key: string; max: number; window: string };

type GuardedActionOptions<S extends z.ZodType, C extends { staff: Staff }> = {
  schema: S;
  /** Limite por pessoa da equipe, para um clique repetido não virar avalanche. */
  rateLimit?: RateLimitOption;
  run: (input: z.infer<S>, context: C) => Promise<ActionResult>;
};

/**
 * Núcleo das ações: confere o acesso no banco, limita repetição, valida a
 * entrada e devolve uma frase pronta para a tela. Erros inesperados vão para o
 * Sentry sem dados da conta e a tela recebe uma frase genérica.
 */
function guardedAction<S extends z.ZodType, C extends { staff: Staff }>(
  guard: () => Promise<C>,
  options: GuardedActionOptions<S, C>,
) {
  return async (raw: unknown): Promise<ActionResult> => {
    let staff: Staff | null = null;
    try {
      const context = await guard();
      staff = context.staff;
      const parsed = options.schema.safeParse(raw);
      if (!parsed.success) return { ok: false, error: "Confira os campos e tente de novo." };
      if (options.rateLimit) {
        await enforceRateLimit(
          {
            key: `${options.rateLimit.key}:user:${staff.id}`,
            max: options.rateLimit.max,
            window: options.rateLimit.window,
          },
          postgresRateLimitStorage,
        );
      }
      return await options.run(parsed.data, context);
    } catch (error) {
      unstable_rethrow(error);
      if (error instanceof UnauthorizedError)
        return { ok: false, error: "Sua sessão terminou. Entre de novo para continuar." };
      if (error instanceof LastOwnerError)
        return {
          ok: false,
          error:
            "A casa ficaria sem nenhuma conta owner ativa. Promova outra conta a owner antes e tente de novo.",
        };
      if (error instanceof ForbiddenError)
        return { ok: false, error: "Sua conta não pode fazer isso." };
      if (error instanceof RateLimitError)
        return { ok: false, error: "Muitas tentativas seguidas. Espere alguns minutos." };
      // A gravação estrita acontece na mesma transação da mudança, e a falha já
      // foi reportada pelo pacote: nada mudou.
      if (error instanceof AuditPersistenceError)
        return {
          ok: false,
          error:
            "O registro na auditoria não gravou, então nada foi alterado. Tente de novo em instantes.",
        };
      reportOperationalError("action.unexpected_failure", error, { actorId: staff?.id });
      return { ok: false, error: "Não deu certo agora. Nada foi alterado; tente de novo." };
    }
  };
}

type StaffActionOptions<S extends z.ZodType> = Omit<
  GuardedActionOptions<S, { staff: Staff }>,
  "run"
> & {
  /** `owner` limita a ação às contas owner. */
  role?: "staff" | "owner";
  run: (input: z.infer<S>, staff: Staff) => Promise<ActionResult>;
};

/** Ação da equipe com duas etapas ativas. */
export function staffAction<S extends z.ZodType>(options: StaffActionOptions<S>) {
  return guardedAction(
    async () => ({
      staff:
        options.role === "owner" ? await requireOwnerForAction() : await requireStaffForAction(),
    }),
    {
      schema: options.schema,
      rateLimit: options.rateLimit,
      run: (input, context) => options.run(input, context.staff),
    },
  );
}

/** Ação da tela de ativação: conta da equipe que ainda não ligou as duas etapas. */
export function twoFactorSetupAction<S extends z.ZodType>(
  options: GuardedActionOptions<S, { staff: Staff; sessionId: string }>,
) {
  return guardedAction(requireTwoFactorSetupForAction, options);
}

/**
 * Grava na auditoria em nome de quem agiu, na forma estrita: se o registro não
 * gravar, sai `AuditPersistenceError` (já reportado pelo pacote) e quem chamou
 * não mostra o dado nem conclui a ação.
 */
export async function auditAs(
  staff: Staff,
  eventType: AuditEventType,
  payload: Record<string, unknown>,
) {
  await logAuditEventStrict(eventType, staff.id, payload);
}

export const AUDITED = "O registro entrou na auditoria em seu nome.";

/**
 * Fecha uma ação cuja mudança já aconteceu fora de uma transação nossa (Redis
 * dos apps, e-mail pedido a outro produto, licença da Suíte Edi). A ação só é
 * dada como concluída com o evento gravado. Se a gravação falhar, a tela diz o
 * que já foi feito e que o registro faltou, e a observabilidade recebe a falha.
 */
export async function auditChange(
  staff: Staff,
  eventType: AuditEventType,
  payload: Record<string, unknown>,
  done: string,
): Promise<ActionResult> {
  try {
    await auditAs(staff, eventType, payload);
    return { ok: true, message: `${done} ${AUDITED}` };
  } catch (error) {
    if (!(error instanceof AuditPersistenceError)) throw error;
    reportOperationalError("audit.change_unrecorded", error, {
      actorId: staff.id,
      eventType,
      payloadKeys: Object.keys(payload),
    });
    return {
      ok: false,
      error: `${done} Só que o registro na auditoria não gravou. A falha já foi reportada; confira a Auditoria antes de repetir a ação.`,
    };
  }
}

export const reasonSchema = z
  .string()
  .trim()
  .min(3, "Escreva o motivo.")
  .max(280, "Use até 280 caracteres.");
