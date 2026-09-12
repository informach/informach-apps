import { deliverRoutineNotifications } from "@/features/notifications/delivery";
import { rejectUnauthorizedCron } from "@/lib/cron-auth";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request) {
  const unauthorized = rejectUnauthorizedCron(request);
  if (unauthorized) return unauthorized;
  const cursor = new URL(request.url).searchParams.get("cursor");
  if (cursor && (cursor.length > 128 || !/^[\w-]+$/.test(cursor)))
    return Response.json({ error: "INVALID_CURSOR" }, { status: 400 });
  return Response.json(await deliverRoutineNotifications(new Date(), { afterUserId: cursor }), {
    headers: { "Cache-Control": "no-store" },
  });
}
