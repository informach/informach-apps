export type FamilyErrorCode =
  | "ACCESS_DENIED"
  | "INVALID_INPUT"
  | "CAPACITY_EXCEEDED"
  | "CONFLICT"
  | "INVITATION_INVALID"
  | "LAST_ADMINISTRATOR";

export class FamilyError extends Error {
  override name = "FamilyError";
  constructor(
    readonly code: FamilyErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export function requireFamilyCondition(
  condition: unknown,
  code: FamilyErrorCode = "ACCESS_DENIED",
  message = "Você não tem acesso a esta pessoa ou família.",
): asserts condition {
  if (!condition) throw new FamilyError(code, message);
}
