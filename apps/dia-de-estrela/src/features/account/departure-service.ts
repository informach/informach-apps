import "server-only";
import { collectEstrelaDepartureAssessments } from "@/lib/account";
import { assessEstrelaDeparture } from "./departure-repository";

export function processEstrelaDepartureReviews() {
  return collectEstrelaDepartureAssessments(assessEstrelaDeparture);
}
