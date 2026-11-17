import "server-only";
import { processWebClosureSteps, type WebClosureAdapter } from "@informach/account/closure";
import {
  type DepartureAssessment,
  processDepartureAssessments,
} from "@informach/account/departure-reviews";
import { db } from "@informach/db";

export function collectEstrelaClosureSteps(adapter: WebClosureAdapter) {
  return processWebClosureSteps({ db, domain: "app:dia-de-estrela", adapter });
}

export function collectEstrelaDepartureAssessments(
  assess: (actorId: string) => Promise<DepartureAssessment>,
) {
  return processDepartureAssessments({ db, app: "dia-de-estrela", assess });
}
