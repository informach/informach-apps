import "server-only";

import { cache } from "react";
import { getKitchenAccess } from "@/features/kitchen/access";

export const getIsProForUser = cache(
  async (userId: string) => (await getKitchenAccess(userId)).unlimitedRecipes,
);
