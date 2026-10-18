import { CircleDot, FolderOpen, GraduationCap, Settings, Upload } from "lucide-react";
import type { ReactNode } from "react";
import { actions } from "@/lib/actions";
import { copySelection, cutSelection, paste } from "@/lib/clipboard";
import { askPasteProps, copyProps } from "@/lib/clipProps";
import { useRecorderKey } from "@/lib/recorderKeys";
import { openRecorder } from "@/lib/recording";
import { zoomToFit } from "@/lib/timelineView";
import { useApp } from "@/state/app";
import { useExportQueue } from "@/state/exportQueue";
import { useProject } from "@/state/project";
import { Button, IconButton, Menu } from "@/ui";

const SAVE_LABEL = {
  saved: "Salvo automaticamente",
  pending: "Alterações não salvas…",
  saving: "Salvando…",
  error: "Erro ao salvar",
} as const;

export function TopBar(): ReactNode {
  const toggleKey = useRecorderKey("toggle");
  const stopKey = useRecorderKey("stop");
  const project = useProject((s) => s.project);
  const saveState = useProject((s) => s.saveState);
  const saveError = useProject((s) => s.saveError);
  const canUndo = useProject((s) => s.past.length > 0);
  const canRedo = useProject((s) => s.future.length > 0);
  const hasSelection = useProject((s) => s.selection.length > 0);
  const selectionCount = useProject((s) => s.selection.length);
  const set = useApp((s) => s.set);

  const openOther = async (): Promise<void> => {
    const path = await window.api.pickProject();
    if (path) await actions.openProject(path);
  };

  return (
    <header className="topbar drag">
      <div className="topbar-left">
        <button
          type="button"
          className="logo no-drag"
          onClick={() => void actions.goHome()}
          title="Voltar ao início"
        >
          <span className="logo-mark">
            <GraduationCap size={16} />
          </span>
          <span className="logo-text">EdiAula</span>
        </button>
        <nav className="menubar">
          <Menu
            label="Arquivo"
            items={[
              {
                label: "Importar mídia…",
                shortcut: "Ctrl+I",
                onSelect: () => void actions.importDialog(),
              },
              { label: "Abrir projeto…", onSelect: () => void openOther() },
              {
                label: "Salvar agora",
                shortcut: "Ctrl+S",
                onSelect: () => void useProject.getState().saveNow(),
              },
              { separator: true, label: "" },
              { label: "Exportar…", shortcut: "Ctrl+E", onSelect: () => set({ exportOpen: true }) },
              {
                label: "Fila de exportação…",
                onSelect: () => useExportQueue.setState({ open: true }),
              },
              { separator: true, label: "" },
              { label: "Voltar ao início", onSelect: () => void actions.goHome() },
            ]}
          />
          <Menu
            label="Editar"
            items={[
              {
                label: "Desfazer",
                shortcut: "Ctrl+Z",
                disabled: !canUndo,
                onSelect: () => useProject.getState().undo(),
              },
              {
                label: "Refazer",
                shortcut: "Ctrl+Shift+Z",
                disabled: !canRedo,
                onSelect: () => useProject.getState().redo(),
              },
              { separator: true, label: "" },
              {
                label: "Recortar",
                shortcut: "Ctrl+X",
                disabled: !hasSelection,
                onSelect: cutSelection,
              },
              {
                label: "Copiar",
                shortcut: "Ctrl+C",
                disabled: !hasSelection,
                onSelect: () => void copySelection(),
              },
              { label: "Colar no cursor", shortcut: "Ctrl+V", onSelect: paste },
              {
                label: "Copiar propriedades",
                shortcut: "Ctrl+Alt+C",
                disabled: selectionCount !== 1,
                onSelect: () => copyProps(useProject.getState().selection[0]),
              },
              {
                label: "Colar propriedades…",
                shortcut: "Ctrl+Alt+V",
                disabled: !hasSelection,
                onSelect: () => askPasteProps(),
              },
              { separator: true, label: "" },
              {
                label: "Dividir no cursor de reprodução",
                shortcut: "S",
                onSelect: actions.splitAtPlayhead,
              },
              {
                label: "Excluir",
                shortcut: "Del",
                disabled: !hasSelection,
                onSelect: () => actions.deleteSelection(false),
              },
              {
                label: "Excluir e fechar lacuna",
                shortcut: "Shift+Del",
                disabled: !hasSelection,
                onSelect: () => actions.deleteSelection(true),
              },
              { label: "Fechar todas as lacunas", onSelect: actions.closeGaps },
              { separator: true, label: "" },
              {
                label: "Selecionar tudo",
                shortcut: "Ctrl+A",
                onSelect: () => useProject.getState().select(project?.clips.map((c) => c.id) ?? []),
              },
            ]}
          />
          <Menu
            label="Exibir"
            items={[
              { label: "Ajustar timeline à tela", shortcut: "\\", onSelect: zoomToFit },
              { label: "Faixa de vídeo nova", onSelect: () => actions.addTrack("video") },
              { label: "Faixa de áudio nova", onSelect: () => actions.addTrack("audio") },
            ]}
          />
          <Menu
            label="Ajuda"
            items={[
              { label: "Play / pausa", shortcut: "Espaço" },
              { label: "Voltar / pausar / avançar", shortcut: "J  K  L" },
              { label: "Quadro anterior / próximo", shortcut: "← →" },
              { label: "Ferramenta corte / seleção", shortcut: "C  V" },
              { label: "Dividir no cursor", shortcut: "S" },
              { label: "Zoom da timeline", shortcut: "+  −  \\" },
              { label: "Zoom com o mouse", shortcut: "Ctrl+roda" },
            ]}
          />
        </nav>
      </div>

      <div className="topbar-center">
        <FolderOpen size={15} className="muted" />
        <span className="project-name">
          {project?.course ? `${project.course} / ` : ""}
          {project?.name}
        </span>
        <span className={`save-pill save-${saveError ? "error" : saveState}`} title={saveError}>
          <span className="dot" />
          {saveError && saveState === "saving"
            ? "Tentando salvar…"
            : SAVE_LABEL[saveError ? "error" : saveState]}
        </span>
        {saveError && (
          // Stays until a save succeeds: the work since the last save exists only in memory.
          <span className="save-alert" role="alert">
            <span className="save-alert-text" title={saveError}>
              {saveError}
            </span>
            <Button
              size="sm"
              disabled={saveState === "saving"}
              onClick={() => void useProject.getState().saveNow()}
            >
              Tentar de novo
            </Button>
            <Button
              size="sm"
              disabled={saveState === "saving"}
              onClick={() => void useProject.getState().saveCopyAs()}
            >
              Salvar cópia…
            </Button>
          </span>
        )}
      </div>

      <div className="topbar-right">
        <IconButton
          icon={Settings}
          label="Configurações de IA"
          onClick={() => set({ settingsOpen: true })}
        />
        <Button
          variant="secondary"
          icon={CircleDot}
          onClick={() => void openRecorder()}
          title={`Gravar a tela com o cursor à parte (${toggleKey} inicia, ${stopKey} para)`}
        >
          Gravar tela
        </Button>
        <Button
          variant="primary"
          icon={Upload}
          onClick={() => set({ exportOpen: true })}
          disabled={!project?.clips.length}
        >
          Exportar
        </Button>
      </div>
    </header>
  );
}
