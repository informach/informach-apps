import { cn } from "@informach/ui/lib/utils";

/**
 * O conjunto pequeno de ilustrações do app.
 *
 * Todo estado vazio era um ícone do Lucide dentro de um círculo a 10% — a
 * mesma forma para "acabou bem", "ainda não começou" e "deu errado". Estes
 * desenhos separam esses três momentos, e são SVG inline de propósito: sem
 * dependência nova, sem requisição, e as cores saem dos tokens (`var(--chart-N)`,
 * `var(--muted-foreground)`), então acompanham o tema claro e o escuro sozinhas.
 *
 * Mantenha o conjunto pequeno. Uma ilustração por momento que a família
 * realmente vive; não uma por tela.
 */

type IllustrationProps = {
  className?: string;
};

const BASE = "h-auto w-full max-w-[220px]";

/**
 * Dia fechado: tudo o que precisava de cuidado hoje foi cuidado.
 * O sol baixo e a linha de horizonte dizem "acabou", não "está vazio".
 */
export function DayClosedIllustration({ className }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 220 140"
      className={cn(BASE, className)}
      role="img"
      aria-label="Ilustração de fim de dia tranquilo"
    >
      <title>Fim de dia tranquilo</title>
      <circle cx="110" cy="92" r="34" fill="var(--chart-4)" opacity="0.22" />
      <circle cx="110" cy="92" r="22" fill="var(--chart-4)" opacity="0.55" />
      {[0, 45, 90, 135].map((deg) => (
        <line
          key={deg}
          x1="110"
          y1="92"
          x2={110 + 44 * Math.cos((deg * Math.PI) / 180)}
          y2={92 - 44 * Math.sin((deg * Math.PI) / 180)}
          stroke="var(--chart-4)"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.4"
        />
      ))}
      <path
        d="M14 110 H206"
        stroke="var(--muted-foreground)"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.35"
      />
      <path
        d="M52 110 q14 -30 30 -30 q10 0 14 8 q6 -16 20 -16 q18 0 22 22 q2 8 -2 16"
        fill="var(--chart-2)"
        opacity="0.28"
      />
      <path
        d="M88 66 l9 9 l18 -20"
        fill="none"
        stroke="var(--chart-2)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Ainda não há nada: a prateleira montada, esperando.
 * Diferente de "acabou bem" — aqui falta alguém trazer a primeira coisa.
 */
export function NothingYetIllustration({ className }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 220 140"
      className={cn(BASE, className)}
      role="img"
      aria-label="Ilustração de lista ainda sem itens"
    >
      <title>Lista ainda sem itens</title>
      <rect x="38" y="26" width="144" height="92" rx="14" fill="var(--chart-1)" opacity="0.12" />
      <rect
        x="38"
        y="26"
        width="144"
        height="92"
        rx="14"
        fill="none"
        stroke="var(--chart-1)"
        strokeWidth="2.5"
        strokeDasharray="7 7"
        opacity="0.5"
      />
      {[54, 76, 98].map((y, i) => (
        <g key={y}>
          <circle cx="62" cy={y} r="6" fill="var(--chart-1)" opacity={0.45 - i * 0.12} />
          <rect
            x="78"
            y={y - 5}
            width={84 - i * 22}
            height="10"
            rx="5"
            fill="var(--muted-foreground)"
            opacity={0.3 - i * 0.07}
          />
        </g>
      ))}
      <circle cx="168" cy="106" r="19" fill="var(--primary)" opacity="0.18" />
      <path
        d="M168 97 v18 M159 106 h18"
        stroke="var(--primary)"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Sem conexão: o app está aqui, a rede não.
 * Usado quando a família abre no corredor da escola e o sinal some.
 */
export function OfflineIllustration({ className }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 220 140"
      className={cn(BASE, className)}
      role="img"
      aria-label="Ilustração de aparelho sem conexão"
    >
      <title>Sem conexão</title>
      <rect x="76" y="20" width="68" height="104" rx="12" fill="var(--chart-3)" opacity="0.14" />
      <rect
        x="76"
        y="20"
        width="68"
        height="104"
        rx="12"
        fill="none"
        stroke="var(--chart-3)"
        strokeWidth="2.5"
        opacity="0.55"
      />
      {[0, 1, 2].map((i) => (
        <path
          key={i}
          d={`M110 ${96 - i * 16} m-${14 + i * 12} 0 a${14 + i * 12} ${14 + i * 12} 0 0 1 ${28 + i * 24} 0`}
          fill="none"
          stroke="var(--chart-3)"
          strokeWidth="4"
          strokeLinecap="round"
          opacity={0.5 - i * 0.14}
        />
      ))}
      <circle cx="110" cy="100" r="5" fill="var(--chart-3)" opacity="0.7" />
      <path d="M56 18 L164 126" stroke="var(--destructive)" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}
