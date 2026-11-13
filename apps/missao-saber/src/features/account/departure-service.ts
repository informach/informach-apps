import "server-only";
import { collectMissaoDepartureAssessments } from "@/lib/account";
import { assessMissaoDeparture } from "./departure-repository";

export function processMissaoDepartureReviews() {
  return collectMissaoDepartureAssessments(assessMissaoDeparture);
}
