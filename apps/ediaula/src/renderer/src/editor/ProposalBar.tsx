import { mergeRanges } from "@shared/cleanup";
import { Check, ChevronDown, ChevronUp, Sparkles, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import {
  applyProposal,
  discardProposal,
  toggleProposalItem,
  useProposalView,
} from "@/lib/proposals";
import { playback } from "@/state/playback";
import { Button } from "@/ui";

const fmt = (s: number): string =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Cuts suggested by the AI, waiting for one-click approval. Kept in the project until then. */
export function ProposalBar(): ReactNode {
  const view = useProposalView();
  const [open, setOpen] = useState(false);
  if (!view) return null;
  const { proposal, places } = view;
  const chosen = proposal.items
    .map((item, i) => ({ item, place: places[i] }))
    .filter((x) => x.item.status === "pending");
  let saved = 0;
  for (const [a, b] of mergeRanges(chosen.flatMap((x) => (x.place ? [x.place] : []))))
    saved += b - a;
  return (
    <div className="proposal">
      <div className="proposal-head">
        <Sparkles size={14} className="accent" />
        <strong>{proposal.title}</strong>
        <span className="muted">
          A IA propõe {chosen.length} corte{chosen.length === 1 ? "" : "s"} · −
          {saved.toFixed(1).replace(".", ",")} s
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
          disabled={!chosen.length}
          onClick={() => void applyProposal()}
        >
          Aplicar
        </Button>
      </div>
      {open && (
        <div className="proposal-list">
          {proposal.items.map((item, i) => {
            const place = places[i];
            const left = item.status === "rejected";
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
                      : "Este trecho mudou de lugar; ao aplicar, ele é procurado pelas palavras"
                  }
                >
                  {place ? fmt(place[0]) : "--:--"}
                </button>
                <span className="proposal-text">
                  {item.text
                    ? `"${item.text}"`
                    : `${(place ? place[1] - place[0] : item.end - item.start).toFixed(1)} s`}
                </span>
                <span className="muted spacer">{item.reason}</span>
                <button
                  type="button"
                  className="link"
                  onClick={() => toggleProposalItem(proposal.id, item.id)}
                >
                  {left ? "Incluir" : "Deixar de fora"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
