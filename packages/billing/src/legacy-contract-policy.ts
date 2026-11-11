/** Immutable acceptance semantics for this internal cutover. */
export const LEGACY_CONTRACT_POLICY_VERSION = "compasso-legacy-2026-11-10-v1";
export const LEGACY_OBSERVATION_MAX_AGE_MS = 5 * 60_000;
/** Terms shown to the two payers when a historical contract reaches a family
 * whose payer already has a Compasso commitment. */
export const LEGACY_COORDINATION_POLICY_VERSION = "compasso-coordination-2026-11-11-v1";
/** Provider effects are refused this close to the charge they would move. */
export const LEGACY_COORDINATION_MARGIN_MS = 900_000;
