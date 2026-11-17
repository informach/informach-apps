import "server-only";
import { collectAgendaClosureSteps } from "@/lib/account";
import { executeAgendaClosure, prepareAgendaClosure } from "./closure-repository";

/** Internal until all seven domains and the central confirmation are verified. */
export function processAgendaClosures() {
  return collectAgendaClosureSteps({
    prepare: prepareAgendaClosure,
    execute: executeAgendaClosure,
  });
}
