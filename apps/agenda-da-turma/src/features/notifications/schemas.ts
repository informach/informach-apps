import { z } from "zod";

export function isQuietHour(hour: number, start: number, end: number) {
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}
export const notificationPreferencesSchema = z
  .object({
    emailEnabled: z.boolean(),
    pushEnabled: z.boolean(),
    digestHour: z.number().int().min(0).max(23),
    quietStart: z.number().int().min(0).max(23),
    quietEnd: z.number().int().min(0).max(23),
  })
  .refine((v) => !isQuietHour(v.digestHour, v.quietStart, v.quietEnd), {
    message: "Escolha o resumo fora do horário de silêncio",
    path: ["digestHour"],
  });
export const DEFAULT_NOTIFICATION_PREFERENCES = {
  emailEnabled: false,
  pushEnabled: false,
  digestHour: 19,
  quietStart: 21,
  quietEnd: 7,
};

// Only browser push services may be contacted by the server. Do not turn a
// user-supplied subscription URL into an arbitrary HTTP request.
export function isAllowedPushEndpoint(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.port || url.username || url.password) return false;
    return (
      url.hostname === "fcm.googleapis.com" ||
      url.hostname === "updates.push.services.mozilla.com" ||
      url.hostname === "web.push.apple.com" ||
      url.hostname.endsWith(".notify.windows.com")
    );
  } catch {
    return false;
  }
}
export const pushSubscriptionSchema = z.object({
  endpoint: z
    .string()
    .url()
    .max(2000)
    .refine(isAllowedPushEndpoint, "Serviço de notificações não reconhecido"),
  keys: z.object({
    p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}={0,2}$/),
    auth: z.string().regex(/^[A-Za-z0-9_-]{22}={0,2}$/),
  }),
});
