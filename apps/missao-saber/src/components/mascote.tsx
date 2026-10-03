/**
 * Faísca — personagem autoral do Missão Saber.
 *
 * Desenhado a partir do foguete-livro da marca e das faíscas que já
 * apareciam na identidade. Não deriva de mascote de terceiros
 * (exigência da proposta do produto, §5).
 *
 * Cada expressão muda olhos, boca e faíscas; a silhueta continua a mesma
 * para o personagem seguir reconhecível em qualquer tela.
 */
export type Humor = "acolhendo" | "pensando" | "comemorando" | "encorajando" | "descansando";

const TAMANHOS = { pp: 56, p: 88, m: 132, g: 184 } as const;

function Estrela({ x, y, s, cor }: { x: number; y: number; s: number; cor: string }) {
  const q = s * 0.24;
  return (
    <path
      d={`M${x} ${y - s} Q${x + q} ${y - q} ${x + s} ${y} Q${x + q} ${y + q} ${x} ${y + s} Q${x - q} ${y + q} ${x - s} ${y} Q${x - q} ${y - q} ${x} ${y - s} Z`}
      fill={cor}
    />
  );
}

/** Olhos e boca por humor. A silhueta e as cores ficam fora daqui. */
function Rosto({ humor }: { humor: Humor }) {
  const tinta = "var(--ms-tinta)";
  if (humor === "descansando")
    return (
      <>
        <path
          d="M45 58 Q51 63 57 58 M63 58 Q69 63 75 58"
          stroke={tinta}
          strokeWidth="3.2"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M54 71 Q60 75 66 71"
          stroke={tinta}
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
      </>
    );
  if (humor === "comemorando")
    return (
      <>
        <path
          d="M45 61 Q51 53 57 61 M63 61 Q69 53 75 61"
          stroke={tinta}
          strokeWidth="3.4"
          strokeLinecap="round"
          fill="none"
        />
        <path d="M50 68 Q60 80 70 68 Q60 72 50 68 Z" fill={tinta} />
      </>
    );
  if (humor === "pensando")
    return (
      <>
        <circle cx="53" cy="57" r="4.2" fill={tinta} />
        <circle cx="70" cy="56" r="4.2" fill={tinta} />
        <circle cx="54.4" cy="55.4" r="1.5" fill="var(--ms-creme)" />
        <circle cx="71.4" cy="54.4" r="1.5" fill="var(--ms-creme)" />
        <circle cx="60" cy="72" r="3.4" fill="none" stroke={tinta} strokeWidth="2.8" />
      </>
    );
  if (humor === "encorajando")
    return (
      <>
        <circle cx="52" cy="59" r="4.6" fill={tinta} />
        <circle cx="68" cy="59" r="4.6" fill={tinta} />
        <circle cx="53.6" cy="57.4" r="1.6" fill="var(--ms-creme)" />
        <circle cx="69.6" cy="57.4" r="1.6" fill="var(--ms-creme)" />
        <path
          d="M52 71 Q60 76 68 71"
          stroke={tinta}
          strokeWidth="3.2"
          strokeLinecap="round"
          fill="none"
        />
      </>
    );
  return (
    <>
      <circle cx="52" cy="58" r="5" fill={tinta} />
      <circle cx="68" cy="58" r="5" fill={tinta} />
      <circle cx="53.8" cy="56.2" r="1.8" fill="var(--ms-creme)" />
      <circle cx="69.8" cy="56.2" r="1.8" fill="var(--ms-creme)" />
      <path
        d="M51 70 Q60 78 69 70"
        stroke={tinta}
        strokeWidth="3.2"
        strokeLinecap="round"
        fill="none"
      />
    </>
  );
}

export function Mascote({
  humor = "acolhendo",
  tamanho = "m",
  flutua = true,
  className = "",
}: {
  humor?: Humor;
  tamanho?: keyof typeof TAMANHOS;
  flutua?: boolean;
  className?: string;
}) {
  const px = TAMANHOS[tamanho];
  const inclina = humor === "comemorando" ? "-6deg" : humor === "pensando" ? "4deg" : "0deg";
  return (
    <svg
      data-study-decoration="mascot"
      viewBox="0 0 120 120"
      width={px}
      height={px}
      role="img"
      aria-label={rotulo(humor)}
      className={`${flutua ? "motion-safe:animate-flutuar" : ""} shrink-0 ${className}`}
      style={{ rotate: inclina }}
    >
      <title>{rotulo(humor)}</title>
      {/* corpo: foguete-semente */}
      <path d="M32 74 C20 79 16 90 20 100 C29 96 34 89 35 83 Z" fill="var(--ms-verde-fundo)" />
      <path d="M88 74 C100 79 104 90 100 100 C91 96 86 89 85 83 Z" fill="var(--ms-verde-fundo)" />
      <path
        d="M60 14 C78 31 90 50 90 68 A30 30 0 0 1 30 68 C30 50 42 31 60 14 Z"
        fill="var(--ms-verde)"
        stroke="var(--ms-verde-fundo)"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      {/* visor */}
      <ellipse
        cx="60"
        cy="62"
        rx="23"
        ry="21"
        fill="var(--ms-creme)"
        stroke="var(--ms-verde-fundo)"
        strokeWidth="2.5"
      />
      <ellipse cx="45" cy="70" rx="5" ry="3.4" fill="var(--ms-coral)" opacity="0.55" />
      <ellipse cx="75" cy="70" rx="5" ry="3.4" fill="var(--ms-coral)" opacity="0.55" />
      <Rosto humor={humor} />
      {/* estrela da marca no topo */}
      <Estrela x={60} y={26} s={7} cor="var(--ms-lima)" />
      {/* faíscas ao redor, conforme o humor */}
      {humor === "comemorando" && (
        <>
          <Estrela x={16} y={30} s={7} cor="var(--ms-sol)" />
          <Estrela x={104} y={26} s={8} cor="var(--ms-lima)" />
          <Estrela x={98} y={52} s={5} cor="var(--ms-coral)" />
        </>
      )}
      {humor === "acolhendo" && <Estrela x={100} y={34} s={6} cor="var(--ms-lima)" />}
      {humor === "encorajando" && <Estrela x={18} y={38} s={6} cor="var(--ms-sol)" />}
      {humor === "pensando" && (
        <>
          <circle cx="98" cy="40" r="3.6" fill="var(--ms-uva)" opacity="0.8" />
          <circle cx="107" cy="30" r="5" fill="var(--ms-uva)" opacity="0.55" />
        </>
      )}
      {humor === "descansando" && (
        <>
          <text x="93" y="36" fontSize="15" fontWeight="700" fill="var(--ms-uva)">
            z
          </text>
          <text x="104" y="24" fontSize="11" fontWeight="700" fill="var(--ms-uva)">
            z
          </text>
        </>
      )}
    </svg>
  );
}

function rotulo(humor: Humor) {
  if (humor === "comemorando") return "Faísca comemorando";
  if (humor === "pensando") return "Faísca pensando";
  if (humor === "encorajando") return "Faísca incentivando";
  if (humor === "descansando") return "Faísca descansando";
  return "Faísca, o explorador do Missão Saber";
}
