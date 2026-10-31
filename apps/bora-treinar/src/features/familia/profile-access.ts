export type ProfileAccessCandidate = {
  id: string;
  accessEnabled: boolean;
};

/**
 * Family plans include every stored profile (up to the commercial limit).
 * One-profile plans honor the parent's retained-profile choice. A fallback to
 * the first profile keeps pre-migration or partially written data usable.
 */
export function allowedProfileIds(profiles: ProfileAccessCandidate[], limit: number) {
  if (limit > 1) return profiles.slice(0, limit).map((profile) => profile.id);
  const preferred = profiles.filter((profile) => profile.accessEnabled);
  return (preferred.length ? preferred : profiles).slice(0, limit).map((profile) => profile.id);
}
