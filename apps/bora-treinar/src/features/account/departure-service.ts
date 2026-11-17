import "server-only";
import { collectBoraDepartureAssessments } from "@/lib/account";
import { assessBoraDeparture } from "./departure-repository";

export function processBoraDepartureReviews() {
  return collectBoraDepartureAssessments(assessBoraDeparture);
}
