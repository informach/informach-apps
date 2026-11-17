"use client";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import { useState, useTransition } from "react";
import { moderarRecreioAction } from "../actions";

type Caso = {
  tipo: "denuncia" | "recurso";
  protocolo: string;
  revisao: number;
  situacao: string;
  perfilId: string | null;
  estadoDoPerfil: "active" | "suspended" | null;
  versaoDoPerfil: number | null;
  versaoDaRestricao?: number;
  revisaoDaAmizade?: number;
};
const CAMPO =
  "mt-1 min-h-11 w-full rounded-xl border border-line-warm bg-surface px-3 py-2 text-ink";
const EFEITOS: Record<string, string> = {
  analisar: "O caso passa a estar em análise. Nenhum perfil é suspenso por esta ação.",
  concluir:
    "A análise é concluída com a decisão escolhida. A ação não reativa nem suspende o perfil.",
  suspender_perfil:
    "O perfil deixa de jogar; ingressos e partidas são encerrados. Aparelhos infantis são revogados. Não apaga mundos ou progresso.",
  reativar_perfil:
    "Retira a suspensão do perfil. Aparelhos, ingressos e aprovações antigas não voltam a valer. Um recurso aberto precisa ser respondido no próprio protocolo.",
  desfazer_amizade:
    "Encerra a amizade e pedidos pendentes entre as pontas do caso. Não apaga mundos ou progresso e não cria bloqueio automático.",
  responder_recurso:
    "Registra a resposta ao pedido próprio. Reativar retira a suspensão sem restaurar credenciais antigas; manter conserva a restrição.",
};

