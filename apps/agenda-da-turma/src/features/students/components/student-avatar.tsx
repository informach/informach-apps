import { Avatar, AvatarFallback } from "@informach/ui/components/avatar";
import { cn } from "@informach/ui/lib/utils";
import { getSubjectAvatarClassByIndex } from "@/features/subjects/utils";
import { getAvatarColorIndex, getInitials } from "../utils";

/**
 * Tamanhos declarados, e não só uma classe de caixa. A borda acompanha o
 * tamanho, como no canvas: 1 px até 36 px, 2 px nos maiores.
 *
 * O componente aceitava `className="size-5"` mas mantinha `text-sm` fixo no
 * fallback: duas iniciais de 14px em semibold não cabem numa caixa de 20px, e o
 * `overflow-hidden` do `Avatar` cortava as letras. Cada degrau declara caixa,
 * corpo do texto e quantas iniciais cabem.
 */
const SIZES = {
  chip: { box: "size-5 border", text: "text-[9px]", letters: 1 },
  /** Ao lado do nome da criança, no topo do detalhe da atividade. */
  detail: { box: "size-[26px] border", text: "text-[11px]", letters: 1 },
  /** Dentro das pílulas de filtro e de escolha da criança. */
  pill: { box: "size-7 border", text: "text-[11px]", letters: 1 },
  /** Nas linhas das folhas de Hoje (escola, mochila da noite). */
  line: { box: "size-[30px] border", text: "text-xs", letters: 1 },
  /** A folha de cada criança na mochila da noite. */
  sheet: { box: "size-[34px] border", text: "text-[13px]", letters: 1 },
  row: { box: "size-9 border", text: "text-[13px]", letters: 2 },
  sm: { box: "size-11 border-2", text: "text-sm", letters: 2 },
  md: { box: "size-12 border-2", text: "text-sm", letters: 2 },
  /** A folha da criança em Família e a vez da criança. */
  lg: { box: "size-14 border-2", text: "text-xl", letters: 1 },
} as const;

type Props = {
  name: string;
  size?: keyof typeof SIZES;
  /** Só layout (margem, `shrink-0`). A caixa vem de `size`. */
  className?: string;
};

/**
 * O avatar da criança, um só no app inteiro.
 *
 * Existiam dois: este, com texto branco sobre `bg-chart-N`, e um montado à mão
 * dentro do card de progresso, com `text-foreground` sobre a mesma cor. Cada um
 * reprovava em contraste no tema oposto — branco sobre a cor dá 2,54:1 no claro,
 * e o cinza do `foreground` escuro dá 1,31:1 sobre a cor clareada. A pastilha
 * com borda resolve os dois de uma vez (13,65:1 e 7,76:1 no pior caso) e a cor
 * da criança continua reconhecível pelo fundo e pela borda.
 */
export function StudentAvatar({ name, size = "md", className }: Props) {
  const { box, text, letters } = SIZES[size];
  return (
    // Decorativo: em todo lugar o nome da criança está escrito ao lado. Sem o
    // aria-hidden, as iniciais entravam no nome do link ("AAna").
    <Avatar
      aria-hidden
      className={cn(
        box,
        "text-foreground",
        getSubjectAvatarClassByIndex(getAvatarColorIndex(name)),
        className,
      )}
    >
      <AvatarFallback className={cn("bg-transparent font-extrabold text-foreground", text)}>
        {getInitials(name).slice(0, letters)}
      </AvatarFallback>
    </Avatar>
  );
}
