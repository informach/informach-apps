import Link from "next/link";
import { Marca } from "@/components/desenhos";
import { PortalNav } from "@/components/portal-nav";
import { requirePageUser } from "@/lib/auth";

export default async function LayoutDoPortal({ children }: { children: React.ReactNode }) {
  // O layout não é refeito a cada navegação entre páginas irmãs: cada página
  // do portal confere a conta de novo.
  await requirePageUser();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-linha">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-8">
          <Link href="/estante" aria-label="Recreio, estante">
            <Marca tamanho={28} />
          </Link>
          <span className="flex-1" />
          <PortalNav />
        </div>
      </header>
      <main id="conteudo" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-8 sm:py-10">
        {children}
      </main>
    </div>
  );
}
