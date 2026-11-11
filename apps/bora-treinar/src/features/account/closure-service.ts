import "server-only";
import { collectBoraClosureSteps } from "@/lib/account";
import { executeBoraClosure, prepareBoraClosure } from "./closure-repository";

/** Internal until all closure domains and the account interface are installed. */
export function processBoraClosures() {
  return collectBoraClosureSteps({ prepare: prepareBoraClosure, execute: executeBoraClosure });
}
