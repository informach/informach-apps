import type { CutCategory, ProposalItem } from "@shared/anchors";
import { mergeRanges } from "@shared/cleanup";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Headphones,
  Scissors,
  SkipForward,
  Sparkles,
  Undo2,
  Wand2,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import {
  applyProposal,
  chooseProposal,
  discardProposal,
  setProposalCategory,
  toggleProposalItem,
  useProposalView,
} from "@/lib/proposals";
import {
  applyDraftNow,
  approveSeamNow,
  discardDraftNow,
  listenDraftItem,
  listenSkipping,
  replaySeam,
  restoreSeamNow,
  skipSeam,
  stopSeamReview,
  toggleDraftItem,
  useSeamReview,
} from "@/lib/review";
import { playback } from "@/state/playback";
import { draftView, useProject } from "@/state/project";
import { Button, Kbd } from "@/ui";

const fmt = (s: number): string =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const secs = (s: number): string => `${s.toFixed(1).replace(".", ",")} s`;

/** Who made a proposal or a draft, for the bar. */
export const authorLabel = (by: string | undefined): string =>
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
            : by === "preparar"
              ? "Preparar aula"
              : by === "modelo"
                ? "modelo do curso"
                : by === "verificacao"
                  ? "verificação antes de exportar"
                  : by?.startsWith("cliente:")
                    ? "app de IA conectado"
                    : "IA";

const CATEGORY_LABEL: Record<CutCategory, string> = {
  filler: "Vícios de fala",
  repeat: "Repetições",
  silence: "Pausas longas",
  "off-script": "Fora do roteiro",
  retake: "Tomadas repetidas",
};

/**
 * Everything waiting for the person's review, above the timeline: the draft of an AI edit or of a
 * step of "Preparar aula" (item by item, applied as one undo step), the cut proposals (by
 * category, heard as they would be cut) and "Revisar cortes", seam by seam.
 */
export function ReviewBar(): ReactNode {
  const seam = useSeamReview((s) => s.active);
  const draft = useProject((s) => s.draft);
  const projectId = useProject((s) => s.project?.id);
  return (
    <>
      {seam && <SeamReviewBar />}
      {draft && draft.projectId === projectId && <DraftReview />}
      <ProposalReview />
    </>
  );
}

