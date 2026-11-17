import type { Database } from "@informach/db";

export type FamilyTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type FamilyReader = Database | FamilyTransaction;
export type FamilyAction = "read" | "write" | "manage" | "use_ai";
export const FAMILY_ACTIONS: readonly FamilyAction[] = ["read", "write", "manage", "use_ai"];
export type FamilyServiceConfig = { db: Database; now?: () => Date };
export type PersonTarget = {
  groupId: string;
  personId: string;
  app: string;
  action: FamilyAction;
};
export type CreatePersonInput = {
  groupId: string;
  kind: "adult" | "dependent";
  displayName: string;
  color?: string;
  avatar?: string;
};
export type UpdatePersonInput = {
  groupId: string;
  personId: string;
  expectedVersion: number;
  displayName: string;
  color: string;
  avatar: string;
};
export type ProfileLinkInput = {
  groupId: string;
  personId: string;
  app: string;
};
export type GrantAccessInput = PersonTarget & { userId: string };
