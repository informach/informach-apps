import Link from "next/link";
import { InformachLogo } from "@/components/marketing/informach-logo";
import { SITE_PRODUCTS } from "@/lib/products";
import { SITE } from "@/lib/site";

const LINK_CLASS =
  "inline-flex min-h-8 items-center text-[#D7E0E8] underline-offset-4 transition-colors hover:text-white hover:underline";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-night text-[#D7E0E8]">
      <div className="mx-auto grid max-w-[1240px] gap-10 px-4 pt-14 pb-8 sm:px-6 lg:px-10">
        <div className="flex flex-wrap justify-between gap-10">
          <div className="grid max-w-[340px] content-start gap-3">
            <Link href="/" className="justify-self-start" aria-label="Informach, início">
              <InformachLogo tone="onDark" className="h-10 w-auto" />
            </Link>
            <p className="text-sm">{SITE.tagline}</p>
          </div>

          <nav aria-label="Produtos" className="grid content-start gap-1 text-sm">
            <h2 className="mb-1 text-sm font-bold text-white">Produtos</h2>
            {SITE_PRODUCTS.map((product) => (
              <a key={product.slug} href={product.url} className={LINK_CLASS}>
                {product.name}
              </a>
            ))}
          </nav>

          <nav aria-label="Empresa" className="grid content-start gap-1 text-sm">
            <h2 className="mb-1 text-sm font-bold text-white">Empresa</h2>
            <a href="/#quem-faz" className={LINK_CLASS}>
              Quem faz
            </a>
            <a href={SITE.contact.directMessageUrl} className={LINK_CLASS}>
              Direct no Instagram
            </a>
            <Link href="/termos" className={LINK_CLASS}>
              Termos de uso
            </Link>
            <Link href="/privacidade" className={LINK_CLASS}>
              Privacidade
            </Link>
          </nav>
        </div>

        <p className="border-t border-[#D7E0E8]/20 pt-6 text-[13px]">
          © {year} {SITE.legalName} · CNPJ {SITE.cnpj}
        </p>
      </div>
    </footer>
  );
}
