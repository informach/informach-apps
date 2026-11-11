import "server-only";
import { processWebClosureSteps, type WebClosureAdapter } from "@informach/account/closure";
import {
  type DepartureAssessment,
  processDepartureAssessments,
} from "@informach/account/departure-reviews";
import { db } from "@informach/db";

export function collectMissaoClosureSteps(adapter: WebClosureAdapter) {
  return processWebClosureSteps({ db, domain: "app:missao-saber", adapter });
}

export function collectMissaoDepartureAssessments(
  assess: (actorId: string) => Promise<DepartureAssessment>,
) {
  return processDepartureAssessments({ db, app: "missao-saber", assess });
}
