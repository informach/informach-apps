"use server";
import { BillingError } from "@informach/billing";
import {
  CreditMigrationBlockedError,
  isLegacyCreditSourceApp,
  migrateLegacyWallet,
  prepareLegacyWalletMigration,
} from "@informach/billing/credit-migration";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActions } from "@/lib/action";
import { getBilling } from "@/lib/billing";
import { getEnv } from "@/lib/env";
import { reportOperationalError } from "@/lib/observability";

type SourceApp = Parameters<typeof prepareLegacyWalletMigration>[2]["sourceApp"];
export type MigrationFormState = {
  ok: boolean;
  message: string;
  completed?: boolean;
  preview?: {
    revision: string;
    sourceAmount: number;
    amount: number;
    multiplier: number;
    lots: {
      sourceEntryId: string;
      sourceAmount: number;
      amount: number;
      expiresAt: string | null;
    }[];
  };
};
const inputSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("preview"),
    groupId: z.uuid(),
    sourceApp: z.custom<SourceApp>(isLegacyCreditSourceApp),
  }),
  z.object({
    operation: z.literal("confirm"),
    groupId: z.uuid(),
    sourceApp: z.custom<SourceApp>(isLegacyCreditSourceApp),
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    confirmed: z.literal("on"),
  }),
]);
const blocked = {
  reservations:
    "Há um uso de IA antigo em andamento. Aguarde sua conclusão antes de trazer os créditos.",
  debt: "O saldo antigo tem um ajuste financeiro pendente. Confira os pagamentos antes de continuar.",
  suspended:
    "Há créditos com pagamento em análise. A migração ficará disponível depois da conferência.",
  future:
    "Há um lançamento de créditos agendado. A conferência precisa ser concluída antes da migração.",
  review:
    "A origem dos créditos está em conferência. Nenhuma transferência foi feita; tente novamente depois da conciliação.",
} satisfies Record<CreditMigrationBlockedError["reason"], string>;

export async function migrationAction(
  _previous: MigrationFormState,
  form: FormData,
): Promise<MigrationFormState> {
  const input = inputSchema.safeParse(Object.fromEntries(form));
  if (!input.success)
    return { ok: false, message: "Confira a família, a origem e a confirmação da transferência." };
  return getActions()
    .input(inputSchema)
    .auth({ require: "user" })
    .rateLimit({ key: "conta:credit-migration", max: 4, window: "1m" })
    .run(async ({ ctx, input }): Promise<MigrationFormState> => {
      if (!ctx.actor?.emailVerified)
        return { ok: false, message: "Confirme seu e-mail para continuar." };
      if (!getEnv().COMPASSO_BILLING_ENABLED)
        return { ok: false, message: "A transferência de créditos ainda não está disponível." };
      try {
        const billing = getBilling();
        const state = await prepareLegacyWalletMigration(
          { ...billing, products: billing.legacyProducts },
          ctx.actor.id,
          input,
        );
        if (state.status === "migrated")
          return {
            ok: true,
            completed: true,
            message: "Esta carteira já foi transferida. O destino está registrado na sua conta.",
          };
        const preview: NonNullable<MigrationFormState["preview"]> = {
          revision: state.revision,
          sourceAmount: state.sourceAmount,
          amount: state.amount,
          multiplier: state.policy.numerator,
          lots: state.lots.map((lot) => ({
            ...lot,
            expiresAt: lot.expiresAt instanceof Date ? lot.expiresAt.toISOString() : lot.expiresAt,
          })),
        };
        if (input.operation === "preview")
          return {
            ok: true,
            message: "Confira os valores e a família antes de confirmar.",
            preview,
          };
        if (input.revision !== state.revision)
          return {
            ok: false,
            message: "O saldo mudou. Revise os novos valores e confirme novamente.",
            preview,
          };
        await migrateLegacyWallet(billing.db, ctx.actor.id, input);
        revalidatePath("/");
        return {
          ok: true,
          completed: true,
          message:
            "Créditos transferidos para a carteira desta família, com as validades preservadas.",
        };
      } catch (error) {
        if (error instanceof CreditMigrationBlockedError)
          return { ok: false, message: blocked[error.reason] };
        reportOperationalError("billing.credit_migration.failed", error);
        return {
          ok: false,
          message:
            error instanceof BillingError
              ? "Não foi possível confirmar a transferência. Atualize a prévia e confira seu vínculo com a família."
              : "A conferência não terminou agora. Consulte o saldo na sua conta antes de tentar novamente.",
        };
      }
    })(input.data);
}
