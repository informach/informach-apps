import type { AssetLink } from "@informach/edi-link/contract";
import { AlertTriangle, Loader, PenTool } from "lucide-react";
import type { ReactNode } from "react";
import { useLinkStatus } from "@/lib/edisvgLink";

/** Where a linked animation stands, for its seal on the timeline and in the library. */
export type LinkState = "ok" | "waiting" | "failed" | "missing";

const HINT: Record<LinkState, string> = {
  ok: "Vinculado ao EdiSVG: duplo clique no clipe abre a animação lá, e cada salvar atualiza aqui",
  waiting: "Aguardando o EdiSVG: a animação aparece aqui quando for salva lá",
  failed: "O último render no EdiSVG falhou: o clipe mostra o render anterior",
  missing: "O projeto do EdiSVG não foi encontrado: o clipe mostra o último render",
};

/** The state of `link` (the projects' status comes from lib/edisvgLink.ts). */
export function useLinkState(
  link: AssetLink | undefined,
): { state: LinkState; hint: string } | null {
  const status = useLinkStatus((s) =>
    link ? s.projects.get(link.project.toLowerCase()) : undefined,
  );
  if (!link) return null;
  const error = link.animationId ? status?.errors.get(link.animationId) : undefined;
  const state: LinkState =
    status?.exists === false
      ? "missing"
      : error
        ? "failed"
        : !link.animationId || !link.hash
          ? "waiting"
          : "ok";
  return { state, hint: error ? `${HINT.failed}: ${error}` : HINT[state] };
}

/** The EdiSVG seal: the pen with "EdiSVG", or the warning of a link that needs a look. */
export function LinkSeal({
  state,
  compact = false,
}: {
  state: LinkState;
  /** Icon only (a short clip on the timeline). */
  compact?: boolean;
}): ReactNode {
  const Icon = state === "ok" ? PenTool : state === "waiting" ? Loader : AlertTriangle;
  return (
    <span className={`link-seal is-${state}`}>
      <Icon size={10} />
      {!compact && "EdiSVG"}
    </span>
  );
}
