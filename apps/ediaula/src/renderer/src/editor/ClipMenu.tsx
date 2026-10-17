import { clipSpeed } from "@shared/timeline";
import {
  ClipboardPaste,
  Copy,
  Gauge,
  PaintBucket,
  Paintbrush,
  Scissors,
  SplitSquareHorizontal,
  Trash2,
} from "lucide-react";
import type { ReactNode } from "react";
import { actions } from "@/lib/actions";
import { copySelection, cutSelection, paste } from "@/lib/clipboard";
import { askPasteProps, copiedProps, copyProps } from "@/lib/clipProps";
import { hasSpeed, speedLabel } from "@/lib/speed";
import { useApp } from "@/state/app";
import { playback } from "@/state/playback";
import { useProject } from "@/state/project";
import { ContextMenu } from "@/ui";

/**
 * Right-click menu of a clip on the timeline. It acts on the selection (the clicked clip is
 * selected first when it was not). New actions go in `items`.
 */
export function ClipMenu({
  x,
  y,
  clipId,
  onClose,
}: {
  x: number;
  y: number;
  clipId: string;
  onClose: () => void;
}): ReactNode {
  const project = useProject((s) => s.project);
  const selection = useProject((s) => s.selection);
  const clip = project?.clips.find((c) => c.id === clipId);
  if (!project || !clip) return null;
  const ids = selection.includes(clipId) ? selection : [clipId];
  const timed = project.clips.filter((c) => ids.includes(c.id) && hasSpeed(project, c));
  const speed = clipSpeed(clip);

  return (
    <ContextMenu
      x={x}
      y={y}
      onClose={onClose}
      items={[
        {
          icon: Gauge,
          label: `Velocidade do clipe…${speed !== 1 ? ` (${speedLabel(speed)})` : ""}`,
          disabled: !timed.length,
          hint: timed.length
            ? undefined
            : "Imagens, anotações e camadas de zoom não têm velocidade",
          onSelect: () => useApp.getState().set({ speedClips: timed.map((c) => c.id) }),
        },
        { separator: true, label: "" },
        {
          icon: Paintbrush,
          label: "Editar caminho do cursor…",
          disabled:
            !project.assets.find((a) => a.id === clip.assetId)?.cursor ||
            project.tracks.find((t) => t.id === clip.trackId)?.locked,
          hint: "Editar o caminho no intervalo deste clipe",
          onSelect: () => {
            playback.pause();
            useApp.getState().set({ cursorClip: clipId });
          },
        },
        {
          icon: SplitSquareHorizontal,
          label: "Estender quadro…",
          disabled:
            project.assets.find((a) => a.id === clip.assetId)?.kind !== "video" ||
            project.tracks.find((t) => t.id === clip.trackId)?.locked,
          onSelect: () => useApp.getState().set({ extendClip: clipId }),
        },
        {
          icon: Paintbrush,
          label: "Copiar propriedades",
          shortcut: "Ctrl+Alt+C",
          onSelect: () => copyProps(clipId),
        },
        {
          icon: PaintBucket,
          label: `Colar propriedades…${ids.length > 1 ? ` (${ids.length} clipes)` : ""}`,
          shortcut: "Ctrl+Alt+V",
          disabled: !copiedProps() || ids.every((id) => id === copiedProps()?.clip.id),
          hint: copiedProps() ? undefined : "Primeiro use Copiar propriedades em outro clipe",
          onSelect: () => askPasteProps(ids),
        },
        { separator: true, label: "" },
        { icon: Copy, label: "Copiar", shortcut: "Ctrl+C", onSelect: () => void copySelection() },
        { icon: Scissors, label: "Recortar", shortcut: "Ctrl+X", onSelect: cutSelection },
        { icon: ClipboardPaste, label: "Colar no cursor", shortcut: "Ctrl+V", onSelect: paste },
        { separator: true, label: "" },
        {
          icon: SplitSquareHorizontal,
          label: "Dividir no cursor",
          shortcut: "S",
          onSelect: actions.splitAtPlayhead,
        },
        {
          icon: Trash2,
          label: "Excluir",
          shortcut: "Del",
          onSelect: () => actions.deleteSelection(false),
        },
      ]}
    />
  );
}
