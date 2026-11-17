import "server-only";
import { isRecentWebAuthentication } from "@informach/auth/web-sessions";
import { getServerSession } from "@/lib/auth";
import { purgeLegacyCozyaAi } from "./legacy-ai";
import { clearCozyaData, PendingAiCleanupError } from "./repository";

export async function eraseCozyaDataForCurrentUser() {
  const session = await getServerSession();
  if (!session?.user) return { ok: false, code: "UNAUTHORIZED" } as const;
  if (
    !(await isRecentWebAuthentication({
      userId: session.user.id,
      sessionId: session.session.id,
      app: "cozya",
      maxAgeSeconds: 900,
    }))
  )
    return { ok: false, code: "REAUTHENTICATE" } as const;
  await purgeLegacyCozyaAi(session.user.id);
  try {
    await clearCozyaData(session.user.id);
  } catch (error) {
    if (error instanceof PendingAiCleanupError)
      return { ok: false, code: "AI_CLEANUP_PENDING" } as const;
    throw error;
  }
  return { ok: true } as const;
}