export function ComandoDeSeguranca({ caso, habilitado }: { caso: Caso; habilitado: boolean }) {
  const pronto = useHydrated();
  const opcoes =
    caso.tipo === "recurso"
      ? caso.situacao === "aberto" && caso.estadoDoPerfil === "suspended" && caso.versaoDaRestricao
        ? ["responder_recurso"]
        : []
      : [
          ...(["aberta", "recurso"].includes(caso.situacao) ? ["analisar"] : []),
          ...(caso.situacao === "em_analise" ? ["concluir"] : []),
          ...(["aberta", "em_analise", "recurso"].includes(caso.situacao)
            ? [
                ...(caso.perfilId && caso.versaoDoPerfil && caso.estadoDoPerfil === "active"
                  ? ["suspender_perfil"]
                  : []),
                ...(caso.perfilId && caso.versaoDoPerfil && caso.estadoDoPerfil === "suspended"
                  ? ["reativar_perfil"]
                  : []),
                ...(caso.revisaoDaAmizade ? ["desfazer_amizade"] : []),
              ]
            : []),
        ];
  const [acao, definirAcao] = useState(opcoes[0] ?? "");
  const [motivo, definirMotivo] = useState("medida_preventiva");
  const [decisao, definirDecisao] = useState("sem_elementos");
  const [recurso, definirRecurso] = useState("manter");
  const [confirmo, definirConfirmo] = useState(false);
  const [resultado, definirResultado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const [enviado, definirEnviado] = useState(false);
  const trava = !pronto || pendente || enviado || !habilitado;
  const id = `acao-${caso.protocolo}`;
  const rotulos: Record<string, string> = {
    analisar: "Iniciar análise",
    concluir: "Concluir análise",
    suspender_perfil: "Suspender perfil",
    reativar_perfil: "Reativar perfil",
    desfazer_amizade: "Desfazer amizade",
    responder_recurso: "Responder recurso próprio",
  };
  if (!opcoes.length)
    return <p className="mt-4 text-sm text-ink-muted">Nenhuma ação disponível nesta revisão.</p>;
  return (
    <form
      className="mt-5 grid gap-4 border-t border-line-warm pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (trava || !confirmo) return;
        const base = {
          comandoId: crypto.randomUUID(),
          protocolo: caso.protocolo,
          versaoDoCaso: caso.revisao,
          operacao: acao,
        };
        const comando =
          acao === "concluir"
            ? { ...base, decisao }
            : acao === "suspender_perfil" || acao === "reativar_perfil"
              ? { ...base, perfilId: caso.perfilId, versaoDoPerfil: caso.versaoDoPerfil, motivo }
              : acao === "desfazer_amizade"
                ? { ...base, revisaoDaAmizade: caso.revisaoDaAmizade, motivo }
                : acao === "responder_recurso"
                  ? {
                      ...base,
                      perfilId: caso.perfilId,
                      versaoDoPerfil: caso.versaoDoPerfil,
                      versaoDaRestricao: caso.versaoDaRestricao,
                      decisao: recurso,
                      motivo,
                    }
                  : base;
        definirEnviado(true);
        iniciar(async () => {
          try {
            const r = await moderarRecreioAction({ comando, confirmoEfeito: true });
            definirResultado(r.ok ? { ok: true, texto: r.message } : { ok: false, texto: r.error });
          } catch {
            definirResultado({
              ok: false,
              texto: "Não recebemos a confirmação. Atualize o caso antes de agir novamente.",
            });
          }
        });
      }}
    >
      <label className="text-sm font-bold" htmlFor={id}>
        Ação nesta revisão
        <select
          id={id}
          className={CAMPO}
          value={acao}
          disabled={trava}
          onChange={(e) => {
            definirAcao(e.target.value);
            definirConfirmo(false);
            definirMotivo(
              e.target.value === "reativar_perfil" ? "recurso_procedente" : "medida_preventiva",
            );
          }}
        >
          {opcoes.map((o) => (
            <option key={o} value={o}>
              {rotulos[o]}
            </option>
          ))}
        </select>
      </label>
      {acao === "concluir" && (
        <label className="text-sm font-bold" htmlFor={`${id}-decisao`}>
          Decisão
          <select
            id={`${id}-decisao`}
            className={CAMPO}
            value={decisao}
            disabled={trava}
            onChange={(e) => {
              definirDecisao(e.target.value);
              definirConfirmo(false);
            }}
          >
            <option value="sem_elementos">Sem elementos suficientes</option>
            <option value="medida_aplicada">Medida aplicada</option>
            <option value="duplicada">Denúncia duplicada</option>
          </select>
        </label>
      )}
      {acao === "responder_recurso" && (
        <label className="text-sm font-bold" htmlFor={`${id}-recurso`}>
          Resposta ao recurso
          <select
            id={`${id}-recurso`}
            className={CAMPO}
            value={recurso}
            disabled={trava}
            onChange={(e) => {
              definirRecurso(e.target.value);
              definirConfirmo(false);
              definirMotivo(
                e.target.value === "reativar" ? "recurso_procedente" : "medida_preventiva",
              );
            }}
          >
            <option value="manter">Manter a suspensão</option>
            <option value="reativar">Reativar o perfil</option>
          </select>
        </label>
      )}
      {!["analisar", "concluir"].includes(acao) && (
        <label className="text-sm font-bold" htmlFor={`${id}-motivo`}>
          Motivo da medida
          <select
            id={`${id}-motivo`}
            className={CAMPO}
            value={motivo}
            disabled={trava}
            onChange={(e) => {
              definirMotivo(e.target.value);
              definirConfirmo(false);
            }}
          >
            {acao === "reativar_perfil" ||
            (acao === "responder_recurso" && recurso === "reativar") ? (
              <>
                <option value="recurso_procedente">Recurso procedente</option>
                <option value="correcao_operacional">Correção operacional</option>
              </>
            ) : (
              <>
                <option value="medida_preventiva">Medida preventiva</option>
                <option value="risco_confirmado">Risco confirmado</option>
              </>
            )}
          </select>
        </label>
      )}
      <p className="rounded-xl bg-paper p-3 text-sm text-ink">{EFEITOS[acao]}</p>
      <label className="flex min-h-11 items-start gap-3 text-sm font-semibold">
        <input
          type="checkbox"
          className="mt-1 size-4"
          checked={confirmo}
          disabled={trava}
          onChange={(e) => definirConfirmo(e.target.checked)}
        />
        Conferi o protocolo, a revisão e as consequências desta ação.
      </label>
      {!habilitado && (
        <p className="text-sm text-ink-muted">
          A emissão restrita ainda não foi configurada. Nenhum comando será enviado.
        </p>
      )}
      <button
        className="min-h-11 rounded-xl bg-night px-4 py-3 font-extrabold text-white disabled:opacity-50"
        type="submit"
        disabled={trava || !confirmo}
      >
        {pendente ? "Aguardando confirmação…" : "Confirmar ação da equipe"}
      </button>
      {resultado && (
        <p role={resultado.ok ? "status" : "alert"} className="text-sm font-semibold">
          {resultado.texto}
        </p>
      )}
      {enviado && (
        <a
          href={`/recreio/seguranca?protocolo=${caso.protocolo}`}
          className="inline-flex min-h-11 items-center font-bold text-sphere-strong underline"
        >
          Atualizar este caso antes de continuar
        </a>
      )}
    </form>
  );
}
