import Link from "next/link";
import { redirect } from "next/navigation";
import { Marca } from "@/components/desenhos";
import { PortalNav } from "@/components/portal-nav";
import { consultarMinhaParticipacaoNoRecreio } from "@/features/account/participacao-service";
import { AvatarDoPerfil } from "@/features/perfis/components/avatar";
import { paginaDaConta } from "@/features/sessao/ator";
import { AppError } from "@/lib/errors";

export default async function LayoutDoPortal({ children }: { children: React.ReactNode }) {
  // O layout não é refeito a cada navegação entre páginas irmãs: cada página
  // revalida a conta e a autoridade de seu escopo; gestão aceita zero jogadores.
  const { ator } = await paginaDaConta();
  const participacao = await consultarMinhaParticipacaoNoRecreio(ator).catch((erro: unknown) => {
    if (erro instanceof AppError && erro.code === "AUTH") redirect("/entrar?encerrada=1");
    throw erro;
  });
  const ativa = participacao.estado === "active";
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-linha">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-8">
          <Link
            href={ativa ? "/estante" : "/conta"}
            aria-label={ativa ? "Recreio, estante" : "Recreio, conta"}
          >
            <Marca tamanho={28} />
          </Link>
          <span className="flex-1" />
          <PortalNav temPerfil={Boolean(ator.perfil)} participacaoAtiva={ativa} />
          {ativa && ator.perfil ? (
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
          ) : ativa ? (
            <Link href="/perfis" className="rb rb-vazado">
              Escolher quem joga
            </Link>
          ) : null}
        </div>
      </header>
      <main id="conteudo" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-8 sm:py-10">
        {children}
      </main>
    </div>
  );
}
