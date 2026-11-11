import { FamilyError } from "@informach/family";

export class AgendaOriginalScopeError extends FamilyError {
  constructor() {
    super("CONFLICT", "Um recado original também pertence a outro perfil ou adulto.");
    this.name = "AgendaOriginalScopeError";
  }
}
