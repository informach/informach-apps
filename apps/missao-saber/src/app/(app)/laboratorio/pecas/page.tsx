import { cn } from "@informach/ui/lib/utils";
import Link from "next/link";
import { EmptyProfile } from "@/components/empty-profile";
import { CabecalhoPagina, Etiqueta } from "@/components/ui/pagina";
import { desafiosPorFaixa, faixaDoAno, rotuloFaixa } from "@/features/pecas/catalogo";
import { desafioLiberado } from "@/features/pecas/esquema";
import { listSolves } from "@/features/pecas/repository";
import { faixas } from "@/features/pecas/tipos";
import { formatarTempo } from "@/lib/texto";
import { currentDashboard } from "@/lib/view";

export const metadata = { title: "Desafios de peças" };

const tipoRotulo = {
  "malha-plano": "No plano",
  "malha-espaco": "No espaço",
  "livre-plano": "Peças inclinadas",
  "livre-espaco": "Sólidos",
} as const;

export default async function DesafiosDePecas() {
  const data = await currentDashboard();
  if (!data.profile) return <EmptyProfile />;
  const montados = new Map((await listSolves(data.profile.id)).map((s) => [s.puzzleId, s]));
  const minhaFaixa = faixaDoAno(data.profile.grade);
  const acesso = { pago: data.access.paid, perfilLiberado: data.profileAllowed };
  // A faixa do estudante vem primeiro; as outras continuam abertas para treinar.
  const ordem = [minhaFaixa, ...faixas.filter((f) => f !== minhaFaixa)];
  return (
    <>
      <CabecalhoPagina
        etiqueta={<Etiqueta tom="ceu">Laboratório</Etiqueta>}
        titulo="Desafios de peças"
        apoio="Quebra-cabeças clássicos, que também existem em madeira. Gire, vire e encaixe as peças até a figura fechar. Treine aqui: nas competições da família, eles aparecem sorteados."
        acessorio={
          <Link href="/laboratorio" className="font-semibold underline">
            Voltar ao laboratório
          </Link>
        }
      />
      <div className="grid gap-9">
        {ordem.map((faixa) => {
          const lista = desafiosPorFaixa.filter((d) => d.faixa === faixa);
          return (
            <section key={faixa} aria-labelledby={`faixa-${faixa}`}>
              <h2 id={`faixa-${faixa}`} className="mb-3 font-display text-xl font-semibold">
                {rotuloFaixa[faixa]}
                {faixa === minhaFaixa && (
                  <Etiqueta tom="verde" className="ml-2 align-middle">
                    Da sua faixa
                  </Etiqueta>
                )}
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {lista.map((desafio) => {
                  const montado = montados.get(desafio.id);
                  const liberado = desafioLiberado(desafio, acesso);
                  return (
                    <li key={desafio.id}>
                      <article
                        className={cn(
                          "flex h-full flex-col gap-2 rounded-card border-2 p-4",
                          montado ? "border-verde/40 bg-verde-claro" : "border-sombra bg-creme",
                        )}
                      >
                        <div className="flex flex-wrap gap-1.5">
                          <Etiqueta>{tipoRotulo[desafio.tipo]}</Etiqueta>
                          <Etiqueta>
                            {desafio.pecas.length} {desafio.pecas.length === 1 ? "peça" : "peças"}
                          </Etiqueta>
                        </div>
                        <h3 className="font-display text-lg leading-tight font-semibold">
                          {desafio.nome}
                        </h3>
                        <p className="text-sm text-tinta-suave">{desafio.objetivo}</p>
                        <p className="text-sm text-tinta-suave">
                          Conhecido como: {desafio.conhecidoComo}
                        </p>
                        <p className="text-sm font-semibold">
                          {montado
                            ? `Montado ${montado.solves === 1 ? "1 vez" : `${montado.solves} vezes`} · melhor tempo ${formatarTempo(montado.bestSeconds)}`
                            : "Ainda não montado"}
                        </p>
                        <div className="mt-auto pt-2">
                          {liberado ? (
                            <Link
                              href={`/laboratorio/pecas/${desafio.id}`}
                              aria-label={`${montado ? "Montar de novo" : "Montar"}: ${desafio.nome}`}
                              className="inline-flex min-h-11 items-center rounded-controle bg-ceu-solido px-4 font-display font-semibold text-sobre-ceu no-underline"
                            >
                              {montado ? "Montar de novo" : "Montar"}
                            </Link>
                          ) : (
                            <p className="text-sm text-tinta-suave">Faz parte da assinatura.</p>
                          )}
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
