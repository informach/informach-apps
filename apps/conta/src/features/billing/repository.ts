import "server-only";
import { enqueueCompassoBillingEvent } from "@informach/billing/collection-jobs";
import {
  familyHasAnotherPayer,
  getCompassoPayerAccount,
  getCompassoWalletHistory,
  listCompassoPayerAccounts,
} from "@informach/billing/compasso-account";
import { listLegacyCreditWallets } from "@informach/billing/credit-migration";
import {
  familyHasAcceptedLegacyContract,
  listLegacyContracts,
} from "@informach/billing/legacy-contracts";
import { activeLegacyCoordination } from "@informach/billing/legacy-coordination";
import { activeLegacyFutureIntent } from "@informach/billing/legacy-future-contract";
import { db } from "@informach/db";
export const coordination = (actorId: string, accountId: string) =>
  activeLegacyCoordination(db, actorId, accountId);
export const legacyWallets = (actorId: string) => listLegacyCreditWallets(db, actorId);
export const legacyContracts = (actorId: string, groupId: string) =>
  listLegacyContracts(db, actorId, groupId);
export const legacyFamilyEligible = (actorId: string, groupId: string) =>
  familyHasAcceptedLegacyContract(db, actorId, groupId);
export const futureContract = (actorId: string, accountId: string) =>
  activeLegacyFutureIntent(db, actorId, accountId);
export const payerAccounts = (actorId: string, before?: string) =>
  listCompassoPayerAccounts(db, actorId, before);
export const payerAccount = (actorId: string, accountId: string) =>
  getCompassoPayerAccount(db, actorId, accountId);
export const walletHistory = (actorId: string, groupId: string, before?: number) =>
  getCompassoWalletHistory(db, actorId, groupId, before);
export const anotherPayer = (actorId: string, groupId: string) =>
  familyHasAnotherPayer(db, actorId, groupId);
export const enqueueEvent = (event: Parameters<typeof enqueueCompassoBillingEvent>[1]) =>
  enqueueCompassoBillingEvent(db, event);
