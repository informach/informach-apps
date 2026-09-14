import { cn } from "@informach/ui/lib/utils";
import Link from "next/link";
import { type Tom, tomSolido } from "./chapa";

/**
 * Botão das telas do estudante: 56px de alvo, sombra sólida e afundar ao
 * pressionar. O texto é sempre o rótulo real da ação — o E2E navega por
 * nome acessível, e a leitura em voz alta depende disso.
 */
const base =
  "inline-flex items-center justify-center gap-2 rounded-controle font-display font-semibold " +
  "transition-[transform,box-shadow] duration-100 select-none " +
  "active:translate-y-[5px] active:shadow-none motion-reduce:active:translate-y-0 " +
  "disabled:pointer-events-none disabled:opacity-60 disabled:active:translate-y-0";

const medidas = {
  g: "min-h-14 px-7 text-lg",
  m: "min-h-12 px-5 text-base",
  p: "min-h-11 px-4 text-sm",
} as const;

const contorno = "border-2 border-sombra bg-creme text-tinta shadow-chapa hover:bg-papel";

type Comuns = {
  tom?: Tom | "contorno";
  medida?: keyof typeof medidas;
  className?: string;
  children: React.ReactNode;
};

function classes({ tom = "verde", medida = "m", className }: Comuns) {
  return cn(base, medidas[medida], tom === "contorno" ? contorno : tomSolido[tom], className);
}

export function BotaoChapa({
  tom,
  medida,
  className,
  children,
  ...props
}: Comuns & Omit<React.ComponentProps<"button">, "className" | "children">) {
  return (
    <button className={classes({ tom, medida, className, children })} {...props}>
      {children}
    </button>
  );
}

export function LinkChapa({
  tom,
  medida,
  className,
  children,
  href,
  ...props
}: Comuns & Omit<React.ComponentProps<typeof Link>, "className" | "children">) {
  return (
    <Link href={href} className={classes({ tom, medida, className, children })} {...props}>
      {children}
    </Link>
  );
}

/** Para âncoras cruas (rota de API, mailto) — onde next/link não se aplica. */
export function AncoraChapa({
  tom,
  medida,
  className,
  children,
  ...props
}: Comuns & Omit<React.ComponentProps<"a">, "className" | "children">) {
  return (
    <a className={classes({ tom, medida, className, children })} {...props}>
      {children}
    </a>
  );
}
