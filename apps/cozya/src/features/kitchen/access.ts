import "server-only";
import { cache } from "react";
import { readKitchenAccess } from "@/features/billing/access-repository";
import { cozyaAuthority } from "@/features/family/context";

/** Request presentation. Domain mutations recheck coverage inside their transaction. */
export const getKitchenAccess = cache(async (userId: string) =>
  readKitchenAccess(await cozyaAuthority(userId)),
);
