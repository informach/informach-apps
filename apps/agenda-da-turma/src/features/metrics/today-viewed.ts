"use server";

import { z } from "zod";
import { todayLocalIso } from "@/features/dashboard/date";
import { action, err, ok } from "@/lib/action";
import { recordTodayViewedOnce } from "./events";

/**
 * Registra que o adulto abriu Hoje, no máximo uma vez por dia de São Paulo
 * (ver `recordTodayViewedOnce`). Não guarda nada além do dia: nem criança, nem
 * filtro, nem quanto tempo a tela ficou aberta.
 */
export const recordTodayViewedAction = action
  .input(z.object({}))
  .auth({ require: "user" })
  .rateLimit({ key: "metrics-today-viewed", max: 30, window: "1h" })
  .run(async ({ ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);
    const recorded = await recordTodayViewedOnce(userId, todayLocalIso());
    return ok({ recorded } as const);
  });
