"use client";
import type {
  CaixaDeConvitesDirigidos,
  ConviteDirigido,
  ConvitesDirigidosDoPerfil,
  DetalheDeConviteDirigido,
} from "@informach/recreio/contrato";
import { ehErroDoRecreio } from "@informach/recreio/erros";
import { useEffect, useRef, useState, useTransition } from "react";
import { RecusaDeConviteNaInterface } from "../convites-interface";

const ESTADOS = {
  pending: "Aguardando confirmações",
  accepted: "Aceito",
  declined: "Recusado",
  revoked: "Cancelado",
  expired: "Vencido",
};
function prazo(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
function erroPublico(erro: unknown, alternativa: string) {
  return erro instanceof RecusaDeConviteNaInterface ? erro.message : alternativa;
}

/** Continua no mesmo jogo. Fechar o painel impede consultas e atualizações posteriores. */
export function ConvitesNaPartida({ api }: { api: ConvitesDirigidosDoPerfil }) {
  return <PainelDeConvites api={api} naPartida />;
}
export function PainelDeConvites({
  api,
  naPartida = false,
  inicial,
}: {
  api: ConvitesDirigidosDoPerfil;
  naPartida?: boolean;
  inicial?: CaixaDeConvitesDirigidos;
}) {
  const vivo = useRef(true);
  const [pagina, definirPagina] = useState<{ em: string; id: string } | undefined>(undefined),
    [carregando, marcarCarregando] = useState(!inicial);
  const [caixa, guardarCaixa] = useState<CaixaDeConvitesDirigidos | null>(inicial ?? null),
    [detalhe, conferir] = useState<DetalheDeConviteDirigido | null>(null),
    [mensagem, avisar] = useState("");
  const [pendente, iniciar] = useTransition();
  useEffect(() => {
    vivo.current = true;
    let cancelado = false;
    if (inicial) {
      guardarCaixa(inicial);
      marcarCarregando(false);
    } else {
      marcarCarregando(true);
      api
        .listar()
        .then(
          (c) => {
            if (!cancelado && vivo.current) guardarCaixa(c);
          },
          (erro) => {
            if (!cancelado && vivo.current)
              avisar(
                erroPublico(
                  erro,
                  "Não foi possível consultar os convites. Você pode atualizar a lista.",
                ),
              );
          },
        )
        .finally(() => {
          if (!cancelado && vivo.current) marcarCarregando(false);
        });
    }
    return () => {
      cancelado = true;
      vivo.current = false;
    };
  }, [api, inicial]);
  const carregar = (cursor?: { em: string; id: string }) => {
    if (!vivo.current || pendente) return;
    iniciar(async () => {
      try {
        const c = await api.listar(cursor);
        if (vivo.current) {
          definirPagina(cursor);
          guardarCaixa(c);
          conferir(null);
          avisar("");
        }
      } catch (erro) {
        if (vivo.current)
          avisar(
            erroPublico(erro, "Não foi possível atualizar. Tente consultar os convites novamente."),
          );
      }
    });
  };
  const abrir = (id: string) => {
    if (!vivo.current || pendente) return;
    iniciar(async () => {
      try {
        const c = await api.conferir(id);
        if (vivo.current) {
          conferir(c);
          avisar("");
        }
      } catch (erro) {
        if (vivo.current)
          avisar(
            erroPublico(
              erro,
              "Este convite pode ter mudado ou vencido. Atualize a lista para conferir o recibo.",
            ),
          );
      }
    });
  };
  const responder = (id: string, acao: "aceitar" | "recusar" | "revogar") => {
    if (!vivo.current || pendente) return;
    iniciar(async () => {
      try {
        const r = await api.responder(id, acao);
        if (vivo.current) {
          conferir(null);
          guardarCaixa((anterior) =>
            anterior
              ? {
                  ...anterior,
                  convites: anterior.convites.map((c) =>
                    c.conviteId === r.conviteId ? { ...c, estado: r.estado } : c,
                  ),
                }
              : anterior,
          );
          avisar(
            r.estado === "accepted"
              ? naPartida
                ? "Participação confirmada. Você pode continuar esta partida e abrir o mundo pela estante depois."
                : "Participação confirmada. O mundo está na sua estante."
              : "Situação do convite confirmada. O progresso e as participações já aceitas continuam guardados.",
          );
        }
      } catch (erro) {
        if (vivo.current)
          avisar(
            erroPublico(
              erro,
              "Não recebemos a confirmação. Atualize os convites e confira o recibo antes de repetir.",
            ),
          );
      }
    });
  };
  const precisaAprovacao =
    detalhe &&
    (detalhe.convite.aguardaMundo ||
      detalhe.convite.aguardaOrigem ||
      detalhe.convite.aguardaDestino);
  const Titulo = naPartida ? "h3" : "h2",
    Subtitulo = naPartida ? "h4" : "h3";
  return (
    <section
      className="painel mt-7 p-4 sm:p-5"
      aria-label={naPartida ? "Convites de mundos na partida" : "Convites de mundos"}
    >
      <Titulo className="font-display text-xl font-bold">Convites de mundos</Titulo>
      <p className="mt-2 text-sm text-tinta-suave">
        {naPartida
          ? "Conferir ou aceitar um convite mantém esta partida aberta. O novo mundo fica na estante."
          : "Confira as companhias e o mundo antes de aceitar. Recusar ou cancelar um convite permanece disponível sem assinatura."}
      </p>
      {mensagem && (
        <p role="status" className="mt-4 rounded-controle border border-linha bg-fundo p-3 text-sm">
          {mensagem}
        </p>
      )}
      {caixa?.convites.length === 0 && <p className="mt-4 text-sm">Nenhum convite nesta página.</p>}
      {caixa && (
        <ul className="mt-4 grid gap-4">
          {caixa.convites.map((c) => (
            <li key={c.conviteId} className="border-t border-linha pt-4">
              <p className="font-bold">
                {c.direcao === "recebido" ? "Convite recebido" : "Convite enviado"}
              </p>
              <p className="mt-1 text-sm text-tinta-suave">
                {ESTADOS[c.estado]} · {c.conviteId.slice(0, 8)}
              </p>
              {c.estado === "pending" && (
                <div className="mt-3 flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="rb rb-vazado"
                    disabled={pendente}
                    onClick={() => abrir(c.conviteId)}
                  >
                    Conferir convite
                  </button>
                  <button
                    type="button"
                    className="min-h-11 font-semibold text-ceu underline"
                    disabled={pendente}
                    onClick={() =>
                      responder(c.conviteId, c.direcao === "recebido" ? "recusar" : "revogar")
                    }
                  >
                    {c.direcao === "recebido" ? "Recusar convite" : "Cancelar convite"}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {detalhe && (
        <section
          className="mt-5 rounded-controle border border-linha bg-fundo p-4"
          aria-label="Participação a confirmar"
        >
          <Subtitulo className="font-display text-lg font-bold [overflow-wrap:anywhere]">
            {detalhe.nomeDoMundo}
          </Subtitulo>
          <p className="mt-2 text-sm [overflow-wrap:anywhere]">
            <strong>{detalhe.origem.apelido}</strong> convidou{" "}
            <strong>{detalhe.destino.apelido}</strong>.
          </p>
          <p className="mt-2 text-sm text-tinta-suave">
            Válido até {prazo(detalhe.convite.expiraEm)} (Brasília).
          </p>
          <ul className="mt-3 grid gap-1 text-sm">
            <li>Mundo: {detalhe.convite.aguardaMundo ? "aguardando decisão" : "confirmado"}</li>
            <li>
              Responsável de quem convidou:{" "}
              {detalhe.convite.aguardaOrigem ? "aguardando" : "atendido"}
            </li>
            <li>
              Responsável de quem recebeu:{" "}
              {detalhe.convite.aguardaDestino ? "aguardando" : "atendido"}
            </li>
          </ul>
          {precisaAprovacao && (
            <p className="mt-3 text-sm">Aguarde as confirmações antes de aceitar.</p>
          )}
          {caixa?.convites.some(
            (c) => c.conviteId === detalhe.convite.conviteId && c.direcao === "recebido",
          ) && (
            <button
              type="button"
              className="rb rb-sol mt-4"
              disabled={pendente || !!precisaAprovacao}
              onClick={() => responder(detalhe.convite.conviteId, "aceitar")}
            >
              Aceitar participação
            </button>
          )}
        </section>
      )}
      {carregando && (
        <p role="status" className="mt-4 text-sm">
          Consultando convites…
        </p>
      )}
      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          className="rb rb-vazado"
          disabled={pendente || carregando}
          onClick={() => carregar(pagina)}
        >
          Atualizar convites
        </button>
        {pagina && (
          <button
            type="button"
            className="rb rb-vazado"
            disabled={pendente || carregando}
            onClick={() => carregar()}
          >
            Primeira página de convites
          </button>
        )}
        {caixa?.proximo && (
          <button
            type="button"
            className="rb rb-vazado"
            disabled={pendente || carregando}
            onClick={() => carregar(caixa.proximo ?? undefined)}
          >
            Mais convites
          </button>
        )}
      </div>
    </section>
  );
}

export function EmitirConviteNaPartida({
  api,
  mundoId,
  perfilId,
  disabled = false,
  aoIniciar,
}: {
  api: ConvitesDirigidosDoPerfil;
  mundoId: string;
  perfilId: string;
  disabled?: boolean;
  aoIniciar?: () => void;
}) {
  const vivo = useRef(true),
    tentativa = useRef<string | null>(null);
  const [pendente, iniciar] = useTransition(),
    [recibo, guardar] = useState<ConviteDirigido | null>(null),
    [mensagem, avisar] = useState(""),
    [enviado, marcarEnviado] = useState(false);
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);
  return (
    <div className="mt-4 border-t border-linha pt-3">
      <button
        type="button"
        className="rb rb-vazado"
        disabled={disabled || pendente || !!recibo}
        onClick={() => {
          if (!vivo.current || disabled || pendente || recibo) return;
          aoIniciar?.();
          tentativa.current ??= crypto.randomUUID();
          const pedidoId = tentativa.current;
          marcarEnviado(true);
          iniciar(async () => {
            try {
              const r = await api.emitir({ mundoId, perfilId, pedidoId });
              if (vivo.current) {
                guardar(r);
                avisar("Convite registrado. Confira as confirmações em Convites de mundos.");
              }
            } catch (erro) {
              if (vivo.current)
                avisar(
                  ehErroDoRecreio(erro, "JA_MEMBRO")
                    ? "Este amigo já participa deste mundo."
                    : erroPublico(
                        erro,
                        "Não recebemos a confirmação. Confira os convites. Se precisar repetir, este botão conserva a mesma tentativa.",
                      ),
                );
            }
          });
        }}
      >
        {pendente
          ? "Enviando…"
          : recibo
            ? "Convite registrado"
            : enviado
              ? "Repetir a mesma tentativa"
              : "Convidar para este mundo"}
      </button>
      {mensagem && (
        <p role="status" className="mt-3 text-sm text-tinta-suave">
          {mensagem}
        </p>
      )}
    </div>
  );
}
