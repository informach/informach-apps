import { mergeRanges } from "@shared/cleanup";
import { Check, ChevronDown, ChevronUp, Sparkles, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import { applyProposal } from "@/lib/proposals";
import { useApp } from "@/state/app";
import { playback } from "@/state/playback";
import { Button } from "@/ui";

const fmt = (s: number): string =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Cuts suggested by the AI, waiting for one-click approval. */
export function ProposalBar(): ReactNode {
  const proposal = useApp((s) => s.proposal);
  const [open, setOpen] = useState(false);
  if (!proposal) return null;
  let saved = 0;
  for (const [a, b] of mergeRanges(proposal.items.map((i) => [i.start, i.end]))) saved += b - a;
  return (
    <div className="proposal">
      <div className="proposal-head">
        <Sparkles size={14} className="accent" />
        <strong>{proposal.title}</strong>
        <span className="muted">
          A IA propõe {proposal.items.length} corte{proposal.items.length > 1 ? "s" : ""} · −
          {saved.toFixed(1).replace(".", ",")} s
        </span>
        <button type="button" className="link" onClick={() => setOpen(!open)}>
          {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}{" "}
          {open ? "Ocultar" : "Ver lista"}
        </button>
        <span className="spacer" />
        <Button
          size="sm"
          variant="ghost"
          icon={X}
          onClick={() => useApp.getState().set({ proposal: null })}
        >
          Descartar
        </Button>
        <Button size="sm" variant="primary" icon={Check} onClick={() => void applyProposal()}>
          Aplicar
        </Button>
      </div>
      {open && (
        <div className="proposal-list">
          {proposal.items.map((i) => (
            <button
              type="button"
              key={`${i.start}:${i.end}:${i.reason}`}
              className="proposal-item"
              onClick={() => playback.seek(Math.max(0, i.start - 1))}
              title="Ouvir a partir de 1 s antes"
            >
              <span className="mono accent">{fmt(i.start)}</span>
              <span className="proposal-text">
                {i.text ? `"${i.text}"` : `${(i.end - i.start).toFixed(1)} s`}
              </span>
              <span className="muted">{i.reason}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
