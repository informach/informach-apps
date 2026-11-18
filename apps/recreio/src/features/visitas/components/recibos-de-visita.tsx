import type { CaixaDeVisitas } from "@informach/recreio/contrato";
import Link from "next/link";
import { manifestoDoJogo } from "@/features/jogos/config";
import { EncerrarVisitaDoJogador, EncerrarVisitaDoMenor } from "./encerrar-visita-do-menor";

const ESTADOS = {
  pending: "Aguardando confirmações",
  accepted: "Convite aceito",
  declined: "Recusado",
  revoked: "Cancelado",
  expired: "Vencido",
};
/** Só metadados de recibos próprios já autorizados. Nomes dependem da conferência atual. */
export function RecibosDeVisita({
  caixa,
  destino,
  perfilSobCuidados,
  perfilJogador,
}: {
  caixa: CaixaDeVisitas;
  destino: string;
  perfilSobCuidados?: string;
  perfilJogador?: string;
}) {
  return (
    <section className="mt-7 max-w-3xl" aria-label="Convites de visita guardados">
      {caixa.convites.length === 0 ? (
        <p className="painel p-6">Nenhum convite de visita nesta página.</p>
      ) : (
        <ul className="grid gap-4">
          {caixa.convites.map((c) => (
            <li key={c.conviteId} className="painel grid gap-3 p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-xl font-bold">
                  {c.direcao === "recebido" ? "Convite recebido" : "Convite enviado"}
                </h2>
                <span className="text-sm font-semibold text-tinta-suave">
                  {c.visita && c.visita.estado !== "active"
                    ? "Visita encerrada"
                    : ESTADOS[c.estado]}
                </span>
              </div>
              <p className="font-semibold">
                {manifestoDoJogo(c.jogo)?.nome ?? "Jogo indisponível"}
              </p>
              <p className="text-sm text-tinta-suave">
                Prazo original:{" "}
                <time dateTime={c.expiraEm}>
                  {new Date(c.expiraEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                </time>{" "}
                (Brasília). A presença e as permissões serão conferidas novamente.
              </p>
              {(c.estado === "pending" || c.visita?.estado === "active") && (
                <Link
                  className="inline-flex min-h-11 items-center font-bold text-ceu underline"
                  href={`${destino}/${c.conviteId}`}
                >
                  Conferir visita
                </Link>
              )}
              {perfilSobCuidados && (c.estado === "pending" || c.visita?.estado === "active") && (
                <EncerrarVisitaDoMenor perfilId={perfilSobCuidados} conviteId={c.conviteId} />
              )}
              {perfilJogador && (c.estado === "pending" || c.visita?.estado === "active") && (
                <EncerrarVisitaDoJogador
                  perfilId={perfilJogador}
                  conviteId={c.conviteId}
                  direcao={c.direcao}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-5 flex flex-wrap gap-5">
        <a
          className="inline-flex min-h-11 items-center font-bold text-ceu underline"
          href={destino}
        >
          Atualizar lista
        </a>
        {caixa.proximo && (
          <Link
            className="inline-flex min-h-11 items-center font-bold text-ceu underline"
            href={`${destino}?${new URLSearchParams({ aposEm: caixa.proximo.em, aposId: caixa.proximo.id })}`}
          >
            Próximos convites de visita
          </Link>
        )}
      </div>
    </section>
  );
}
