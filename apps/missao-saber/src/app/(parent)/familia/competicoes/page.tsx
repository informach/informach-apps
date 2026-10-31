import Link from "next/link";
import { LinkChapa } from "@/components/ui/botao-chapa";
import { CabecalhoPagina, Etiqueta } from "@/components/ui/pagina";
import { listCompetitions } from "@/features/competition/service";
import { requirePageUser } from "@/lib/auth";

export const metadata = { title: "Competições em família" };

const segundosTexto = (s: number) => (s % 60 === 0 ? `${s / 60} min` : `${s} s`);

export default async function Competicoes() {
  const user = await requirePageUser();
  const lista = await listCompetitions(user.id);
  const abertas = lista.filter((c) => c.status !== "finished");
  const encerradas = lista.filter((c) => c.status === "finished");
  return (
    <div className="mx-auto max-w-4xl">
      <CabecalhoPagina
        etiqueta={<Etiqueta tom="verde">Área do responsável</Etiqueta>}
        titulo="Competições em família"
        apoio="Você coordena: escolhe quem joga, a área e o tempo de cada pergunta. Cada criança recebe perguntas do próprio nível. O pódio fica só aqui, na sua conta, e não aparece no estudo das crianças."
        acessorio={
          <LinkChapa href="/familia/competicoes/nova" medida="g">
            Nova competição
          </LinkChapa>
        }
      />
      {!lista.length && (
        <section className="rounded-card border border-sombra bg-creme p-6">
          <h2 className="font-display text-xl font-semibold">Como funciona</h2>
          <ol className="mt-3 space-y-2 text-tinta-suave">
            <li>
              1. Escolha quem joga, a área e quantos problemas e desafios de peças cada um faz.
            </li>
            <li>2. Abra a sala no tablet ou na TV. Ela mostra de quem é a vez.</li>
            <li>
              3. Toque em Começar: o tempo corre, a resposta aparece com a explicação e os pontos
              somam.
            </li>
          </ol>
          <p className="mt-3 text-sm text-tinta-suave">
            Problema certo vale 1 ponto. Desafio de peças montado no tempo vale 3.
          </p>
        </section>
      )}
      {abertas.length > 0 && (
        <section aria-labelledby="andamento" className="mb-8">
          <h2 id="andamento" className="mb-3 font-display text-xl font-semibold">
            Em andamento
          </h2>
          <ul className="grid gap-3">
            {abertas.map((c) => (
              <li key={c.id}>
                <article className="flex flex-wrap items-center gap-4 rounded-card border border-sombra bg-creme p-5 shadow-chapa">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap gap-2">
                      <Etiqueta tom="uva">{c.area}</Etiqueta>
                      <Etiqueta tom="sol">
                        {c.feitas === 0
                          ? "Ainda não começou"
                          : `Vez ${Math.min(c.feitas + 1, c.total)} de ${c.total}`}
                      </Etiqueta>
                    </div>
                    <h3 className="mt-2 font-display text-xl font-semibold">{c.titulo}</h3>
                    <p className="text-tinta-suave">
                      {c.nomes.join(", ")} · {c.problemas} problemas e {c.desafios}{" "}
                      {c.desafios === 1 ? "desafio" : "desafios"} cada ·{" "}
                      {segundosTexto(c.segundosProblema)} por problema
                      {c.desafios > 0 ? `, ${segundosTexto(c.segundosDesafio)} por desafio` : ""}
                    </p>
                  </div>
                  <LinkChapa href={`/familia/competicoes/${c.id}`} tom="uva">
                    {c.feitas === 0 ? "Abrir a sala" : "Voltar para a sala"}
                  </LinkChapa>
                </article>
              </li>
            ))}
          </ul>
        </section>
      )}
      {encerradas.length > 0 && (
        <section aria-labelledby="encerradas">
          <h2 id="encerradas" className="mb-3 font-display text-xl font-semibold">
            Encerradas
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {encerradas.map((c) => (
              <li key={c.id}>
                <article className="flex h-full flex-col gap-3 rounded-card border border-sombra bg-creme p-5">
                  <Etiqueta tom="uva" className="self-start">
                    {c.area}
                  </Etiqueta>
                  <h3 className="font-display text-lg font-semibold">{c.titulo}</h3>
                  <p className="text-sm text-tinta-suave">
                    {new Intl.DateTimeFormat("pt-BR", {
                      dateStyle: "long",
                      timeZone: "America/Sao_Paulo",
                    }).format(new Date(c.criadaEm))}
                  </p>
                  <ol className="grid gap-1.5">
                    {c.podio.map((p) => (
                      <li
                        key={p.id}
                        className={`flex justify-between rounded-controle px-3 py-2 ${p.posicao === 1 ? "bg-sol-claro" : "bg-papel"}`}
                      >
                        <span>
                          <b>{p.posicao}º</b> {p.apelido}
                        </span>
                        <span className="font-bold">
                          {p.pontos} {p.pontos === 1 ? "ponto" : "pontos"}
                        </span>
                      </li>
                    ))}
                  </ol>
                  <Link
                    href={`/familia/competicoes/${c.id}`}
                    className="mt-auto font-semibold underline"
                  >
                    Ver o pódio
                  </Link>
                </article>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
