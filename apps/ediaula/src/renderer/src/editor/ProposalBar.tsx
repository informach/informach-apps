import { mergeRanges } from "@shared/cleanup";
import { Check, ChevronDown, ChevronUp, Sparkles, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import {
  applyProposal,
  chooseProposal,
  discardProposal,
  toggleProposalItem,
  useProposalView,
} from "@/lib/proposals";
import { playback } from "@/state/playback";
import { Button } from "@/ui";

const fmt = (s: number): string =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Who made a proposal, for the selector when there are several. */
const author = (by: string | undefined): string =>
  by === "assistente" || by?.startsWith("assistente:")
    ? "chat do Assistente"
    : by === "gravacao"
      ? "gravação"
      : by === "roteiro"
        ? "roteiro"
        : by === "voz"
          ? "limpeza da voz"
          : by === "limpeza"
            ? "limpeza automática"
            : by?.startsWith("cliente:")
              ? "app de IA conectado"
              : "IA";

/**
 * Cuts suggested by the AI, waiting for one-click approval. Kept in the project until then. Each
 * item is shown where Aplicar would cut it; one that cannot be found any more stays out.
 */
export function ProposalBar(): ReactNode {
  const view = useProposalView();
  const [open, setOpen] = useState(false);
  if (!view) return null;
  const { proposal, places, all } = view;
  const cut = proposal.items
    .map((item, i) => ({ item, place: places[i] }))
    .filter((x) => x.item.status === "pending" && x.place);
  const lost = proposal.items.filter((item, i) => item.status === "pending" && !places[i]).length;
  let saved = 0;
  for (const [a, b] of mergeRanges(cut.flatMap((x) => (x.place ? [x.place] : [])))) saved += b - a;
  return (
    <div className="proposal">
      <div className="proposal-head">
        <Sparkles size={14} className="accent" />
        {all.length > 1 ? (
          <select
            className="select"
            value={proposal.id}
            aria-label="Proposta mostrada"
            onChange={(e) => chooseProposal(e.target.value)}
          >
            {all.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} ({author(p.by)})
              </option>
            ))}
          </select>
        ) : (
          <strong>{proposal.title}</strong>
        )}
        <span className="muted">
          {proposal.by === "limpeza" || proposal.by === "voz" ? "A limpeza propõe" : "A IA propõe"}{" "}
          {cut.length} corte
          {cut.length === 1 ? "" : "s"} · −{saved.toFixed(1).replace(".", ",")} s
          {lost
            ? ` · ${lost} não encontrado${lost === 1 ? "" : "s"}, fica${lost === 1 ? "" : "m"} de fora`
            : ""}
        </span>
        <button type="button" className="link" onClick={() => setOpen(!open)}>
          {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}{" "}
          {open ? "Ocultar" : "Ver lista"}
        </button>
        <span className="spacer" />
        <Button size="sm" variant="ghost" icon={X} onClick={() => discardProposal(proposal.id)}>
          Descartar
        </Button>
        <Button
          size="sm"
          variant="primary"
          icon={Check}
          disabled={!cut.length}
          onClick={() => void applyProposal()}
        >
          Aplicar
        </Button>
      </div>
      {open && (
        <div className="proposal-list">
          {proposal.items.map((item, i) => {
            const place = places[i];
            const left = item.status === "rejected" || !place;
            return (
              <div key={item.id} className={`proposal-item${left ? " is-left-out" : ""}`}>
                <button
                  type="button"
                  className="link mono accent"
                  disabled={!place}
                  onClick={() => place && playback.seek(Math.max(0, place[0] - 1))}
                  title={
                    place
                      ? "Ouvir a partir de 1 s antes"
                      : "Este trecho não foi encontrado de novo na aula e fica de fora"
                  }
                >
                  {place ? fmt(place[0]) : "--:--"}
                </button>
                <span className="proposal-text">
                  {item.text
                    ? `"${item.text}"`
                    : place
                      ? `${(place[1] - place[0]).toFixed(1)} s`
                      : "trecho"}
                </span>
                <span className="muted spacer">
                  {place ? item.reason : `não encontrado, fica de fora (${item.reason})`}
                </span>
                {place && (
                  <button
                    type="button"
                    className="link"
                    onClick={() => toggleProposalItem(proposal.id, item.id)}
                  >
                    {item.status === "rejected" ? "Incluir" : "Deixar de fora"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
