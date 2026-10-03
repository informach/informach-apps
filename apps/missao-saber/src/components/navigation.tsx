"use client";
import { cn } from "@informach/ui/lib/utils";
import {
  ChartNoAxesCombined,
  Compass,
  FlaskConical,
  House,
  NotebookPen,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const study = [
  { href: "/hoje", label: "Hoje", Icon: House },
  { href: "/jornada", label: "Minha trilha", Icon: Compass },
  { href: "/laboratorio", label: "Laboratório", Icon: FlaskConical },
  { href: "/caderno", label: "Caderno", Icon: NotebookPen },
];
const parent = [
  { href: "/familia", label: "Visão geral", Icon: House },
  { href: "/familia/estudantes", label: "Estudantes", Icon: Users },
  { href: "/familia/acompanhamento", label: "Acompanhamento", Icon: ChartNoAxesCombined },
  { href: "/familia/conta", label: "Conta", Icon: Settings },
];
function active(path: string, href: string) {
  if (href === "/familia") return path === href;
  if (href === "/familia/estudantes" && ["/familia/preparar", "/familia/pronto"].includes(path))
    return true;
  if (href === "/jornada" && ["/revisao", "/simulados", "/historico"].includes(path)) return true;
  return path === href || path.startsWith(`${href}/`);
}
export function Navigation({
  audience = "study",
  mobile = false,
}: {
  audience?: "parent" | "study";
  mobile?: boolean;
}) {
  const path = usePathname();
  if (mobile && path.startsWith("/missao/")) return null;
  const entries = audience === "parent" ? parent : study;
  return (
    <nav
      aria-label={audience === "parent" ? "Navegação do responsável" : "Navegação de estudo"}
      className={
        mobile
          ? "fixed inset-x-0 bottom-0 z-30 border-t border-sombra bg-creme lg:hidden"
          : "hidden flex-col gap-1.5 lg:flex"
      }
      style={mobile ? { paddingBottom: "env(safe-area-inset-bottom, 0px)" } : undefined}
    >
      <ul className={mobile ? "grid grid-cols-4" : "space-y-1.5"}>
        {entries.map(({ href, label, Icon }) => {
          const current = active(path, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex min-h-12 items-center rounded-controle font-semibold no-underline transition-colors",
                  mobile
                    ? "min-h-16 flex-col justify-center gap-1 px-1 py-2 text-center text-[0.65rem] sm:text-xs"
                    : "gap-3 px-3.5 py-3 text-sm",
                  current
                    ? "bg-verde-claro text-tinta"
                    : "text-tinta-suave hover:bg-papel hover:text-tinta",
                )}
              >
                <Icon size={mobile ? 20 : 22} aria-hidden="true" />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
export function NavegacaoInferior({ audience = "study" }: { audience?: "parent" | "study" }) {
  return <Navigation audience={audience} mobile />;
}
