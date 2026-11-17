import "server-only";
import {
  beginWebClosure,
  type ClosureActor,
  confirmWebClosure,
  readCurrentWebClosure,
  refreshWebClosurePreparation,
  reprepareWebClosureRemainder,
  requestWebClosureResumption,
} from "@informach/account/closure";
import { readWebParticipation } from "@informach/auth/web-participation";
import { db } from "@informach/db";

export const accountParticipation = (actorId: string) => readWebParticipation(db, actorId);
export const currentClosure = (actor: ClosureActor) => readCurrentWebClosure(db, actor);
export const beginClosure = (actor: ClosureActor, reviewId: string) =>
  beginWebClosure(db, actor, reviewId);
export const confirmClosure = (actor: ClosureActor, id: string, digest: string) =>
  confirmWebClosure(db, actor, id, digest);
export const refreshClosure = (actor: ClosureActor, id: string) =>
  refreshWebClosurePreparation(db, actor, id);
export const reprepareClosure = (actor: ClosureActor, id: string) =>
  reprepareWebClosureRemainder(db, actor, id);
export const resumeClosure = (actor: ClosureActor, id: string) =>
  requestWebClosureResumption(db, actor, id);
