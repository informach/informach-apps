"use server";
import { ForbiddenError } from "@informach/auth";
import { ComandoDeModeracaoSchema } from "@informach/recreio/contrato";
import { z } from "zod";
import { requireStaffSessionForAction } from "@/lib/access";
import { staffAction } from "@/lib/action";
import { enviarComandoDeModeracao } from "./comando";

export const moderarRecreioAction = staffAction({
  schema: z.strictObject({ comando: ComandoDeModeracaoSchema, confirmoEfeito: z.literal(true) }),
  rateLimit: { key: "recreio:moderacao", max: 60, window: "1m" },
  run: async ({ comando }, staff) => {
    const atual = await requireStaffSessionForAction();
    if (atual.staff.id !== staff.id) throw new ForbiddenError("staff changed");
    return enviarComandoDeModeracao(atual.staff, atual.sessionId, comando);
  },
});
