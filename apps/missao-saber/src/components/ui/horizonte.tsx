import { cn } from "@informach/ui/lib/utils";
import type { Olympiad } from "@/features/content/types";
import type { Tom } from "./chapa";

/**
 * Horizonte da trilha — o território de cada curso.
 *
 * As quatro trilhas tinham nomes de lugar ("Olhar de explorador", "Pensar além
 * da conta") e nenhum lugar: a jornada era uma lista sobre papel bege. Cada
 * curso passa a ter um horizonte próprio.
 *
 * É SVG paramétrico, não ilustração: nasce dos tokens da marca, escala sem
 * perda, não pesa no carregamento, não depende de direitos de terceiros e
 * acompanha qualquer tema. Fica sempre ATRÁS do conteúdo e com opacidade baixa
 * — território não pode competir com enunciado.
 *
 * Todas as coordenadas são fixas: nada de aleatório, que quebraria a
 * hidratação entre servidor e navegador.
 */

type Camadas = { longe: string; perto: string; detalhe: string };

const camadas: Record<Tom, Camadas> = {
  verde: {
    longe: "var(--ms-verde)",
    perto: "var(--ms-verde-fundo)",
    detalhe: "var(--ms-lima)",
  },
  uva: { longe: "var(--ms-uva)", perto: "var(--ms-uva-fundo)", detalhe: "var(--ms-lima)" },
  sol: { longe: "var(--ms-sol)", perto: "var(--ms-sol-fundo)", detalhe: "var(--ms-coral)" },
  ceu: { longe: "var(--ms-ceu)", perto: "var(--ms-ceu-fundo)", detalhe: "var(--ms-creme)" },
  coral: { longe: "var(--ms-coral)", perto: "var(--ms-coral-fundo)", detalhe: "var(--ms-sol)" },
  lima: { longe: "var(--ms-lima)", perto: "var(--ms-lima-fundo)", detalhe: "var(--ms-verde)" },
  creme: { longe: "var(--ms-sombra)", perto: "var(--ms-borda)", detalhe: "var(--ms-sombra)" },
};

/** Colinas: a base compartilhada das trilhas. */
function Colinas({ cor }: { cor: Camadas }) {
  return (
    <>
      <path
        d="M0 96 C120 58 240 58 360 88 C500 122 620 60 760 74 C900 88 1030 126 1200 92 V160 H0 Z"
        fill={cor.longe}
      />
      <path
        d="M0 126 C160 100 300 138 430 128 C580 116 700 146 850 132 C990 119 1100 148 1200 134 V160 H0 Z"
        fill={cor.perto}
      />
      <circle cx="980" cy="44" r="15" fill={cor.detalhe} />
    </>
  );
}

/** Céu de exploração: estrelas sobre dunas. */
function Estrelado({ cor }: { cor: Camadas }) {
  const estrelas = [
    [120, 40, 5],
    [300, 26, 3.5],
    [470, 52, 4],
    [690, 30, 5],
    [880, 48, 3],
    [1080, 34, 4.5],
  ] as const;
  return (
    <>
      <path
        d="M0 112 C180 76 340 120 520 104 C700 88 840 124 1010 100 C1110 86 1160 100 1200 96 V160 H0 Z"
        fill={cor.longe}
      />
      <path
        d="M0 140 C200 122 360 150 560 138 C760 126 930 152 1200 138 V160 H0 Z"
        fill={cor.perto}
      />
      {estrelas.map(([x, y, r]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill={cor.detalhe} />
      ))}
    </>
  );
}

/** Campo aberto: sol e talos, para as trilhas de contexto financeiro. */
function Campo({ cor }: { cor: Camadas }) {
  const talos = [80, 210, 340, 470, 600, 730, 860, 990, 1120];
  return (
    <>
      <circle cx="1060" cy="46" r="26" fill={cor.detalhe} />
      <path
        d="M0 108 C150 92 320 118 480 106 C650 94 820 120 1000 108 C1100 101 1160 108 1200 106 V160 H0 Z"
        fill={cor.longe}
      />
      {talos.map((x) => (
        <path
          key={x}
          d={`M${x} 150 V118 M${x} 128 l-9 -9 M${x} 128 l9 -9`}
          stroke={cor.perto}
          strokeWidth="4"
          strokeLinecap="round"
          fill="none"
        />
      ))}
      <path d="M0 148 H1200 V160 H0 Z" fill={cor.perto} />
    </>
  );
}

/** Ondas: a trilha das formas e dos padrões. */
function Ondas({ cor }: { cor: Camadas }) {
  return (
    <>
      <path
        d="M0 104 Q100 78 200 104 T400 104 T600 104 T800 104 T1000 104 T1200 104 V160 H0 Z"
        fill={cor.longe}
      />
      <path
        d="M0 126 Q100 102 200 126 T400 126 T600 126 T800 126 T1000 126 T1200 126 V160 H0 Z"
        fill={cor.perto}
      />
      <path
        d="M0 72 Q100 50 200 72 T400 72 T600 72 T800 72 T1000 72 T1200 72"
        stroke={cor.detalhe}
        strokeWidth="4"
        fill="none"
      />
    </>
  );
}

const desenhos: Record<Tom, (props: { cor: Camadas }) => React.ReactElement> = {
  verde: Colinas,
  uva: Estrelado,
  sol: Campo,
  ceu: Ondas,
  coral: Campo,
  lima: Colinas,
  creme: Colinas,
};

/**
 * Território de cada trilha. Fica aqui, e não no catálogo, porque é decisão de
 * apresentação: o catálogo descreve conteúdo, não paisagem. A mesma tabela
 * serve à página de venda e à jornada, para a criança reencontrar na trilha o
 * lugar que o responsável viu na landing.
 */
const tonsPorCurso: Record<string, Tom> = {
  "olitef-n1": "verde",
  "canguru-e": "uva",
  "canguru-b": "sol",
  "obmep-n1": "ceu",
};
const tonsPorOlimpiada: Record<Olympiad, Tom> = {
  olitef: "verde",
  obmep: "ceu",
  canguru: "uva",
  mirim: "lima",
};

/** As quatro trilhas originais mantêm a paisagem que a família já conhece;
    as demais herdam a cor da olimpíada, com os níveis B, C e S do Canguru em sol. */
export function tomDoCurso(course: { id: string; olympiad?: Olympiad; level?: string }): Tom {
  const fixo = tonsPorCurso[course.id];
  if (fixo) return fixo;
  if (course.olympiad === "canguru" && ["B", "C", "S"].includes(course.level ?? "")) return "sol";
  return course.olympiad ? tonsPorOlimpiada[course.olympiad] : "verde";
}

export function Horizonte({ tom = "verde", className }: { tom?: Tom; className?: string }) {
  const Desenho = desenhos[tom];
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 1200 160"
      preserveAspectRatio="none"
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-0 h-24 w-full sm:h-32",
        className,
      )}
    >
      <Desenho cor={camadas[tom]} />
    </svg>
  );
}
