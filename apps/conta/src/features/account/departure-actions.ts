"use server";
import { UnauthorizedError } from "@informach/auth";
import { RateLimitError } from "@informach/auth/server-actions";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getActions } from "@/lib/action";
import { requestDepartureAssessment } from "./departure-service";

export type DepartureActionState = { message: string; ok: boolean };
const schema = z.object({ refresh: z.boolean() });

export async function requestDepartureAssessmentAction(
  _state: DepartureActionState,
  form: FormData,
): Promise<DepartureActionState> {
  let reviewId: string;
  try {
    reviewId = await getActions()
      .input(schema)
      .auth({ require: "user" })
      .run(async ({ ctx, input }) => {
        if (!ctx.headers) throw new UnauthorizedError();
        return requestDepartureAssessment(ctx.headers, input.refresh);
      })({ refresh: form.get("refresh") === "true" });
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/entrar?next=%2Fprivacidade%2Fencerramento");
    if (error instanceof RateLimitError)
      return {
        ok: false,
        message:
          "Você atingiu o limite de novas consultas desta hora. Aguarde para tentar novamente.",
      };
    throw error;
  }
  redirect(`/privacidade/encerramento?avaliacao=${reviewId}`);
}
