import "server-only";
import { DepartureReviewError } from "@informach/account/departure-reviews";
import { logAuditEventStrict, UnauthorizedError } from "@informach/auth";
import { enforceRateLimit } from "@informach/auth/server-actions";
import { isRecentCentralAuthentication } from "@informach/auth/web-sessions";
import { inspectDeparture, readAppDepartureReview, requestAppDepartureReview } from "@/lib/account";
import { getAuth } from "@/lib/auth";

export async function departureAuthorization(headers: Headers) {
  const session = await getAuth().getSession(headers);
  if (!session?.user.emailVerified) throw new UnauthorizedError();
  const actorId = session.user.id;
  const authorize = async () => {
    if (!(await isRecentCentralAuthentication(actorId, session.session.id, 900)))
      throw new UnauthorizedError();
  };
  await authorize();
  return { actorId, sessionId: session.session.id, authorize };
}

export async function requestDepartureAssessment(headers: Headers, refresh: boolean) {
  const { actorId, authorize } = await departureAuthorization(headers);
  await enforceRateLimit({ key: `conta:privacy:assessment:${actorId}`, max: 6, window: "1h" });
  const reviewId = await requestAppDepartureReview(actorId, refresh);
  await authorize();
  await logAuditEventStrict("user.closure_reviewed", actorId, { scope: "compasso-web" });
  await authorize();
  return reviewId;
}

export async function loadDepartureReview(headers: Headers, assessmentId?: string) {
  const { actorId, authorize } = await departureAuthorization(headers);
  await enforceRateLimit({ key: `conta:privacy:review:${actorId}`, max: 20, window: "1h" });
  const records = [];
  for await (const record of inspectDeparture({ actorId, authorize })) records.push(record);
  let appAssessment: Awaited<ReturnType<typeof readAppDepartureReview>> | null = null;
  if (assessmentId) {
    try {
      appAssessment = await readAppDepartureReview(actorId, assessmentId);
    } catch (error) {
      if (!(error instanceof DepartureReviewError && error.code === "not-found")) throw error;
    }
  }
  await authorize();
  await logAuditEventStrict("user.closure_reviewed", actorId, { scope: "compasso-web" });
  await authorize();
  return { records, appAssessment, observedAt: new Date() };
}
