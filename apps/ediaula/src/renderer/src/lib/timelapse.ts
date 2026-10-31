import { type LapseChoice, setLapse } from "@shared/timelapse";
import { useApp } from "@/state/app";
import { useProject } from "@/state/project";

const DONE: Record<LapseChoice["kind"], string> = {
  under: "A tela passa acelerada sob a fala.",
  space: "A voz espera enquanto a tela passa.",
  cut: "Ficou só o que foi gravado durante a fala.",
};

/** "Tela sem voz": what the stretch becomes, in one step of undo. */
export function applyLapse(clipId: string, choice: LapseChoice): boolean {
  const { project, commit } = useProject.getState();
  if (!project) return false;
  const clips = setLapse(project, clipId, choice);
  if (!clips) {
    useApp
      .getState()
      .toast("Este trecho está numa faixa travada: destrave a faixa para mudar.", "error");
    return false;
  }
  const ok = commit((p) => ({ ...p, clips }));
  if (ok) useApp.getState().toast(DONE[choice.kind], "success");
  return ok;
}
