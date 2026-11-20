import { JOGOS, jogoPorId } from "@informach/config/jogos";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CapaMorada, Marca } from "@/components/desenhos";
import { Rodape } from "@/components/pagina-publica";
import { rotuloDoEstado, rotuloDosAparelhos } from "@/features/estante/catalogo";

type Props = { params: Promise<{ jogo: string }> };
export const dynamicParams = false;
export function generateStaticParams() {
  return JOGOS.map((jogo) => ({ jogo: jogo.id }));
}
function ficha(id: string) {
  const jogo = jogoPorId(id);
  if (!jogo || jogo.estado === "interno" || !jogo.editorial) notFound();
  return { jogo, editorial: jogo.editorial };
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { jogo, editorial } = ficha((await params).jogo);
  return { title: jogo.nome, description: editorial.resumo };
}

/** Pure public catalogue: no session, game bundle, authority or admission. */
export default async function FichaDoJogo({ params }: Props) {
  const { jogo, editorial } = ficha((await params).jogo);
  const faixa =
    jogo.classificacao.faixa === "em_analise"
      ? "Em análise"
      : jogo.classificacao.faixa === "L"
        ? "Livre"
        : `${jogo.classificacao.faixa} anos`;
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-5 sm:px-8">
        <Link href="/" aria-label="Recreio, página inicial">
          <Marca />
        </Link>
        <span className="flex-1" />
        <Link href="/estante" className="rb rb-vazado">
          Abrir a estante
        </Link>
      </header>
      <main id="conteudo" className="mx-auto w-full max-w-6xl flex-1 px-4 pt-5 pb-12 sm:px-8">
        <article>
          <div className="grid items-center gap-7 lg:grid-cols-2">
            <div>
              <p className="etiqueta etiqueta-sol mb-4">{rotuloDoEstado(jogo.estado)}</p>
              <h1 className="font-display text-5xl font-extrabold tracking-tight sm:text-6xl">
                {jogo.nome}
              </h1>
              <p className="mt-4 text-xl font-semibold">{editorial.resumo}</p>
              <p className="mt-3 leading-relaxed text-tinta-suave">{editorial.descricao}</p>
              <p className="mt-5 text-sm text-tinta-suave">
                Disponível para {rotuloDosAparelhos(jogo.aparelhos)}.
              </p>
            </div>
            {jogo.id === "morada" && (
              <div className="painel relative aspect-[5/3] overflow-hidden bg-painel-2">
                <CapaMorada className="absolute inset-0 size-full" />
              </div>
            )}
          </div>
          <section aria-labelledby="antes-de-jogar" className="painel mt-8 p-5 sm:p-6">
            <h2 id="antes-de-jogar" className="font-display text-2xl font-bold">
              Antes de jogar
            </h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed">
              {editorial.avisos.map((aviso) => (
                <li key={aviso}>{aviso}</li>
              ))}
            </ul>
            {(jogo.estado === "manutencao" || jogo.estado === "aposentado") && (
              <p className="mt-4 font-bold">
                Este jogo está {rotuloDoEstado(jogo.estado)} e não recebe novas partidas.
              </p>
            )}
          </section>
          <div className="mt-7 grid gap-6 md:grid-cols-2">
            <section aria-labelledby="como-jogar">
              <h2 id="como-jogar" className="font-display text-2xl font-bold">
                Controles
              </h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed text-tinta-suave">
                {editorial.controles.map((controle) => (
                  <li key={controle}>{controle}</li>
                ))}
              </ul>
            </section>
            <section aria-labelledby="o-que-precisa">
              <h2 id="o-que-precisa" className="font-display text-2xl font-bold">
                O que você precisa
              </h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed text-tinta-suave">
                {editorial.requisitos.map((requisito) => (
                  <li key={requisito}>{requisito}</li>
                ))}
              </ul>
            </section>
          </div>
          <section aria-labelledby="classificacao" className="mt-8 border-t border-linha pt-6">
            <h2 id="classificacao" className="font-display text-2xl font-bold">
              Classificação e interações
            </h2>
            <p className="mt-3">
              <strong>Classificação indicativa:</strong> {faixa}.
            </p>
            {jogo.classificacao.descritores.length > 0 && (
              <p className="mt-2">{jogo.classificacao.descritores.join("; ")}.</p>
            )}
            {jogo.classificacao.interacoes.length > 0 && (
              <p className="mt-2">{jogo.classificacao.interacoes.join("; ")}.</p>
            )}
            <p className="mt-4 text-tinta-suave">
              A estante informa a situação do seu acesso. Para jogar, entre na sua conta e abra um
              mundo por lá.
            </p>
            <Link href="/estante" className="rb rb-sol mt-5">
              Ir para a estante
            </Link>
          </section>
        </article>
      </main>
      <Rodape />
    </div>
  );
}
