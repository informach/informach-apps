import { env } from "./env";

export function rejectUnauthorizedCron(request: Request): Response | null {
  if (request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  return null;
}
