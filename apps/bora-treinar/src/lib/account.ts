import "server-only";
import { processWebClosureSteps, type WebClosureAdapter } from "@informach/account/closure";
import {
  type DepartureAssessment,
  processDepartureAssessments,
} from "@informach/account/departure-reviews";
import { db } from "@informach/db";

export function collectBoraClosureSteps(adapter: WebClosureAdapter) {
  return processWebClosureSteps({ db, domain: "app:bora-treinar", adapter });
}

export function collectBoraDepartureAssessments(
  assess: (actorId: string) => Promise<DepartureAssessment>,
) {
  return processDepartureAssessments({ db, app: "bora-treinar", assess });
}
