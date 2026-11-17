import "server-only";
import { processWebClosureSteps, type WebClosureAdapter } from "@informach/account/closure";
import {
  type DepartureAssessment,
  processDepartureAssessments,
} from "@informach/account/departure-reviews";
import { db } from "@informach/db";

export function collectAgendaClosureSteps(adapter: WebClosureAdapter) {
  return processWebClosureSteps({ db, domain: "app:agenda-da-turma", adapter });
}

export function collectAgendaDepartureAssessments(
  assess: (actorId: string) => Promise<DepartureAssessment>,
) {
  return processDepartureAssessments({ db, app: "agenda-da-turma", assess });
}
