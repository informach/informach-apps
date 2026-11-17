import "server-only";
import { collectCozyaDepartureAssessments } from "@/lib/account";
import { assessCozyaDeparture } from "./departure-repository";

export function processCozyaDepartureReviews() {
  return collectCozyaDepartureAssessments(assessCozyaDeparture);
}
