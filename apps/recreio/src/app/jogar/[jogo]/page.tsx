import { notFound, redirect } from "next/navigation";
import { paginaDoJogador } from "@/features/autoridade-de-jogo/http";
import { AvisoDoJogo, TelaDoJogo } from "@/features/jogar/components/aviso-do-jogo";
import { Hospedeiro } from "@/features/jogar/components/hospedeiro";
import { textoDaParada } from "@/features/jogar/estado";
import { prepararPaginaDoJogo } from "@/features/jogar/service";
import { env } from "@/lib/env";

export const metadata = { title: "Jogar" };

/**
 * A página que hospeda um jogo, fora da moldura do portal: o jogo ocupa a
 * janela inteira. Exige jogador atual nativo ou protegido neste aparelho.
 * Isso não concede acesso às páginas da conta. O jogo precisa existir e abrir, e
 * o perfil precisa ter o direito de jogar; o mundo vem de `?mundo=<id>`.
 *
 * Nada de quem joga é escrito na página: só o id do jogo, o id do mundo e os
 * nomes dos dois. O perfil chega ao jogo pelo ingresso, pedido pelo navegador.
 */
export default async function Jogar({
  params,
  searchParams,
}: {
  params: Promise<{ jogo: string }>;
  searchParams: Promise<{ mundo?: string | string[] }>;
}) {
  const ator = await paginaDoJogador();
  const estante = ator.protegido ? "/aparelho" : "/estante";
  const pagina = await prepararPaginaDoJogo(
    { perfilId: ator.perfil.id, sessaoDeAparelhoId: ator.sessaoDeAparelhoId },
    (await params).jogo,
    (await searchParams).mundo,
  );
  if (pagina.tipo === "inexistente") notFound();
  // A estante já explica a situação do acesso e é onde se escolhe o mundo.
  if (pagina.tipo === "sem_acesso" || pagina.tipo === "sem_mundo") redirect(estante);
  if (pagina.tipo === "mundo_indisponivel") {
    const texto = textoDaParada("mundo_indisponivel");
    return (
      <TelaDoJogo titulo={pagina.jogo.nome}>
        <div className="absolute inset-0 flex items-center justify-center overflow-auto p-4">
          <AvisoDoJogo titulo={texto.titulo} texto={texto.texto}>
            <a href={estante} className="rb rb-vazado">
              Voltar à estante
            </a>
          </AvisoDoJogo>
        </div>
      </TelaDoJogo>
    );
  }
  return (
    <Hospedeiro
      jogo={pagina.jogo}
      mundo={pagina.tipo === "pronto_sem_mundo" ? null : pagina.mundo}
      estante={estante}
      trocaCoordenada={env.RECREIO_CHECKPOINT_MODE === "on"}
      supervisionado={ator.protegido}
      visitas={env.RECREIO_VISITS_MODE === "on" && pagina.jogo.visitas === true}
    />
  );
}
