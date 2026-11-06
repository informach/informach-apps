export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export function assertAllowed(
  condition: unknown,
  code: string,
  message: string,
): asserts condition {
  if (!condition) throw new AppError(code, message);
}
