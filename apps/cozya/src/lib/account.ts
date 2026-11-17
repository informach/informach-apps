import "server-only";
import { processWebClosureSteps, type WebClosureAdapter } from "@informach/account/closure";
import {
  type DepartureAssessment,
  processDepartureAssessments,
} from "@informach/account/departure-reviews";
import { db } from "@informach/db";

export function collectCozyaClosureSteps(adapter: WebClosureAdapter) {
  return processWebClosureSteps({ db, domain: "app:cozya", adapter });
}

export function collectCozyaDepartureAssessments(
  assess: (actorId: string) => Promise<DepartureAssessment>,
) {
  return processDepartureAssessments({ db, app: "cozya", assess });
}
