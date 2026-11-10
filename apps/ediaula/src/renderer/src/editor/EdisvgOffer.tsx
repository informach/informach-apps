import { Clapperboard, Download, X } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import {
  checkEdisvgAnimations,
  declineEdisvgAnimations,
  placeEdisvgAnimations,
  useEdisvgOffer,
} from "@/lib/edisvgOffer";
import { useProject } from "@/state/project";
import { Button } from "@/ui";

const clock = (s: number): string =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * "O EdiSVG mandou animações para esta aula": the bar that puts them on their track above the
 * screen recording (lib/edisvgOffer.ts). It looks when a lesson opens and when the window comes
 * back to the front, as after sending from EdiSVG.
 */
export function EdisvgOffer(): ReactNode {
  const projectId = useProject((s) => s.project?.id);
  const offer = useEdisvgOffer((s) => (s.projectId === projectId ? s.offer : null));
  const placing = useEdisvgOffer((s) => s.placing);
  useEffect(() => {
    if (!projectId) return;
    void checkEdisvgAnimations();
    const look = () => void checkEdisvgAnimations();
    window.addEventListener("focus", look);
    return () => window.removeEventListener("focus", look);
  }, [projectId]);
  if (!offer) return null;
  const scenes = offer.items.filter((i) => i.kind === "game-scene").length;
  const demos = offer.items.length - scenes;
  const what = [scenes ? `${scenes} em tela inteira` : "", demos ? `${demos} sobre a tela` : ""]
    .filter(Boolean)
    .join(" e ");
  return (
    <section className="prepare-offer" aria-label="Animações do EdiSVG">
      <Clapperboard size={15} className="accent" />
      <span className="spacer">
        <strong>
          O EdiSVG mandou{" "}
          {offer.items.length === 1 ? "1 animação" : `${offer.items.length} animações`} para esta
          aula
        </strong>{" "}
        ({what}: {offer.items.map((i) => clock(i.start)).join(", ")}). Elas entram numa faixa logo
        acima da gravação de tela, cada uma no seu segundo; uma enviada de novo troca a anterior.
      </span>
      <Button
        size="sm"
        variant="primary"
        icon={Download}
        disabled={placing}
        onClick={() => void placeEdisvgAnimations()}
      >
        {placing ? "Colocando…" : "Colocar na aula"}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        icon={X}
        disabled={placing}
        onClick={() => void declineEdisvgAnimations()}
      >
        Agora não
      </Button>
    </section>
  );
}
