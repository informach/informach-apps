"use server";
import { revokeWebSessions } from "@informach/auth/web-sessions";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActions } from "@/lib/action";
import { getAuth } from "@/lib/auth";

const schema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("one"),
    sessionId: z.string().min(1).max(200),
    confirmed: z.literal("on"),
  }),
  z.object({ mode: z.enum(["all", "others"]), confirmed: z.literal("on") }),
]);
export type SessionActionState = { ok: boolean; message: string; currentRevoked?: boolean };
export async function revokeSessionAction(
  _state: SessionActionState,
  form: FormData,
): Promise<SessionActionState> {
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "Confirme quais entradas deseja encerrar." };
  const result = await getActions()
    .input(schema)
    .auth({ require: "user" })
    .rateLimit({ key: "conta:sessions", max: 10, window: "1m" })
    .run(async ({ ctx, input }): Promise<SessionActionState> => {
      const current = ctx.headers ? await getAuth().getSession(ctx.headers) : null;
      if (!current?.user.emailVerified || current.user.id !== ctx.actor?.id)
        return { ok: false, message: "Entre novamente para gerenciar seus acessos." };
      const result = await revokeWebSessions(current.user.id, current.session.id, input);
      return {
        ok: true,
        currentRevoked: result.currentRevoked,
        message: "Entradas encerradas. Os apps vinculados a elas também foram desconectados.",
      };
    })(parsed.data);
  if (result.ok) revalidatePath("/");
  return result;
}
