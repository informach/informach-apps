export function Avatar({
  profile,
  size,
}: {
  profile: { name: string; color: string };
  size?: string;
}) {
  return (
    <span
      className="avatar"
      aria-hidden="true"
      style={{
        background: profile.color,
        width: size,
        height: size,
        fontSize: size ? `calc(${size} * 0.42)` : undefined,
      }}
    >
      {profile.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export const fmtTime = (s: number) => {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
};
