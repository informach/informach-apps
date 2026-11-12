/**
 * Desenhos do portal, todos em SVG feito à mão: o repositório não leva arte
 * licenciada, e o portal precisa ficar inteiro sem ela.
 */

/** A marca: o sol com o "tocar" dentro, e o ponto coral do "Seu lugar de jogar." */
export function Simbolo({ tamanho = 32 }: { tamanho?: number }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
    >
      <circle cx="30" cy="30" r="26" fill="var(--rc-sol)" />
      <path
        d="M25 19 L43 30 L25 41 Z"
        fill="var(--rc-fundo)"
        stroke="var(--rc-fundo)"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <circle cx="55" cy="55" r="7" fill="var(--rc-coral)" />
    </svg>
  );
}

export function Marca({ tamanho = 32 }: { tamanho?: number }) {
  return (
    <span className="flex items-center gap-2.5">
      <Simbolo tamanho={tamanho} />
      <span className="font-display text-2xl leading-none font-extrabold tracking-tight">
        Recreio
      </span>
    </span>
  );
}

/**
 * Capa provisória do Morada: uma casa de noite, com a janela acesa. Fica no
 * lugar da imagem do jogo até a arte de verdade entrar pelo empacotador.
 */
export function CapaMorada({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 240"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {/* céu em faixas, sem gradiente com id: a capa pode aparecer mais de uma vez na página */}
      <rect width="400" height="240" fill="#1b2152" />
      <rect y="96" width="400" height="144" fill="#262c68" />
      <rect y="150" width="400" height="90" fill="#33397f" />
      <circle cx="318" cy="58" r="26" fill="#ffc233" />
      <circle cx="306" cy="52" r="26" fill="#1b2152" />
      <g fill="#eef0ff">
        <circle cx="52" cy="40" r="2" />
        <circle cx="118" cy="26" r="1.5" />
        <circle cx="176" cy="58" r="2" />
        <circle cx="238" cy="30" r="1.5" />
        <circle cx="366" cy="112" r="1.5" />
        <circle cx="84" cy="86" r="1.5" />
      </g>
      <path d="M0 190 Q100 150 200 182 T400 170 V240 H0 Z" fill="#161a3d" />
      <path d="M0 212 Q120 186 240 208 T400 200 V240 H0 Z" fill="#0f1226" />
      <g>
        <path d="M118 150 L200 92 L282 150 Z" fill="#ff7a76" />
        <rect x="246" y="100" width="16" height="30" fill="#ff7a76" />
        <rect x="132" y="150" width="136" height="62" fill="#2d3463" />
        <rect x="150" y="164" width="34" height="30" rx="3" fill="#ffc233" />
        <path d="M167 164 V194 M150 179 H184" stroke="#2d3463" strokeWidth="3" />
        <rect x="212" y="170" width="28" height="42" rx="3" fill="#3fd0c3" />
        <circle cx="234" cy="192" r="2.5" fill="#0f1226" />
      </g>
      <g fill="#1f2a5c">
        <rect x="318" y="176" width="8" height="34" />
        <circle cx="322" cy="166" r="22" />
        <rect x="62" y="184" width="6" height="26" />
        <circle cx="65" cy="176" r="16" />
      </g>
    </svg>
  );
}