function SeamReviewBar(): ReactNode {
  const { seam, total, reviewed } = useSeamReview();
  // Enter approves and Backspace restores, ahead of the editor's own keys (Delete cuts clips).
  useEffect(() => {
    const key = (e: KeyboardEvent): void => {
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable) return;
      if (document.querySelector("dialog[open]")) return;
      const act =
        e.key === "Enter"
          ? approveSeamNow
          : e.key === "Backspace"
            ? restoreSeamNow
            : e.key === "Escape"
              ? stopSeamReview
              : e.key === "ArrowRight" && !e.shiftKey
                ? skipSeam
                : e.key.toLowerCase() === "r" && !e.ctrlKey
                  ? replaySeam
                  : null;
      if (!act) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      act();
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, []);
  return (
    <section className="proposal review-seams" aria-label="Revisar cortes">
      <div className="proposal-head">
        <Scissors size={14} className="accent" />
        <strong>Revisar cortes</strong>
        <span className="muted">
          {reviewed} de {total} aprovados
          {seam
            ? ` · corte em ${fmt(seam.at)}${seam.removed > 0 ? `, tirou ${secs(seam.removed)}` : ""}`
            : " · nenhum corte pendente"}
        </span>
        <span className="spacer" />
        {seam && (
          <>
            <span className="muted review-keys">
              <Kbd>Enter</Kbd> aprova · <Kbd>Backspace</Kbd> restaura · <Kbd>→</Kbd> pula ·{" "}
              <Kbd>R</Kbd> ouve de novo
            </span>
            <Button size="sm" variant="ghost" icon={Headphones} onClick={replaySeam}>
              Ouvir de novo
            </Button>
            <Button size="sm" variant="ghost" icon={SkipForward} onClick={skipSeam}>
              Pular
            </Button>
            <Button
              size="sm"
              icon={Undo2}
              disabled={seam.removed <= 0}
              onClick={restoreSeamNow}
              title="Traz de volta o que o corte tirou"
            >
              Restaurar trecho
            </Button>
            <Button size="sm" variant="primary" icon={Check} onClick={approveSeamNow}>
              Aprovar
            </Button>
          </>
        )}
        <Button size="sm" variant="ghost" icon={X} onClick={stopSeamReview}>
          Sair
        </Button>
      </div>
    </section>
  );
}

function DraftReview(): ReactNode {
  const draft = useProject((s) => s.draft);
  const project = useProject((s) => s.project);
  const [open, setOpen] = useState(true);
  if (!draft || !project) return null;
  const conflicts = new Set(draftView({ project, draft }).conflicts);
  const pending = draft.items.filter((i) => i.status === "pending");
  const stuck = pending.filter((i) => conflicts.has(i.id)).length;
  return (
    <section className="proposal review-draft" aria-label="Rascunho para revisar">
      <div className="proposal-head">
        <Wand2 size={14} className="accent" />
        <strong>{draft.title}</strong>
        <span className="muted">
          Rascunho de {authorLabel(draft.author)}: {pending.length}{" "}
          {pending.length === 1 ? "mudança" : "mudanças"} de {draft.items.length}. A prévia já
          mostra como fica.
        </span>
        <button type="button" className="link" onClick={() => setOpen(!open)}>
          {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}{" "}
          {open ? "Ocultar" : "Ver lista"}
        </button>
        <span className="spacer" />
        <Button size="sm" variant="ghost" icon={X} onClick={discardDraftNow}>
          Descartar
        </Button>
        <Button
          size="sm"
          variant="primary"
          icon={Check}
          disabled={!pending.length || stuck > 0}
          onClick={applyDraftNow}
          title={stuck ? "Deixe de fora os itens que não cabem mais" : undefined}
        >
          Aplicar
        </Button>
      </div>
      {stuck > 0 && (
        <p className="review-warning">
          {stuck === 1 ? "Um item não cabe mais" : `${stuck} itens não cabem mais`}: a aula mudou
          nesses pontos depois do rascunho. Deixe-os de fora para aplicar o resto.
        </p>
      )}
      {open && (
        <div className="proposal-list">
          {draft.items.map((item) => {
            const left = item.status === "rejected";
            const stale = !left && conflicts.has(item.id);
            return (
              <div
                key={item.id}
                className={`proposal-item${left ? " is-left-out" : ""}${stale ? " is-stale" : ""}`}
              >
                <button
                  type="button"
                  className="link mono accent"
                  disabled={item.at === undefined}
                  onClick={() => listenDraftItem(item)}
                  title="Ouvir a partir de 1,5 s antes"
                >
                  {item.at !== undefined ? fmt(item.at) : "aula"}
                </button>
                <span className="proposal-text review-label">{item.label}</span>
                <span className="muted spacer">{stale ? "a aula mudou aqui" : ""}</span>
                <button type="button" className="link" onClick={() => toggleDraftItem(item.id)}>
                  {left ? "Incluir" : "Deixar de fora"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ProposalReview(): ReactNode {
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
  // A proposal with categories is listed by category, each one left out or brought back at once.
  const groups = new Map<CutCategory | "other", { item: ProposalItem; index: number }[]>();
  proposal.items.forEach((item, index) => {
    const key = item.category ?? "other";
    groups.set(key, [...(groups.get(key) ?? []), { item, index }]);
  });
  const byCategory = groups.size > 1 || !groups.has("other");
  const row = ({ item, index }: { item: ProposalItem; index: number }): ReactNode => {
    const place = places[index];
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
              ? "Ir até 1 s antes"
              : "Este trecho não foi encontrado de novo na aula e fica de fora"
          }
        >
          {place ? fmt(place[0]) : "--:--"}
        </button>
        <span className="proposal-text">
          {item.text ? `"${item.text}"` : place ? secs(place[1] - place[0]) : "trecho"}
        </span>
        <span className="muted spacer">
          {place ? item.reason : `não encontrado, fica de fora (${item.reason})`}
        </span>
        {place && (
          <button
            type="button"
            className="link"
            onClick={() => listenSkipping(place)}
            title="Toca 1,5 s antes e 1,5 s depois, já sem o trecho"
          >
            <Headphones size={11} /> Ouvir pulando o corte
          </button>
        )}
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
  };
  return (
    <section className="proposal" aria-label="Proposta de cortes">
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
                {p.title} ({authorLabel(p.by)})
              </option>
            ))}
          </select>
        ) : (
          <strong>{proposal.title}</strong>
        )}
        <span className="muted">
          {proposal.by === "limpeza" || proposal.by === "voz" || proposal.by === "preparar"
            ? "A limpeza propõe"
            : "A IA propõe"}{" "}
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
          {byCategory
            ? [...groups].map(([key, list]) => {
                const pendingHere = list.filter((x) => x.item.status === "pending").length;
                return (
                  <div key={key} className="review-group">
                    <div className="review-group-head">
                      <strong>
                        {key === "other" ? "Outros cortes" : CATEGORY_LABEL[key]} ({list.length})
                      </strong>
                      {key !== "other" && (
                        <button
                          type="button"
                          className="link"
                          onClick={() =>
                            setProposalCategory(
                              proposal.id,
                              key,
                              pendingHere ? "rejected" : "pending",
                            )
                          }
                        >
                          {pendingHere ? "Deixar todos de fora" : "Incluir todos"}
                        </button>
                      )}
                    </div>
                    {list.map(row)}
                  </div>
                );
              })
            : proposal.items.map((item, index) => row({ item, index }))}
        </div>
      )}
    </section>
  );
}
