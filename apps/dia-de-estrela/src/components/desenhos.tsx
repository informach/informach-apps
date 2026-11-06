/** Desenhos da marca: a Lumi, a estrela, o baú do dia e o porquinho. SVG puro, decorativo. */

const PONTAS =
  "M100 20 L124.7 71 L180.8 78.7 L140 118 L150 173.8 L100 147 L50 173.8 L60 118 L19.2 78.7 L75.3 71 Z";

export function Lumi({
  tamanho = 96,
  humor = "contente",
  className,
}: {
  tamanho?: number;
  humor?: "contente" | "feliz" | "calma";
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 200 200"
      width={tamanho}
      height={tamanho}
      aria-hidden="true"
      className={className}
    >
      <g transform="translate(0,8)">
        <path d={PONTAS} fill="#E5A300" stroke="#E5A300" strokeWidth="22" strokeLinejoin="round" />
      </g>
      <path d={PONTAS} fill="#FFC22E" stroke="#FFC22E" strokeWidth="22" strokeLinejoin="round" />
      <path
        d="M60 82 Q64 72 76 70"
        stroke="#FFE08A"
        strokeWidth="7"
        fill="none"
        strokeLinecap="round"
      />
      {humor === "feliz" ? (
        <>
          <path
            d="M76 100 Q84 90 92 100"
            fill="none"
            stroke="#1F2D45"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <path
            d="M108 100 Q116 90 124 100"
            fill="none"
            stroke="#1F2D45"
            strokeWidth="6"
            strokeLinecap="round"
          />
        </>
      ) : (
        <>
          <ellipse cx="84" cy="100" rx="8" ry="11" fill="#1F2D45" />
          <ellipse cx="116" cy="100" rx="8" ry="11" fill="#1F2D45" />
          <circle cx="87" cy="96" r="3" fill="#FFFFFF" />
          <circle cx="119" cy="96" r="3" fill="#FFFFFF" />
        </>
      )}
      <circle cx="70" cy="119" r="7" fill="#FF8A6B" opacity=".55" />
      <circle cx="130" cy="119" r="7" fill="#FF8A6B" opacity=".55" />
      {humor === "feliz" ? (
        <path d="M84 114 Q100 140 116 114 Z" fill="#1F2D45" />
      ) : humor === "calma" ? (
        <path
          d="M90 120 Q100 128 110 120"
          fill="none"
          stroke="#1F2D45"
          strokeWidth="5"
          strokeLinecap="round"
        />
      ) : (
        <path
          d="M88 118 Q100 132 112 118"
          fill="none"
          stroke="#1F2D45"
          strokeWidth="5"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

export function Estrela({ tamanho = 24, className }: { tamanho?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={tamanho}
      height={tamanho}
      aria-hidden="true"
      className={className}
    >
      <polygon
        points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
        fill="#FFC22E"
        stroke="#E5A300"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Bau({ largura = 72, aberto = false }: { largura?: number; aberto?: boolean }) {
  return (
    <svg viewBox="0 0 96 80" width={largura} height={(largura * 80) / 96} aria-hidden="true">
      <rect x="6" y="30" width="84" height="44" rx="10" fill="#B86A2A" />
      <rect x="6" y="30" width="84" height="12" fill="#9A5520" />
      {aberto ? (
        <>
          <path d="M6 30 Q10 0 48 2 Q86 0 90 30 Z" fill="#D9853C" transform="translate(0,-14)" />
          <circle cx="36" cy="24" r="6" fill="#FFC22E" />
          <circle cx="52" cy="20" r="7" fill="#FFE08A" />
          <circle cx="64" cy="26" r="5" fill="#FFC22E" />
        </>
      ) : (
        <path d="M6 32 Q6 8 48 8 Q90 8 90 32 Z" fill="#D9853C" />
      )}
      <rect x="40" y="30" width="16" height="20" rx="4" fill="#FFC22E" />
      <rect x="6" y="66" width="84" height="8" rx="4" fill="#8A4B1A" />
    </svg>
  );
}

export function Porquinho({ largura = 160 }: { largura?: number }) {
  return (
    <svg viewBox="0 0 160 130" width={largura} height={(largura * 130) / 160} aria-hidden="true">
      <circle cx="80" cy="14" r="12" fill="#FFC22E" stroke="#E5A300" strokeWidth="3" />
      <path
        d="M20 70 q-14 -2 -10 -16"
        fill="none"
        stroke="#F598B1"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <rect x="40" y="98" width="18" height="26" rx="7" fill="#F598B1" />
      <rect x="100" y="98" width="18" height="26" rx="7" fill="#F598B1" />
      <path d="M50 40 L58 16 L76 34 Z" fill="#F598B1" />
      <ellipse cx="80" cy="74" rx="60" ry="46" fill="#FFB3C7" />
      <rect x="64" y="30" width="32" height="7" rx="3.5" fill="#D9728F" />
      <ellipse cx="136" cy="78" rx="16" ry="14" fill="#F598B1" />
      <circle cx="131" cy="78" r="3" fill="#C2557A" />
      <circle cx="141" cy="78" r="3" fill="#C2557A" />
      <circle cx="108" cy="60" r="6" fill="#1F2D45" />
      <circle cx="110" cy="58" r="2" fill="#FFFFFF" />
      <circle cx="112" cy="84" r="7" fill="#FF8A8A" opacity=".5" />
    </svg>
  );
}
