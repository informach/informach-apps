import Link from "next/link";
import type { convitesAguardandoOMundo } from "../convites-dirigidos-gestao-repository";

type Fila = Awaited<ReturnType<typeof convitesAguardandoOMundo>>;
export function FilaDeConvitesDoMundo({
  fila,
  baseDoConvite,
  gestao,
}: {
  fila: Fila;
  baseDoConvite: string;
  gestao: string;
}) {
  return (
    <section className="painel mt-6 max-w-2xl p-5 sm:p-6" aria-label="Convites aguardando o mundo">
      <h2 className="font-display text-2xl font-bold">Quem está chegando</h2>
      <p className="mt-3 text-sm text-tinta-suave">
        Convites de participantes que precisam da decisão de quem cuida deste mundo. A autorização
        dos responsáveis pelos menores continua sendo separada.
      </p>
      {fila.convites.length === 0 ? (
        <p className="mt-5">Nenhum convite aguarda sua decisão nesta página.</p>
      ) : (
        <ul className="mt-5 grid gap-4">
          {fila.convites.map((c) => (
            <li key={c.id} className="grid gap-2 border-t border-linha pt-4">
              <p className="text-sm text-tinta-suave">
                Válido até{" "}
                <time dateTime={c.expiraEm}>
                  {new Date(c.expiraEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                </time>{" "}
                (Brasília).
              </p>
              <Link
                href={`${baseDoConvite}/${c.id}`}
                className="inline-flex min-h-11 items-center font-bold text-ceu underline"
              >
                Conferir quem foi convidado
              </Link>
            </li>
          ))}
        </ul>
      )}
      {fila.proximo && (
        <Link
          href={`${gestao}?${new URLSearchParams({ aposEm: fila.proximo.em, aposId: fila.proximo.id })}`}
          className="mt-4 inline-flex min-h-11 items-center font-bold text-ceu underline"
        >
          Próximos convites
        </Link>
      )}
    </section>
  );
}
