"use server";
import { WebClosureError } from "@informach/account/closure";
import { UnauthorizedError } from "@informach/auth";
import { RateLimitError } from "@informach/auth/server-actions";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActions } from "@/lib/action";
import { changeAccountClosure, closureActionSchema } from "./closure-service";

export type ClosureFormState = { message: string };
export async function closureAction(
  _state: ClosureFormState,
  form: FormData,
): Promise<ClosureFormState> {
  const input = closureActionSchema.safeParse(Object.fromEntries(form));
  if (!input.success) return { message: "Confira a confirmação antes de continuar." };
  try {
    await getActions()
      .input(closureActionSchema)
      .auth({ require: "user" })
      .run(async ({ ctx, input }) => {
        if (!ctx.headers) throw new UnauthorizedError();
        return changeAccountClosure(ctx.headers, input);
      })(input.data);
  } catch (error) {
    if (
      error instanceof UnauthorizedError ||
      (error instanceof WebClosureError && error.code === "unauthorized")
    )
      redirect("/entrar?next=%2Fprivacidade%2Fencerramento");
    if (error instanceof RateLimitError)
      return { message: "Aguarde antes de enviar outra solicitação. O andamento continua salvo." };
    if (error instanceof WebClosureError)
      return {
        message:
          error.code === "irreversible"
            ? "O encerramento já foi confirmado e não pode ser desfeito. Acompanhe as etapas restantes."
            : "O andamento mudou. Atualize esta página e confira a preparação antes de continuar.",
      };
    throw error;
  }
  revalidatePath("/");
  revalidatePath("/privacidade/encerramento");
  // Preparation revokes the previous central login together with app sessions.
  if (input.data.operation === "begin") redirect("/entrar?next=%2Fprivacidade%2Fencerramento");
  redirect("/privacidade/encerramento");
}
