import { exportCozyaData } from "@/features/account/repository";
import { getServerSession } from "@/lib/auth";
import { enforceRateLimit, RateLimitedError } from "@/lib/rate-limit";

export async function GET() {
  const session = await getServerSession();
  if (!session?.user) return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
  try {
    await enforceRateLimit({
      key: `account-export:${session.user.id}`,
      limit: 5,
      windowSeconds: 3600,
    });
  } catch (error) {
    if (error instanceof RateLimitedError)
      return Response.json({ code: "RATE_LIMITED" }, { status: 429 });
    throw error;
  }
  return Response.json(await exportCozyaData(session.user.id), {
    headers: {
      "Content-Disposition": 'attachment; filename="minhas-receitas-cozya.json"',
      "Cache-Control": "no-store",
    },
  });
}
