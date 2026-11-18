"use client";
import type {
  CaixaDeVisitas,
  DetalheDeConviteDeVisita,
  VisitasDoPerfil,
} from "@informach/recreio/contrato";
import { useEffect, useRef, useState, useTransition } from "react";
import type { DestinoDeVisita } from "../navegacao";

export function VisitasNaPartida({
  api,
  aoVisitar,
}: {
  api: VisitasDoPerfil;
  aoVisitar?: (destino: DestinoDeVisita) => void;
}) {
  const geracao = useRef(0),
    [pendente, iniciar] = useTransition(),
    [caixa, guardarCaixa] = useState<CaixaDeVisitas | null>(null),
    [detalhe, guardarDetalhe] = useState<DetalheDeConviteDeVisita | null>(null),
    [mensagem, avisar] = useState(""),
    [incerto, marcarIncerto] = useState(false);
  useEffect(() => {
    const atual = ++geracao.current;
    guardarCaixa(null);
    guardarDetalhe(null);
    avisar("");
    marcarIncerto(false);
    api.listar().then(
      (c) => {
        if (geracao.current === atual) guardarCaixa(c);
      },
      () => {
        if (geracao.current === atual)
          avisar("Não foi possível consultar as visitas. Você pode atualizar a lista.");
      },
    );
    return () => {
      geracao.current++;
    };
  }, [api]);
  function executar(acao: () => Promise<void>) {
    if (pendente) return;
    const atual = geracao.current;
    iniciar(async () => {
      try {
        await acao();
      } catch {
        if (atual === geracao.current)
          avisar(
            "Não recebemos a confirmação. Atualize a lista e confira a situação antes de repetir.",
          );
      }
    });
  }
  function carregar(cursor?: { em: string; id: string }) {
    const atual = geracao.current;
    executar(async () => {
      const c = await api.listar(cursor);
      if (atual !== geracao.current) return;
      guardarCaixa(c);
      guardarDetalhe(null);
      marcarIncerto(false);
      avisar("");
    });
  }
  function conferir(id: string) {
    const atual = geracao.current;
    guardarDetalhe(null);
    executar(async () => {
      const d = await api.conferir(id);
      if (atual !== geracao.current) return;
      guardarDetalhe(d);
      marcarIncerto(false);
      avisar("");
    });
  }
  function responder(acao: "aceitar" | "recusar" | "revogar") {
    if (!detalhe || incerto) return;
    const atual = geracao.current,
      id = detalhe.convite.conviteId;
    marcarIncerto(true);
    executar(async () => {
      const r = await api.responder(id, acao);
      if (atual !== geracao.current) return;
      guardarCaixa((anterior) =>
        anterior
          ? {
              ...anterior,
              convites: anterior.convites.map((c) =>
                c.conviteId === id ? { ...c, ...r.convite, visita: r.visita } : c,
              ),
            }
          : anterior,
      );
      guardarDetalhe(null);
      avisar(
        acao === "aceitar"
          ? "Convite aceito. Confira a visita para preparar a entrada com seu progresso salvo."
          : "Encerramento confirmado. Uma nova visita precisa de outro convite.",
      );
      marcarIncerto(false);
    });
  }
  const aguarda =
    detalhe &&
    (detalhe.convite.aguardaMundo ||
      detalhe.convite.aguardaOrigem ||
      detalhe.convite.aguardaDestino);
  return (
    <section className="painel mt-7 p-4 sm:p-5" aria-label="Visitas com amigos na partida">
      <h3 className="font-display text-xl font-bold">Visitas com amigos</h3>
      <p className="mt-2 text-sm text-tinta-suave">
        Confira as companhias sem sair da sua partida. A visita depende da presença do anfitrião e
        das permissões atuais de cada perfil. Salve seu progresso antes de visitar.
      </p>
      {mensagem && (
        <p role="status" className="mt-4 rounded-controle border border-linha bg-fundo p-3 text-sm">
          {mensagem}
        </p>
      )}
      {caixa?.convites.length === 0 && (
        <p className="mt-4 text-sm">Nenhum convite de visita nesta página.</p>
      )}
      {caixa && (
        <ul className="mt-4 grid gap-4">
          {caixa.convites.map((c) => (
            <li className="grid gap-2 border-t border-linha pt-4" key={c.conviteId}>
              <p className="font-bold">
                {c.direcao === "recebido" ? "Visita recebida" : "Visita enviada"}
              </p>
              <p className="text-sm text-tinta-suave">
                {c.visita?.estado === "active"
                  ? "Convite aceito; entrada sujeita à conferência"
                  : c.estado === "pending"
                    ? "Aguardando confirmações"
                    : "Confira o recibo para ver a situação"}
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className="rb rb-vazado"
                  disabled={pendente}
                  onClick={() => conferir(c.conviteId)}
                >
                  Conferir visita
                </button>
                <button
                  type="button"
                  className="min-h-11 font-bold text-ceu underline"
                  disabled={pendente}
                  onClick={() => {
                    const atual = geracao.current;
                    executar(async () => {
                      const r = await api.consultar(c.conviteId);
                      if (atual === geracao.current)
                        avisar(
                          r.visita && r.visita.estado !== "active"
                            ? "Visita encerrada. Uma nova entrada precisa de outro convite."
                            : r.convite.estado === "accepted"
                              ? "O aceite está registrado. Ele não comprova presença ou entrada atual."
                              : "Recibo consultado. Confira as confirmações atuais antes de aceitar.",
                        );
                    });
                  }}
                >
                  Consultar recibo
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <nav className="mt-4 flex flex-wrap gap-4" aria-label="Páginas das visitas na partida">
        <button
          type="button"
          className="min-h-11 font-bold text-ceu underline"
          disabled={pendente}
          onClick={() => carregar()}
        >
          Atualizar visitas
        </button>
        {caixa?.proximo && (
          <button
            type="button"
            className="min-h-11 font-bold text-ceu underline"
            disabled={pendente}
            onClick={() => carregar(caixa.proximo ?? undefined)}
          >
            Próximas visitas
          </button>
        )}
      </nav>
      {detalhe && (
        <section
          className="mt-5 grid gap-4 border-t border-linha pt-5"
          aria-label="Visita a confirmar"
        >
          <h4 className="font-display text-xl font-bold [overflow-wrap:anywhere]">
            {detalhe.nomeDoMundo}
          </h4>
          <p className="text-sm [overflow-wrap:anywhere]">
            <strong>{detalhe.origem.apelido}</strong> convidou{" "}
            <strong>{detalhe.destino.apelido}</strong> para visitar.
          </p>
          <p className="text-sm text-tinta-suave">
            A visita termina com a saída do anfitrião ou ao vencer o prazo. Ela não cria uma
            participação permanente.
          </p>
          {aguarda && (
            <p className="text-sm">Aguardando confirmações do mundo ou dos responsáveis.</p>
          )}
          <div className="flex flex-wrap gap-3">
            {detalhe.direcao === "recebido" && detalhe.convite.estado === "pending" && (
              <button
                type="button"
                className="rb rb-sol"
                disabled={pendente || incerto || Boolean(aguarda)}
                onClick={() => responder("aceitar")}
              >
                Aceitar visita
              </button>
            )}
            <button
              type="button"
              className="rb rb-vazado"
              disabled={pendente || incerto}
              onClick={() => responder(detalhe.direcao === "enviado" ? "revogar" : "recusar")}
            >
              {detalhe.convite.estado === "accepted" ? "Encerrar visita" : "Encerrar convite"}
            </button>
            {detalhe.direcao === "recebido" && detalhe.visita?.estado === "active" && aoVisitar && (
              <button
                type="button"
                className="rb rb-sol"
                disabled={pendente || incerto}
                onClick={() => {
                  if (!detalhe.visita || pendente || incerto) return;
                  aoVisitar({
                    jogo: detalhe.convite.jogo,
                    mundoId: detalhe.convite.mundoId,
                    visitaId: detalhe.visita.visitaId,
                  });
                }}
              >
                Salvar e visitar
              </button>
            )}
          </div>
          {detalhe.visita?.estado === "active" && !aoVisitar && (
            <p className="text-sm text-tinta-suave">
              Saia pelo próprio jogo para salvar. Depois abra Visitas com amigos pelo portal.
            </p>
          )}
        </section>
      )}
    </section>
  );
}
