import "server-only";
import { isActiveWebSession } from "@informach/auth/web-sessions";
import { FamilyError } from "@informach/family";
import { AppError } from "@/lib/errors";
import { reportError } from "@/lib/observability";
import type { PairingAuthority, PairingContext } from "./context";
import { capturePairingDelegations, pairingAvailable } from "./repository";

/** Reused by join, HTTP events and each SSE delivery; a credential never replaces live access. */
export async function mayUsePairing(authority: PairingAuthority) {
  try {
    if (
      !(await isActiveWebSession({
        userId: authority.actorId,
        sessionId: authority.sessionId,
        app: "bora-treinar",
      }))
    )
      return false;
    return await pairingAvailable(authority);
  } catch (error) {
    if (!(error instanceof FamilyError) && !(error instanceof AppError))
      reportError(error, crypto.randomUUID());
    return false;
  }
}

export async function preparePairingAuthority(context: PairingContext, sessionId: string) {
  try {
    const authority: PairingAuthority = {
      ...context,
      sessionId,
      delegations: await capturePairingDelegations(context),
    };
    return (await mayUsePairing(authority)) ? authority : null;
  } catch (error) {
    if (error instanceof FamilyError || error instanceof AppError) return null;
    throw error;
  }
}
