import { ehErroDoRecreio, MundoIdSchema, PerfilIdSchema } from "@informach/recreio";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { paginaDoJogador } from "@/features/autoridade-de-jogo/http";
import { EmitirConviteDoPortal } from "@/features/mundos/components/convites-do-portal";
import { opcoesParaConvidarAmigo } from "@/features/mundos/convites-dirigidos-opcoes-repository";
import { AvatarDoPerfil } from "@/features/perfis/components/avatar";
import { AppError } from "@/lib/errors";

export const metadata = { title: "Convidar amigo para um mundo" };
export default async function Convidar({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ apos?: string }>;
}) {
  const alvo = PerfilIdSchema.safeParse((await params).id),
    cursor = MundoIdSchema.optional().safeParse((await searchParams).apos);
  if (!alvo.success || !cursor.success) notFound();
  const caminho = `/amigos/${alvo.data}/convidar`,
    jogador = await paginaDoJogador(caminho);
  const opcoes = await opcoesParaConvidarAmigo(
    { perfilId: jogador.perfil.id, sessaoDeAparelhoId: jogador.sessaoDeAparelhoId },
    alvo.data,
    cursor.data,
  ).catch((erro: unknown) => {
    if (
      ehErroDoRecreio(erro, "SESSAO_INVALIDA") ||
      ehErroDoRecreio(erro, "SESSAO_ENCERRADA") ||
      ehErroDoRecreio(erro, "NAO_AUTENTICADO")
    )
      redirect(
        jogador.protegido ? "/aparelho" : `/entrar?recente=1&next=${encodeURIComponent(caminho)}`,
      );
    if (
      (erro instanceof AppError && ["CONFLITO", "CONTATO", "PEDIDO"].includes(erro.code)) ||
      ehErroDoRecreio(erro, "INDISPONIVEL")
    )
      return null;
    throw erro;
  });
  return (
    <main id="conteudo" className="mx-auto min-h-dvh max-w-3xl px-4 py-8 sm:px-8">
      <Link href="/amigos" className="rb rb-vazado">
        Voltar aos amigos
      </Link>
      <h1 className="mt-8 font-display text-3xl font-extrabold">Convidar amigo para um mundo</h1>
      <p className="mt-3 text-tinta-suave">
        Escolha um dos mundos de que você participa para enviar o convite ao contato selecionado. A
        amizade e as permissões serão conferidas novamente ao enviar.
      </p>
      {opcoes ? (
        <>
          <div className="mt-6 flex items-center gap-3">
            <AvatarDoPerfil avatar={opcoes.contato.avatar} apelido={opcoes.contato.apelido} />
            <h2 className="font-display text-xl font-bold [overflow-wrap:anywhere]">
              Convite para {opcoes.contato.apelido}
            </h2>
          </div>
          <EmitirConviteDoPortal
            perfilId={jogador.perfil.id}
            destinatarioId={alvo.data}
            mundos={opcoes.mundos}
          />
          <nav aria-label="Páginas de mundos para convite" className="mt-4 flex flex-wrap gap-4">
            {cursor.data && (
              <Link href={caminho} className="rb rb-vazado">
                Primeira página
              </Link>
            )}
            {opcoes.proximo && (
              <Link href={`${caminho}?apos=${opcoes.proximo}`} className="rb rb-vazado">
                Próximos mundos
              </Link>
            )}
          </nav>
        </>
      ) : (
        <p className="painel mt-7 p-5">
          Este contato não está disponível para novos convites. Confira os cuidados e as permissões
          atuais nos seus amigos.
        </p>
      )}
    </main>
  );
}
