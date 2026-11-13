import "server-only";
import { logAuditEventStrict, UnauthorizedError } from "@informach/auth";
import { enforceRateLimit } from "@informach/auth/server-actions";
import { isRecentCentralAuthentication } from "@informach/auth/web-sessions";
import { createAccountExport } from "@/lib/account";
import { getAuth } from "@/lib/auth";

export async function prepareAccountExport(request: Request) {
  const session = await getAuth().getSession(request.headers);
  if (!session?.user.emailVerified) throw new UnauthorizedError();
  const actorId = session.user.id;
  const sessionId = session.session.id;
  async function authorize() {
    if (!(await isRecentCentralAuthentication(actorId, sessionId, 900)))
      throw new UnauthorizedError();
  }
  await authorize();
  await enforceRateLimit({ key: `conta:privacy:export:${actorId}`, max: 4, window: "1h" });
  await logAuditEventStrict("user.data_export_started", actorId, { scope: "compasso-account" });
  return createAccountExport({ actorId, authorize, signal: request.signal }, () =>
    logAuditEventStrict("user.data_export_completed", actorId, { scope: "compasso-account" }),
  );
}
