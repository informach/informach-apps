import { ehErroDoRecreio } from "@informach/recreio";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Marca } from "@/components/desenhos";
import { paginaDoJogador } from "@/features/autoridade-de-jogo/http";
import { ConvitesDoPortal } from "@/features/mundos/components/convites-do-portal";
import { caixaDeConvitesDirigidos } from "@/features/mundos/convites-dirigidos-consulta-repository";
import { AvatarDoPerfil } from "@/features/perfis/components/avatar";
import { AppError } from "@/lib/errors";

export const metadata = { title: "Convites de mundos" };
export default async function Convites() {
  const jogador = await paginaDoJogador("/convites");
  const voltar = jogador.protegido ? "/aparelho" : "/estante";
  const caixa = await caixaDeConvitesDirigidos(
    { perfilId: jogador.perfil.id, sessaoDeAparelhoId: jogador.sessaoDeAparelhoId },
    {},
  ).catch((erro: unknown) => {
    if (
      ehErroDoRecreio(erro, "SESSAO_INVALIDA") ||
      ehErroDoRecreio(erro, "SESSAO_ENCERRADA") ||
      ehErroDoRecreio(erro, "NAO_AUTENTICADO")
    )
      redirect(jogador.protegido ? "/aparelho" : "/entrar?recente=1&next=%2Fconvites");
    if (erro instanceof AppError && ["CONFLITO", "CONTATO"].includes(erro.code)) return null;
    throw erro;
  });
  return (
    <main id="conteudo" className="mx-auto min-h-dvh max-w-4xl px-4 py-8 sm:px-8 sm:py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Link href={voltar} aria-label="Recreio, voltar para jogar">
          <Marca tamanho={30} />
        </Link>
        <nav aria-label="Navegação dos convites" className="flex flex-wrap gap-3">
          <Link href="/visitas" className="rb rb-vazado">
            Visitas com amigos
          </Link>
          <Link href="/amigos" className="rb rb-vazado">
            Amigos
          </Link>
          <Link href={voltar} className="rb rb-vazado">
            Voltar para jogar
          </Link>
        </nav>
      </header>
      <div className="mt-10 flex items-center gap-4">
        <AvatarDoPerfil avatar={jogador.perfil.avatar} apelido={jogador.perfil.apelido} />
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-sol">
            Seu canto no Recreio
          </p>
          <h1 className="mt-1 font-display text-4xl font-extrabold tracking-tight">
            Convites de mundos
          </h1>
        </div>
      </div>
      <p className="mt-5 max-w-2xl text-tinta-suave">
        Confira os convites de {jogador.perfil.apelido}. Aceitar uma participação acrescenta o mundo
        à sua estante. Você escolhe quando entrar.
      </p>
      <div className="mt-7">
        {caixa ? (
          <ConvitesDoPortal perfilId={jogador.perfil.id} inicial={caixa} />
        ) : (
          <div className="painel p-6">
            <p>Os cuidados do perfil mudaram. Atualize para conferir as permissões atuais.</p>
            <Link
              href="/convites"
              className="mt-3 inline-flex min-h-11 items-center font-bold text-ceu underline"
            >
              Atualizar convites
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
