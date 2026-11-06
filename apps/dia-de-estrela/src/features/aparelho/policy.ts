import { z } from "zod";

export const DEVICE_COOKIE = "dde-aparelho";
export const CHILD_COOKIE = "dde-crianca";
export const UNLOCK_COOKIE = "dde-pais";
export const CODE_LIFETIME_MS = 10 * 60_000;
export const CODE_WINDOW_MS = 10 * 60_000;
export const CODE_ATTEMPTS = 10;
/** O aparelho da criança fica conectado por 30 dias, renovados enquanto ela usa. */
export const DEVICE_LIFETIME_MS = 30 * 24 * 60 * 60_000;
/** Renovação no máximo uma vez por hora, para o sinal de vida não escrever a cada minuto. */
export const DEVICE_RENEW_MS = 60 * 60_000;
/** Aparelho que deu sinal nesse intervalo conta como ligado nos alertas aos pais. */
export const DEVICE_ONLINE_MS = 10 * 60_000;
export const MAX_DEVICES = 10;

export const deviceSchema = z.object({
  childIds: z
    .array(z.string().uuid())
    .min(1)
    .max(4)
    .refine((ids) => new Set(ids).size === ids.length),
  label: z.string().trim().min(2).max(60),
});
export type DeviceInput = z.infer<typeof deviceSchema>;

export function normalizeCode(value: string) {
  return value.trim().toUpperCase().replace(/[\s-]/g, "");
}

export const codeSchema = z
  .string()
  .max(30)
  .transform(normalizeCode)
  .pipe(z.string().regex(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$/));

/** A criança escolhida neste aparelho, se ainda for dele; com uma só, ela mesma. */
export function selectedChild(childIds: string[], chosen: string | undefined) {
  if (chosen && childIds.includes(chosen)) return chosen;
  return childIds.length === 1 ? childIds[0] : undefined;
}

export type DeviceIdentity = {
  deviceId: string;
  ownerId: string;
  childIds: string[];
  childId: string | undefined;
  expiresAt: Date;
};
