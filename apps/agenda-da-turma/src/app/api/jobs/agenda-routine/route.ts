import { deliverRoutineNotifications } from "@/features/notifications/delivery";
import { rejectUnauthorizedCron } from "@/lib/cron-auth";
import { recordJob } from "@/lib/job-runs";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request) {
  const unauthorized = rejectUnauthorizedCron(request);
  if (unauthorized) return unauthorized;
  const cursor = new URL(request.url).searchParams.get("cursor");
  if (cursor && (cursor.length > 128 || !/^[\w-]+$/.test(cursor)))
    return Response.json({ error: "INVALID_CURSOR" }, { status: 400 });
  const result = await recordJob("agenda-routine", () =>
    deliverRoutineNotifications(new Date(), { afterUserId: cursor }),
  );
  return Response.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}
