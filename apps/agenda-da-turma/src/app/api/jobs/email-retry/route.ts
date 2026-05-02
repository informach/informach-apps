import { db } from "@informach/db";
import { buildUnsubscribeToken, createSendGridSend, type EmailCategory } from "@informach/emails";
import { retryFailedDeliveries } from "@informach/emails/sweepers";
import { emailAudit } from "@/lib/emails";
import { env } from "@/lib/env";
import { packageLogger } from "@/lib/observability";

export const runtime = "nodejs";

const APP_HOSTNAME = new URL(env.NEXT_PUBLIC_APP_URL).hostname;
const send = createSendGridSend(env.SENDGRID_API_KEY);

export async function POST(request: Request): Promise<Response> {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await retryFailedDeliveries({
    db,
    defaultFrom: env.SENDGRID_FROM,
    send,
    buildUnsubscribeUrl: (identifier: string, category: EmailCategory) => {
      const token = buildUnsubscribeToken(env.BETTER_AUTH_SECRET, identifier, category);
      return `${env.NEXT_PUBLIC_APP_URL}/api/email/unsubscribe?t=${token}`;
    },
    unsubscribeMailto: `unsubscribe@${APP_HOSTNAME}`,
    logger: packageLogger,
    onAudit: emailAudit,
  });
  return Response.json(result);
}
