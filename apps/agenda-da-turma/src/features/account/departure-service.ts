import "server-only";
import { collectAgendaDepartureAssessments } from "@/lib/account";
import { assessAgendaDeparture } from "./departure-repository";

export function processAgendaDepartureReviews() {
  return collectAgendaDepartureAssessments(assessAgendaDeparture);
}
