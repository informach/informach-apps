import {
  AudioLines,
  Blend,
  Captions,
  FolderOpen,
  LayoutTemplate,
  ListChecks,
  type LucideIcon,
  MessageSquareText,
  MousePointerClick,
  MoveDiagonal,
  Video,
  ZoomIn,
} from "lucide-react";
import type { ReactNode } from "react";

import { openRecorder } from "@/lib/recording";
import { type LeftPanel, useApp } from "@/state/app";
import { usePlayback } from "@/state/playback";
import { useProject } from "@/state/project";

type Action = LeftPanel | "record" | "recording";

const ITEMS: [string, LucideIcon, Action][] = [
  ["Etapas", ListChecks, "lessonFlow"],
  ["Mídia", FolderOpen, "media"],
  ["Gravar", Video, "record"],
  ["Templates", LayoutTemplate, "templates"],
  ["Anotações", MessageSquareText, "annotations"],
  ["Cursor", MousePointerClick, "recording"],
  ["Zoom", ZoomIn, "zoom"],
  ["Transições", Blend, "transitions"],
  ["Animações", MoveDiagonal, "motions"],
  ["Áudio", AudioLines, "audio"],
  ["Legendas", Captions, "captions"],
];

/** Cursor and recording zoom live in the Properties of a screen recording: select the one on screen (or the first). */
export function showRecordingProps(): void {
  const p = useProject.getState().project;
  if (!p) return;
  const t = usePlayback.getState().time;
  const recorded = p.clips.filter((c) => p.assets.find((a) => a.id === c.assetId)?.cursor);
  const clip = recorded.find((c) => t >= c.start && t < c.start + c.duration) ?? recorded[0];
  if (!clip) {
    useApp
      .getState()
      .toast(
        "Cursor e zoom automático valem para gravações feitas no EdiAula (botão Gravar).",
        "info",
      );
    return;
  }
  useProject.getState().select([clip.id]);
  useApp.getState().set({ sideTab: "properties" });
}

export function ToolRail(): ReactNode {
  const left = useApp((s) => s.leftPanel);
  return (
    <nav className="rail">
      {ITEMS.map(([label, Icon, action]) => (
        <button
          type="button"
          key={label}
          className={`rail-item ${left === action ? "is-active" : ""}`}
          title={label}
          onClick={
            action === "record"
              ? () => void openRecorder()
              : action === "recording"
                ? showRecordingProps
                : () => useApp.getState().set({ leftPanel: action })
          }
        >
          <Icon size={19} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
