import "server-only";
import { collectMissaoClosureSteps } from "@/lib/account";
import { executeMissaoClosure, prepareMissaoClosure } from "./closure-repository";

export function processMissaoClosures() {
  return collectMissaoClosureSteps({
    prepare: prepareMissaoClosure,
    execute: executeMissaoClosure,
  });
}
