import "server-only";
import {
  type AuditEventType,
  ForbiddenError,
  logAuditEvent,
  UnauthorizedError,
} from "@informach/auth";
import {
  enforceRateLimit,
  postgresRateLimitStorage,
  RateLimitError,
} from "@informach/auth/server-actions";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { requireOwnerForAction, requireStaffForAction, type Staff } from "./access";
import { reportOperationalError } from "./observability";

/** Resposta das ações para o formulário: sucesso com mensagem, ou erro para mostrar. */
export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

type StaffActionOptions<S extends z.ZodType> = {
  schema: S;
  /** `owner` limita a ação às contas owner. */
  role?: "staff" | "owner";
  /** Limite por pessoa da equipe, para um clique repetido não virar avalanche. */
  rateLimit?: { key: string; max: number; window: string };
  run: (input: z.infer<S>, staff: Staff) => Promise<ActionResult>;
};

/**
 * Ação da equipe: confere papel e duas etapas no banco, limita repetição,
 * valida a entrada e devolve uma frase pronta para a tela. Erros inesperados
 * vão para o Sentry sem dados da conta e a tela recebe uma frase genérica.
 */
export function staffAction<S extends z.ZodType>(options: StaffActionOptions<S>) {
  return async (raw: unknown): Promise<ActionResult> => {
    let staff: Staff | null = null;
    try {
      staff =
        options.role === "owner" ? await requireOwnerForAction() : await requireStaffForAction();
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
      return await options.run(parsed.data, staff);
    } catch (error) {
      unstable_rethrow(error);
      if (error instanceof UnauthorizedError)
        return { ok: false, error: "Sua sessão terminou. Entre de novo para continuar." };
      if (error instanceof ForbiddenError)
        return { ok: false, error: "Sua conta não pode fazer isso." };
      if (error instanceof RateLimitError)
        return { ok: false, error: "Muitas tentativas seguidas. Espere alguns minutos." };
      reportOperationalError("action.unexpected_failure", error, { actorId: staff?.id });
      return { ok: false, error: "Não deu certo agora. Nada foi alterado; tente de novo." };
    }
  };
}

/** Grava na auditoria em nome de quem agiu. Falha de gravação não esconde a ação. */
export async function auditAs(
  staff: Staff,
  eventType: AuditEventType,
  payload: Record<string, unknown>,
) {
  await logAuditEvent(eventType, staff.id, payload);
}

export const reasonSchema = z
  .string()
  .trim()
  .min(3, "Escreva o motivo.")
  .max(280, "Use até 280 caracteres.");
