import "server-only";

/** Never serialize provider errors: they may contain authorization codes or personal data. */
export function reportOperationalError(operation: string, _error?: unknown) {
  console.error(JSON.stringify({ app: "conta", operation, level: "error" }));
}
