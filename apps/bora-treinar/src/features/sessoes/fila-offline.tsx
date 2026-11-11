"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { recoverLegacyQueueAction, saveGroupAction, saveSessionAction } from "./actions";
import type { TrainingContext } from "./context";
import {
  descartarPendente,
  ehGrupo,
  enviarPendentes,
  listarPendentes,
  type Pendente,
  recuperarPendentesLegados,
} from "./fila";

/** O que fazer com um treino que o servidor recusou por um motivo que pode mudar. */
function oQueFazer(motivo?: string): { texto: string; acao?: { href: string; label: string } } {
  if (motivo === "PLAN")
    return {
      texto: "Ele usa um treino ou modo do plano que não está ativo agora.",
      acao: { href: "/conta?motivo=treino", label: "Ver minha assinatura" },
    };
  if (motivo === "PROFILE" || motivo === "ACCESS_DENIED")
    return {
      texto: "O perfil desse treino não está liberado agora.",
      acao: { href: "/perfis", label: "Ver os perfis" },
    };
  if (motivo === "AUTH" || motivo === "VERIFY")
    return {
      texto: "Entre na conta de novo para salvar.",
      acao: { href: "/entrar", label: "Entrar" },
    };
  return { texto: "Ele sobe sozinho quando a internet voltar." };
}

/**
 * Ao abrir o app (e quando a rede volta), salva os treinos que ficaram na fila. Os que o servidor
 * recusou por plano, perfil ou login ficam guardados e aparecem aqui, com o que fazer e a opção
 * de descartar: antes eles sumiam da fila sem aviso.
 */
export function FilaOffline({ scope: inputScope }: { scope: TrainingContext }) {
  const { actorId, familyGroupId } = inputScope;
  const scope = useMemo(() => ({ actorId, familyGroupId }), [actorId, familyGroupId]);
  const router = useRouter();
  const caminho = usePathname();
  const [aviso, setAviso] = useState("");
  const [esperando, setEsperando] = useState<Pendente[]>([]);

  const atualizar = useCallback(async () => {
    const todos = await listarPendentes(scope);
    setEsperando(todos);
  }, [scope]);

  useEffect(() => {
    let ativo = true;
    let enviando = false;
    const enviar = async () => {
      if (enviando || !ativo) return;
      enviando = true;
      try {
        await recuperarPendentesLegados(scope, async (candidates) => {
          if (!ativo) return [];
          const result = await recoverLegacyQueueAction(scope, candidates);
          return result.ok ? result.data : [];
        });
        if (!ativo) return;
        const enviados = await enviarPendentes(
          scope,
          (payload) =>
            ehGrupo(payload) ? saveGroupAction(scope, payload) : saveSessionAction(scope, payload),
          () => ativo,
        );
        if (!ativo) return;
        await atualizar();
        if (enviados) {
          setAviso(
            enviados === 1
              ? "Um treino feito sem internet foi salvo."
              : `${enviados} treinos feitos sem internet foram salvos.`,
          );
          if (!window.location.pathname.startsWith("/treinar")) router.refresh();
        }
      } catch {
        if (ativo)
          setAviso(
            "Não foi possível consultar os treinos guardados neste aparelho. Tente novamente quando houver conexão.",
          );
      } finally {
        enviando = false;
      }
    };
    void enviar();
    window.addEventListener("online", enviar);
    return () => {
      ativo = false;
      window.removeEventListener("online", enviar);
    };
  }, [router, atualizar, scope]);

  if (caminho.startsWith("/treinar")) return null;
  const primeiro = esperando[0];
  return (
    <>
      {aviso && (
        <div className="toast good floating" role="status">
          {aviso}
        </div>
      )}
      {primeiro && (
        <div className="card notice fila-aviso" role="status">
          <strong>
            {esperando.length === 1
              ? "Um treino está esperando para ser salvo."
              : `${esperando.length} treinos estão esperando para ser salvos.`}
          </strong>
          <span className="muted">{oQueFazer(primeiro.motivo).texto}</span>
          <div className="row">
            {oQueFazer(primeiro.motivo).acao && (
              <Link className="btn primary" href={oQueFazer(primeiro.motivo).acao?.href ?? "/"}>
                {oQueFazer(primeiro.motivo).acao?.label}
              </Link>
            )}
            <button
              type="button"
              className="btn ghost"
              onClick={async () => {
                try {
                  await descartarPendente(scope, primeiro.id);
                  await atualizar();
                } catch {
                  setAviso(
                    "Não foi possível descartar o treino. Ele continua guardado neste aparelho.",
                  );
                }
              }}
            >
              Descartar este treino
            </button>
          </div>
        </div>
      )}
    </>
  );
}
