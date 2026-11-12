import Link from "next/link";
import { Marca } from "@/components/desenhos";
import { PortalNav } from "@/components/portal-nav";
import { AvatarDoPerfil } from "@/features/perfis/components/avatar";
import { paginaDoPortal } from "@/features/sessao/ator";

export default async function LayoutDoPortal({ children }: { children: React.ReactNode }) {
  // O layout não é refeito a cada navegação entre páginas irmãs: cada página
  // do portal confere a conta e o perfil de novo.
  const { ator } = await paginaDoPortal();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-linha">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-8">
          <Link href="/estante" aria-label="Recreio, estante">
            <Marca tamanho={28} />
          </Link>
          <span className="flex-1" />
          <PortalNav />
          <Link
            href="/perfis"
            aria-label={`Jogando como ${ator.perfil.apelido}. Trocar de perfil`}
            className="flex min-h-11 items-center gap-2 rounded-controle px-2 text-sm font-bold text-tinta-suave hover:text-tinta"
          >
            <AvatarDoPerfil
              avatar={ator.perfil.avatar}
              apelido={ator.perfil.apelido}
              tamanho="sm"
            />
            <span className="max-w-32 truncate">{ator.perfil.apelido}</span>
          </Link>
        </div>
      </header>
      <main id="conteudo" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-8 sm:py-10">
        {children}
      </main>
    </div>
  );
}
