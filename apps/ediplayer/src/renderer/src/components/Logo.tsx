/** EdiPlayer's mark: the play button crossed by a cut (same drawing as the Windows icon). */
export function Logo({ size = 22, cut = true }: { size?: number; cut?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="var(--accent)" />
      <polygon points="9 6.5 18 12 9 17.5" fill="var(--on-accent)" />
      {cut && (
        <line x1="9.5" y1="16.8" x2="15.6" y2="7.6" stroke="var(--accent)" strokeWidth="1.6" />
      )}
    </svg>
  );
}
