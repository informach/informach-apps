import "server-only";
import { getServerSession } from "@/lib/auth";
import { purgeLegacyCozyaAi } from "./legacy-ai";
import { clearCozyaData, PendingAiCleanupError } from "./repository";

export async function eraseCozyaDataForCurrentUser() {
  const session = await getServerSession();
  if (!session?.user) return { ok: false, code: "UNAUTHORIZED" } as const;
  if (Date.now() - new Date(session.session.createdAt).getTime() > 15 * 60000)
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
