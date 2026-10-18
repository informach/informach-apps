import { INFORMACH_CONTACT } from "@informach/config/contact";
import { cn } from "@informach/ui/lib/utils";
import Link from "next/link";
import { WRAP } from "./landing-ui";
import { SALES_NAVIGATION } from "./navigation";

const LINK =
  "inline-flex min-h-11 items-center font-semibold text-primary-ink underline hover:text-foreground";

/**
 * O rodapé da prancha: o nome, a empresa e o direct do Instagram à esquerda,
 * as seções, a privacidade e os termos à direita. Sem e-mail público: o
 * contato é o direct.
 */
export function SiteFooter() {
  const sections = SALES_NAVIGATION.filter((link) => link.href !== "/#turma");
  return (
    <footer className="border-t border-foreground/15 pb-24 pt-10">
      <div className={`${WRAP} flex flex-wrap items-start justify-between gap-6`}>
        <div className="flex flex-col gap-2">
          <b className="text-[17px]">agenda da turma</b>
          <span className="text-sm text-muted-foreground">
            Um app da Informach · CNPJ 43.588.758/0001-03
          </span>
          <a
            href={INFORMACH_CONTACT.directMessageUrl}
            className={cn(LINK, "min-h-0 text-sm font-bold")}
          >
            Fale com a gente no Instagram
          </a>
        </div>
        <nav aria-label="Navegação do rodapé" className="flex flex-wrap gap-x-5 text-[15px]">
          {sections.map((link) => (
            <a key={link.href} href={link.href} className={LINK}>
              {link.label}
            </a>
          ))}
          <Link href="/privacidade" className={LINK}>
            Privacidade
          </Link>
          <a href="https://informach.com.br/termos" className={LINK}>
            Termos
          </a>
        </nav>
      </div>
    </footer>
  );
}
