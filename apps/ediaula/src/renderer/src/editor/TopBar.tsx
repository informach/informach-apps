import { explainSaveError, saveErrorDetail, saveErrorShort } from "@shared/saveError";
import { CircleDot, FolderOpen, GraduationCap, Settings, Upload, Wand2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { actions } from "@/lib/actions";
import { copySelection, cutSelection, paste } from "@/lib/clipboard";
import { askPasteProps, copyProps } from "@/lib/clipProps";
import { saveCourseTemplateFromLesson } from "@/lib/courseTemplate";
import { exportCurrentFrame, openPackagedLesson, packLesson } from "@/lib/exportExtras";
import { openPrepare } from "@/lib/prepare";
import { duplicateLesson } from "@/lib/projectFiles";
import { useRecorderKey } from "@/lib/recorderKeys";
import { openRecorder } from "@/lib/recording";
import { startSeamReview } from "@/lib/review";
import { zoomToFit } from "@/lib/timelineView";
import { exportVoiceFiles, importPresenterVideos, importVoiceFiles } from "@/lib/voice";
import { useApp } from "@/state/app";
import { useExportQueue } from "@/state/exportQueue";
import { useProject } from "@/state/project";
import { Button, IconButton, Menu } from "@/ui";
import { BackupsDialog, RenameDialog } from "./ProjectDialogs";

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
  const path = useProject((s) => s.path);
  const interval = useApp((s) => s.interval);
  const set = useApp((s) => s.set);
  const [dialog, setDialog] = useState<"rename" | "backups" | null>(null);

  const openOther = async (): Promise<void> => {
    const path = await window.api.pickProject();
    if (path) await actions.openProject(path);
  };

  return (
    <>
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
                {
                  label: "Duplicar aula",
                  disabled: !path,
                  onSelect: () => path && void duplicateLesson(path),
                },
                { label: "Renomear aula…", disabled: !path, onSelect: () => setDialog("rename") },
                {
                  label: "Restaurar cópia de segurança…",
                  disabled: !path,
                  onSelect: () => setDialog("backups"),
                },
                { separator: true, label: "" },
                {
                  label: "Exportar…",
                  shortcut: "Ctrl+E",
                  onSelect: () => set({ exportOpen: true }),
                },
                {
                  label: "Fila de exportação…",
                  onSelect: () => useExportQueue.setState({ open: true }),
                },
                {
                  label: "Exportar o quadro atual (PNG)…",
                  disabled: !project?.clips.length,
                  onSelect: () => void exportCurrentFrame(),
                },
                { separator: true, label: "" },
                {
                  label: "Enviar para a edição (empacotar com as mídias)…",
                  disabled: !project,
                  onSelect: packLesson,
                },
                { label: "Abrir aula empacotada…", onSelect: () => void openPackagedLesson() },
                { separator: true, label: "" },
                {
                  label: "Importar voz…",
                  disabled: !project,
                  onSelect: () => void importVoiceFiles(),
                },
                {
                  label: "Exportar a voz (para o vídeo do apresentador)",
                  disabled: !project,
                  onSelect: () => void exportVoiceFiles("lesson"),
                },
                {
                  label: "Importar vídeo do apresentador…",
                  disabled: !project,
                  onSelect: () => void importPresenterVideos(true),
                },
                {
                  label: "Gravar a tela sobre a narração…",
                  disabled: !project,
                  onSelect: () => void openRecorder({ mode: "over" }),
                },
                { separator: true, label: "" },
                {
                  label: "Mudar formato…",
                  disabled: !project,
                  onSelect: () => set({ reframeOpen: true }),
                },
                {
                  label: "Salvar como modelo do curso",
                  disabled: !project?.course,
                  onSelect: () => void saveCourseTemplateFromLesson(),
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
                {
                  label: "Excluir o intervalo em todas as faixas",
                  disabled: !interval || interval.end <= interval.start,
                  onSelect: () => void actions.rippleDeleteInterval(),
                },
                {
                  label: "Revisar cortes",
                  disabled: !project?.clips.length,
                  onSelect: startSeamReview,
                },
                { separator: true, label: "" },
                {
                  label: "Selecionar tudo",
                  shortcut: "Ctrl+A",
                  onSelect: () =>
                    useProject.getState().select(project?.clips.map((c) => c.id) ?? []),
                },
                {
                  label: "Selecionar tudo a partir do cursor",
                  onSelect: () => actions.selectFromPlayhead(),
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
                { label: "Devagar (0,5× e 0,25×)", shortcut: "K + J ou L" },
                { label: "Quadro anterior / próximo", shortcut: "← →" },
                { label: "Ferramenta corte / seleção", shortcut: "C  V" },
                { label: "Dividir no cursor", shortcut: "S" },
                { label: "Zoom da timeline", shortcut: "+  −  \\" },
                { label: "Zoom com o mouse", shortcut: "Ctrl+roda" },
                { label: "Aparar empurrando o resto", shortcut: "Shift+borda" },
                { label: "Inserir empurrando o resto", shortcut: "Ctrl ao soltar" },
                { label: "Camada de baixo na prévia", shortcut: "Alt+clique na prévia" },
                { label: "Agrupar / desagrupar", shortcut: "Ctrl+G  Ctrl+Shift+G" },
                { label: "Só um clipe do grupo", shortcut: "Alt+clique na timeline" },
                { label: "Marcador no cursor", shortcut: "M" },
                { label: "Próximo / anterior marcador", shortcut: "Shift+M  Alt+M" },
                { label: "Palavra anterior / próxima", shortcut: "Alt+← →" },
                { label: "Frase ou silêncio", shortcut: "Alt+Shift+← →" },
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
          <span
            className={`save-pill save-${saveError ? "error" : saveState}`}
            title={saveError && saveErrorDetail(saveError)}
          >
            <span className="dot" />
            {saveError && saveState === "saving"
              ? "Tentando salvar…"
              : SAVE_LABEL[saveError ? "error" : saveState]}
          </span>
          {saveError && (
            // Stays until a save succeeds: the work since the last save exists only in memory.
            <span className="save-alert" role="alert">
              <span
                className="save-alert-text"
                title={`${explainSaveError(saveError)}\n\n${saveErrorDetail(saveError)}`}
              >
                {saveErrorShort(saveError)}
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
            icon={Wand2}
            onClick={openPrepare}
            disabled={!project?.clips.length}
            title="Transcrever, cortar, encaixar, dar zoom, anotar, legendar e verificar, etapa por etapa"
          >
            Preparar aula
          </Button>
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
      {/* Outside the title bar, which drags the window. */}
      {dialog === "rename" && path && project && (
        <RenameDialog path={path} name={project.name} onClose={() => setDialog(null)} />
      )}
      {dialog === "backups" && path && (
        <BackupsDialog path={path} onClose={() => setDialog(null)} />
      )}
    </>
  );
}
