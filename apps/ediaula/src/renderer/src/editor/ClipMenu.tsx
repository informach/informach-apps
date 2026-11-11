import { defaultSpace as spaceOf } from "@shared/timelapse";
import { clipSpeed } from "@shared/timeline";
import {
  ClipboardPaste,
  Copy,
  FastForward,
  Gauge,
  Group,
  PaintBucket,
  Paintbrush,
  PenTool,
  Scissors,
  SplitSquareHorizontal,
  Trash2,
  Ungroup,
  Unlink,
} from "lucide-react";
import type { ReactNode } from "react";
import { actions } from "@/lib/actions";
import { copySelection, cutSelection, paste } from "@/lib/clipboard";
import { askPasteProps, copiedProps, copyProps } from "@/lib/clipProps";
import { editInEdisvg, useLinkStatus } from "@/lib/edisvgLink";
import { hasSpeed, speedLabel } from "@/lib/speed";
import { applyLapse } from "@/lib/timelapse";
import { useApp } from "@/state/app";
import { playback } from "@/state/playback";
import { useProject } from "@/state/project";
import { ContextMenu } from "@/ui";
import { startExtendFrame } from "./ExtendFrameDialog";

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
  const linkProjects = useLinkStatus((s) => s.projects);
  const clip = project?.clips.find((c) => c.id === clipId);
  if (!project || !clip) return null;
  const ids = selection.includes(clipId) ? selection : [clipId];
  // "Tela sem voz" has its own speed (setLapse): the clip speed leaves it alone.
  const timed = project.clips.filter(
    (c) => ids.includes(c.id) && hasSpeed(project, c) && !c.timelapse,
  );
  const locked = !!project.tracks.find((t) => t.id === clip.trackId)?.locked;
  const space = clip.timelapse ? spaceOf(clip.timelapse) : 0;
  const linked = project.assets.find((a) => a.id === clip.assetId)?.link;
  // Where the linked project stands (lib/edisvgLink.ts): moved away, or its last render failed.
  const linkStatus = linked ? linkProjects.get(linked.project.toLowerCase()) : undefined;
  const linkError = linked?.animationId ? linkStatus?.errors.get(linked.animationId) : undefined;
  const speed = clipSpeed(clip);

  return (
    <ContextMenu
      x={x}
      y={y}
      onClose={onClose}
      items={[
        ...(linked
          ? [
              {
                icon: PenTool,
                label: "Editar no EdiSVG",
                disabled: !linked.animationId || linkStatus?.exists === false,
                hint:
                  linkStatus?.exists === false
                    ? "O projeto do EdiSVG não foi encontrado: o clipe mostra o último render"
                    : linkError
                      ? `O último render no EdiSVG falhou: ${linkError}`
                      : linked.animationId
                        ? "Abre esta animação no EdiSVG: cada salvar lá atualiza o clipe aqui"
                        : "A animação ainda não chegou do EdiSVG",
                onSelect: () => void editInEdisvg(clip.assetId),
              },
              { separator: true, label: "" },
            ]
          : []),
        ...(clip.timelapse
          ? [
              {
                icon: FastForward,
                label: "Tela sem voz: acelerar sob a fala",
                disabled: locked,
                onSelect: () => applyLapse(clipId, { kind: "under" }),
              },
              {
                icon: FastForward,
                label: `Tela sem voz: abrir ${space} s na voz`,
                disabled: locked || space < 1,
                hint: "Ajuste os segundos nas propriedades do clipe",
                onSelect: () => applyLapse(clipId, { kind: "space", seconds: space }),
              },
              {
                icon: FastForward,
                label: "Tela sem voz: cortar o tempo extra",
                disabled: locked,
                onSelect: () => applyLapse(clipId, { kind: "cut" }),
              },
              { separator: true, label: "" },
            ]
          : []),
        {
          icon: Gauge,
          label: `Velocidade do clipe…${speed !== 1 ? ` (${speedLabel(speed)})` : ""}`,
          disabled: !timed.length || !!clip.timelapse,
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
          onSelect: () => void startExtendFrame(clipId),
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
        {
          icon: Unlink,
          label: "Separar áudio",
          disabled:
            project.assets.find((a) => a.id === clip.assetId)?.kind !== "video" ||
            !project.assets.find((a) => a.id === clip.assetId)?.hasAudio ||
            clip.volume <= 0 ||
            project.tracks.find((t) => t.id === clip.trackId)?.locked,
          hint: "O som vai para uma faixa própria, agrupado com o vídeo (cortes em J e L)",
          onSelect: () => actions.detachAudio(clipId),
        },
        {
          icon: Group,
          label: "Agrupar",
          shortcut: "Ctrl+G",
          disabled: ids.length < 2,
          onSelect: () => actions.group(),
        },
        {
          icon: Ungroup,
          label: "Desagrupar",
          shortcut: "Ctrl+Shift+G",
          disabled: !project.clips.some((c) => ids.includes(c.id) && c.groupId),
          onSelect: () => actions.ungroup(),
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
