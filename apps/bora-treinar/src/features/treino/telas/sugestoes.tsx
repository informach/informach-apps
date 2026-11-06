"use client";
import { Check, Lock, TrendingDown, TrendingUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Cadeado } from "@/features/billing/planos";
import { acceptSuggestionAction } from "@/features/sessoes/actions";
import { useServerAction } from "@/lib/use-server-action";
import { describeSuggestion, type Suggestion } from "../engine/progression";

/**
 * "Pronta para subir" (e "ajustar a meta"): aceitar ali mesmo, no Início ou no Progresso, em vez
 * de só no resumo do próximo treino. O servidor reconfere antes de aplicar.
 */
export function SugestoesDeNivel({
  profileId,
  sugestoes,
  permitido,
}: {
  profileId: string;
  sugestoes: Suggestion[];
  permitido: boolean;
}) {
  const router = useRouter();
  const [aceitas, setAceitas] = useState<Set<string>>(new Set());
  const [mensagem, setMensagem] = useState("");
  const [pending, start] = useServerAction();
  if (!sugestoes.length) return null;
  const aceitar = (s: Suggestion) =>
    start(async () => {
      const r = await acceptSuggestionAction(profileId, s.chainId);
      if (!r.ok) return setMensagem(r.error);
      setAceitas((a) => new Set([...a, s.chainId]));
      router.refresh();
    });
  return (
    <div className="stack">
      {sugestoes.map((s) => {
        const desce = s.type === "down";
        return (
          <div className="card suggestion" key={s.chainId}>
            {desce ? (
              <TrendingDown size={20} className="title-icon" aria-hidden />
            ) : (
              <TrendingUp size={20} className="title-icon" aria-hidden />
            )}
            <span className="grow">
              {describeSuggestion(s)}
              <small className="muted block-line">
                {desce
                  ? "Pesou nas últimas vezes; um passo atrás ajuda a voltar a evoluir."
                  : "Você bateu a meta nas últimas vezes."}
              </small>
            </span>
            {aceitas.has(s.chainId) ? (
              <span className="chip">
                <Check size={16} /> Aplicado
              </span>
            ) : permitido ? (
              <button
                type="button"
                className={`btn ${desce ? "" : "primary"}`}
                disabled={pending}
                onClick={() => aceitar(s)}
              >
                {desce ? "Ajustar" : "Subir"}
              </button>
            ) : (
              <Cadeado motivo="niveis" className="btn ghost">
                <Lock size={16} /> Na assinatura
              </Cadeado>
            )}
          </div>
        );
      })}
      <p role="status" className="form-message">
        {mensagem}
      </p>
    </div>
  );
}
