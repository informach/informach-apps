import Link from "next/link";
import type { visitasAguardandoOMundo } from "../fila-nativa-repository";

export function FilaDeVisitasDoMundo({
  fila,
  destino,
}: {
  fila: Awaited<ReturnType<typeof visitasAguardandoOMundo>>;
  destino: string;
}) {
  return (
    <section
      className="painel mt-7 grid max-w-2xl gap-5 p-5 sm:p-7"
      aria-label="Visitas aguardando o mundo"
    >
      <h2 className="font-display text-2xl font-extrabold">Quem vem visitar</h2>
      <p className="text-sm text-tinta-suave">
        Convites temporários que aguardam a decisão de quem cuida deste mundo. Os responsáveis pelos
        menores confirmam separadamente, e o anfitrião precisa continuar presente.
      </p>
      {fila.convites.length === 0 ? (
        <p>Nenhuma visita aguarda sua decisão nesta página.</p>
      ) : (
        <ul className="grid gap-4">
          {fila.convites.map((c) => (
            <li key={c.id} className="grid gap-2 border-t border-linha pt-4">
              <p className="text-sm text-tinta-suave">
                Prazo máximo:{" "}
                <time dateTime={c.expiraEm}>
                  {new Date(c.expiraEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                </time>{" "}
                (Brasília).
              </p>
              <Link
                className="inline-flex min-h-11 items-center font-bold text-ceu underline"
                href={`${destino}/${c.id}`}
              >
                Conferir convite de visita
              </Link>
            </li>
          ))}
        </ul>
      )}
      <nav className="flex flex-wrap gap-5" aria-label="Páginas dos convites de visita">
        <Link
          className="inline-flex min-h-11 items-center font-bold text-ceu underline"
          href={destino}
        >
          Atualizar visitas
        </Link>
        {fila.proximo && (
          <Link
            className="inline-flex min-h-11 items-center font-bold text-ceu underline"
            href={`${destino}?${new URLSearchParams({ aposEm: fila.proximo.em, aposId: fila.proximo.id })}`}
          >
            Próximas visitas
          </Link>
        )}
      </nav>
    </section>
  );
}
