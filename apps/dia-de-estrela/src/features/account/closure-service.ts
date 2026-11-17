import "server-only";
import { collectEstrelaClosureSteps } from "@/lib/account";
import { executeEstrelaClosure, prepareEstrelaClosure } from "./closure-repository";

/** Internal until the central confirmation and all domain workers are installed. */
export function processEstrelaClosures() {
  return collectEstrelaClosureSteps({
    prepare: prepareEstrelaClosure,
    execute: executeEstrelaClosure,
  });
}
