"use client";
import type { AcompanhamentoDeDenuncias, SocialDoPerfil } from "@informach/recreio/contrato";
import { useRef, useState, useTransition } from "react";

const SITUACOES: Record<string, string> = {
  aberta: "Recebida pela equipe",
  em_analise: "Em análise",
  recurso: "Revisão recebida",
  resolvida: "Resposta da equipe",
  encerrada: "Atendimento encerrado",
};
const DECISOES: Record<string, string> = {
  sem_elementos: "Não foram encontrados elementos suficientes para uma medida.",
  medida_aplicada: "A equipe registrou uma medida para este caso.",
  duplicada: "O caso já estava registrado em outra denúncia.",
};
export function ProtocolosNaPartida({ api }: { api: SocialDoPerfil }) {
  const [pagina, definirPagina] = useState<AcompanhamentoDeDenuncias | null>(null);
  const [erro, definirErro] = useState(""),
    [pendente, iniciar] = useTransition();
  const tentativas = useRef(new Map<string, string>());
  const consultar = () => {
    definirErro("");
    iniciar(async () => {
      try {
        definirPagina(await api.denuncias());
      } catch {
        definirErro(
          "Não foi possível confirmar seus protocolos. Aguarde e consulte novamente; nenhum pedido será reenviado automaticamente.",
        );
      }
    });
  };
  return (
    <section className="painel mt-6 p-4" aria-label="Denúncias deste perfil na partida">
      <h3 className="font-display text-lg font-bold">Seus protocolos</h3>
      <p className="mt-2 text-sm text-tinta-suave">
        Confira os dez pedidos mais recentes deste perfil sem sair do jogo. As informações de outras
        pessoas ficam protegidas.
      </p>
      <button type="button" className="rb rb-vazado mt-3" disabled={pendente} onClick={consultar}>
        {pendente ? "Conferindo…" : "Consultar meus protocolos"}
      </button>
      {erro && (
        <p role="alert" className="mt-3 text-sm text-coral">
          {erro}
        </p>
      )}
      {pagina &&
        (pagina.denuncias.length === 0 ? (
          <p role="status" className="mt-3 text-sm text-tinta-suave">
            Nenhuma denúncia disponível para este perfil.
          </p>
        ) : (
          <ul className="mt-4 grid gap-4">
            {pagina.denuncias.map((r) => (
              <li
                key={`${r.protocolo}:${r.revisao}`}
                className="min-w-0 border-t border-linha pt-3"
              >
                <h4 className="font-bold">{SITUACOES[r.situacao]}</h4>
                <p className="mt-2 break-all font-mono text-xs">{r.protocolo}</p>
                {r.decisao && (
                  <p className="mt-2 text-sm">
                    {r.recursoEm && ["recurso", "em_analise"].includes(r.situacao)
                      ? "Resposta anterior: "
                      : ""}
                    {DECISOES[r.decisao]}
                  </p>
                )}
                {r.recursoEm && (
                  <p className="mt-2 text-xs text-tinta-suave">
                    Revisão registrada em {new Date(r.recursoEm).toLocaleString("pt-BR")} no horário
                    deste aparelho.
                  </p>
                )}
                {r.prazoParaRevisao && (
                  <p className="mt-2 text-xs text-tinta-suave">
                    Prazo para revisão: {new Date(r.prazoParaRevisao).toLocaleString("pt-BR")}, no
                    horário deste aparelho.
                  </p>
                )}
                {r.podePedirRevisao && (
                  <button
                    type="button"
                    className="rb rb-vazado mt-3"
                    disabled={pendente}
                    onClick={() => {
                      const chave = `${r.protocolo}:${r.revisao}`;
                      let recursoId = tentativas.current.get(chave);
                      if (!recursoId) {
                        recursoId = crypto.randomUUID();
                        tentativas.current.set(chave, recursoId);
                      }
                      const entrada = {
                        protocolo: r.protocolo,
                        versaoDoCaso: r.revisao,
                        recursoId,
                      };
                      definirErro("");
                      iniciar(async () => {
                        try {
                          await api.reverDenuncia(entrada);
                          definirPagina(await api.denuncias());
                        } catch {
                          definirErro(
                            "Não recebemos a confirmação da revisão. Consulte seus protocolos antes de tentar novamente; a resposta anterior permanece registrada.",
                          );
                        }
                      });
                    }}
                  >
                    Pedir revisão da resposta
                  </button>
                )}
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}
