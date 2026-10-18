/** Esfera laranja com o "i", a marca da casa, e o nome Bastidores. */
export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center rounded-full bg-sphere font-extrabold text-night"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.52) }}
    >
      i
    </span>
  );
}

export function Brand({
  subtitle = "Informach · equipe",
  size = 34,
}: {
  subtitle?: string;
  size?: number;
}) {
  return (
    <span className="flex items-center gap-3">
      <BrandMark size={size} />
      <span className="grid leading-tight">
        <strong className="text-lg tracking-tight">Bastidores</strong>
        {subtitle ? <span className="text-xs text-night-muted">{subtitle}</span> : null}
      </span>
    </span>
  );
}
