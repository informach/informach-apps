import {
  Backpack,
  Bell,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  FolderOpen,
  type LucideIcon,
  NotebookPen,
  ShieldCheck,
} from "lucide-react";
import { getSubjectTintedClassByIndex } from "@/features/subjects/utils";

const INK_CLASS: Record<number, string> = {
  1: "text-chart-1-ink",
  2: "text-chart-2-ink",
  3: "text-chart-3-ink",
  4: "text-chart-4-ink",
  5: "text-chart-5-ink",
};

import type { ActivityType } from "./activity-types";

const ACTIVITY_PRESENTATION: Record<ActivityType, { icon: LucideIcon; color: number }> = {
  task: { icon: NotebookPen, color: 1 },
  exam: { icon: ClipboardCheck, color: 3 },
  project: { icon: FolderOpen, color: 5 },
  reminder: { icon: Bell, color: 4 },
  material: { icon: Backpack, color: 2 },
  authorization: { icon: ShieldCheck, color: 4 },
  event: { icon: CalendarDays, color: 5 },
  study: { icon: BookOpen, color: 1 },
};

export function getActivityPresentation(type: ActivityType) {
  const { icon, color } = ACTIVITY_PRESENTATION[type];
  return {
    icon,
    surface: getSubjectTintedClassByIndex(color),
    /** O texto na cor do tipo, como o "PROVA" do detalhe. */
    ink: INK_CLASS[color] ?? "text-muted-foreground",
  };
}
