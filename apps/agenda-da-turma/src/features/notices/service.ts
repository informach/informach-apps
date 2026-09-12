import "server-only";
import { err } from "@informach/auth/server-actions";
import type { z } from "zod";
import { findAccessibleProfile } from "@/features/family/access";
import { billing } from "@/lib/billing";
import { getNoticeAction } from "./repository";
import type {
  confirmNoticeSchema,
  statusNoticeActionSchema,
  updateNoticeActionSchema,
} from "./schemas";
import {
  insertConfirmedNotice,
  setNoticeActionStatusAtomically,
  updateNoticeActionAtomically,
} from "./write-repository";

export async function confirmNotice(userId: string, input: z.infer<typeof confirmNoticeSchema>) {
  const first = input.actions[0];
  if (!first) return err({ code: "INVALID_INPUT" } as const);
  const profile = await findAccessibleProfile(userId, first.profileId);
  if (!profile) return err({ code: "INVALID_PROFILE" } as const);
  const isPro = await billing.hasProSubscription({ type: "user", id: profile.userId });
  return insertConfirmedNotice(userId, input, profile.userId, isPro);
}
export async function updateNoticeAction(
  userId: string,
  input: z.infer<typeof updateNoticeActionSchema>,
) {
  const found = await getNoticeAction(userId, input.id);
  if (!found) return err({ code: "NOT_FOUND" } as const);
  const isPro = await billing.hasProSubscription({ type: "user", id: found.ownerUserId });
  return updateNoticeActionAtomically(userId, input, found.ownerUserId, isPro);
}
export async function setNoticeActionStatus(
  userId: string,
  input: z.infer<typeof statusNoticeActionSchema>,
) {
  const found = await getNoticeAction(userId, input.id);
  if (!found) return err({ code: "NOT_FOUND" } as const);
  const isPro = await billing.hasProSubscription({ type: "user", id: found.ownerUserId });
  return setNoticeActionStatusAtomically(userId, input, found.ownerUserId, isPro);
}
