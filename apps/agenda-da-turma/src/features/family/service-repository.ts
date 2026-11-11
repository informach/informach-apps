import "server-only";
import { db } from "@informach/db";
import { createFamilyService } from "@informach/family";
export const familyService = createFamilyService({ db });
