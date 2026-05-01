export type GuardrailResult = { ok: true } | { ok: false; reason: string };

export function passthroughGuardrail(): GuardrailResult {
  return { ok: true };
}
