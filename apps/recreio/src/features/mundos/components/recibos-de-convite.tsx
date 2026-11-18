import type { CaixaDeConvitesDirigidos } from "@informach/recreio/contrato";
import Link from "next/link";
import { manifestoDoJogo } from "@/features/jogos/config";
import { EncerrarConviteDoMenor } from "./encerrar-convite-do-menor";

const ESTADOS = {
  pending: "Aguardando confirmações",
  accepted: "Aceito",
  declined: "Recusado",
  revoked: "Cancelado",
  expired: "Vencido",
};
/** Componente servidor: apenas metadados de recibos cuja leitura já foi autorizada. */
export function RecibosDeConvite({
  caixa,
  destino,
  perfilSobCuidados,
}: {
  caixa: CaixaDeConvitesDirigidos;
  destino: string;
  perfilSobCuidados?: string;
}) {
  return (
    <section className="mt-7 max-w-3xl" aria-label="Convites guardados">
      {caixa.convites.length === 0 ? (
        <p className="painel p-6">Nenhum convite nesta página.</p>
      ) : (
        <ul className="grid gap-4">
          {caixa.convites.map((c) => (
            <li key={c.conviteId} className="painel grid gap-3 p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-xl font-bold">
                  {c.direcao === "recebido" ? "Convite recebido" : "Convite enviado"}
                </h2>
                <span className="text-sm font-semibold text-tinta-suave">{ESTADOS[c.estado]}</span>
              </div>
              <p className="font-semibold">
                {manifestoDoJogo(c.jogo)?.nome ?? "Jogo indisponível"}
              </p>
              <p className="text-sm text-tinta-suave">
                Validade:{" "}
                <time dateTime={c.expiraEm}>
                  {new Date(c.expiraEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                </time>{" "}
                (Brasília).
              </p>
              {c.estado === "pending" && (
                <>
                  <Link
                    href={`${destino}/${c.conviteId}`}
                    className="inline-flex min-h-11 items-center font-bold text-ceu underline"
                  >
                    Conferir convite
                  </Link>
                  {perfilSobCuidados && (
                    <EncerrarConviteDoMenor perfilId={perfilSobCuidados} conviteId={c.conviteId} />
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-5 flex flex-wrap gap-5">
        <a
          href={destino}
          className="inline-flex min-h-11 items-center font-bold text-ceu underline"
        >
          Atualizar lista
        </a>
        {caixa.proximo && (
          <Link
            href={`${destino}?${new URLSearchParams({ aposEm: caixa.proximo.em, aposId: caixa.proximo.id })}`}
            className="inline-flex min-h-11 items-center font-bold text-ceu underline"
          >
            Próximos convites
          </Link>
        )}
      </div>
    </section>
  );
}
