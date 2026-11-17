import "server-only";
import webpush from "web-push";
import { env } from "@/lib/env";
import {
  canNotifyChild,
  claimDelivery,
  deletePushById,
  familyAdults,
  finishDelivery,
  pushSubscriptionsOf,
} from "./repository";

export const pushConfigured = () => !!env.VAPID_PUBLIC_KEY && !!env.VAPID_PRIVATE_KEY;

/**
 * Só serviços de push de navegador podem ser chamados pelo servidor: um
 * endereço vindo do aparelho nunca vira pedido HTTP arbitrário.
 */
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

const remetente = () => {
  const m = /<([^>]+)>/.exec(env.SENDGRID_FROM);
  return `mailto:${m?.[1] ?? env.SENDGRID_FROM}`;
};

/**
 * Avisa os adultos da família. A tela bloqueada do celular nunca mostra o
 * nome da criança nem o nome da tarefa: só que há algo esperando.
 */
export async function pushParaFamilia(
  groupId: string,
  childId: string,
  messageKey: string,
  url: string,
) {
  if (!pushConfigured()) return { sent: 0, failed: 0 };
  const adultos = await familyAdults(groupId, childId);
  const assinaturas = await pushSubscriptionsOf(adultos);
  let sent = 0;
  let failed = 0;
  for (const s of assinaturas) {
    if (!isAllowedPushEndpoint(s.endpoint)) continue;
    const entrega = await claimDelivery(s.userId, `${messageKey}:${s.id}`, s.id);
    if (!entrega) continue;
    if (!(await canNotifyChild(groupId, childId, s.userId, entrega))) {
      await finishDelivery(entrega, "failed");
      continue;
    }
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({
          title: "Dia de Estrela",
          body: "Uma tarefa ainda não foi marcada. Toque para ver.",
          url,
          tag: messageKey,
        }),
        {
          TTL: 900,
          timeout: 10000,
          vapidDetails: {
            subject: remetente(),
            publicKey: env.VAPID_PUBLIC_KEY,
            privateKey: env.VAPID_PRIVATE_KEY,
          },
        },
      );
      await finishDelivery(entrega, "sent");
      sent++;
    } catch (error) {
      if (
        typeof error === "object" &&
        error &&
        "statusCode" in error &&
        (error.statusCode === 410 || error.statusCode === 404)
      )
        await deletePushById(s.id);
      await finishDelivery(entrega, "failed");
      failed++;
    }
  }
  return { sent, failed };
}
