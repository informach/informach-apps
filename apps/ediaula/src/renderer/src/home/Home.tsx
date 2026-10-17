import type { ProjectSettings, RecentEntry } from "@shared/types";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Circle,
  CircleDot,
  Cpu,
  FileUp,
  FolderOpen,
  GraduationCap,
  History,
  House,
  Plus,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { actions } from "@/lib/actions";
import { formatEditTime } from "@/lib/editTimer";
import { duration, relativeTime } from "@/lib/format";
import { confirmLeave } from "@/lib/leaveGuard";
import { mediaUrl } from "@/lib/media";
import { openRecorder } from "@/lib/recording";
import { useApp } from "@/state/app";
import { useProject } from "@/state/project";
import { Button, Chip } from "@/ui";
import { NewProjectModal } from "./NewProjectModal";

/** Cover colors for projects without a thumbnail, picked by name so they stay stable. */
const COVERS = ["#0033FF", "#7A4DFF", "#00A884", "#FF5A36", "#1F3A8A", "#C8F031", "#FFB547"];
const cover = (name: string): string =>
  COVERS[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % COVERS.length];
const darkText = (bg: string): boolean => bg === "#C8F031" || bg === "#FFB547";

type Status = { label: string; tone: string };
const status = (r: RecentEntry): Status =>
  r.assetCount === 0
    ? { label: "Vazio", tone: "var(--text-3)" }
    : r.exportedAt && r.exportedAt >= r.updatedAt - 2000
      ? { label: "Exportado", tone: "var(--accent)" }
      : { label: "Editando", tone: "var(--amber)" };

export function Home(): ReactNode {
  const info = useApp((s) => s.info);
  const [recent, setRecent] = useState<RecentEntry[] | null>(null);
  const [query, setQuery] = useState("");
  const [course, setCourse] = useState<string | null>(null);
  const [creating, setCreating] = useState<{ thenImport: boolean } | null>(null);

  const reload = (): void => {
    void window.api.recentProjects().then(setRecent);
  };
  useEffect(reload, []);

  const courses = useMemo(
    () => [...new Set((recent ?? []).map((r) => r.course).filter((c): c is string => !!c))],
    [recent],
  );
  const filtered = (recent ?? []).filter(
    (r) =>
      (!course || r.course === course) &&
      (!query || `${r.name} ${r.course ?? ""}`.toLowerCase().includes(query.toLowerCase())),
  );
  const last = recent?.[0];

  const create = async (
    name: string,
    courseName: string | undefined,
    settings: ProjectSettings,
  ): Promise<void> => {
    if (!(await confirmLeave())) return;
    const { path, project } = await window.api.createProject(name, courseName, settings);
    useProject.getState().load(path, project);
    useApp.getState().set({ screen: "editor" });
    if (creating?.thenImport) {
      const assets = await actions.importDialog();
      actions.appendAssets(assets);
    }
    setCreating(null);
  };

  const openOther = async (): Promise<void> => {
    const path = await window.api.pickProject();
    if (path) await actions.openProject(path);
  };

  return (
    <div className="home">
      <aside className="home-sidebar">
        <div className="home-logo drag">
          <span className="logo-mark">
            <GraduationCap size={17} />
          </span>
          <span className="logo-text">EdiAula</span>
        </div>
        <Button
          variant="primary"
          icon={Plus}
          className="w-full"
          onClick={() => setCreating({ thenImport: false })}
        >
          Novo projeto
        </Button>
        <nav className="home-nav">
          <button type="button" className="nav-item is-active">
            <House size={16} /> Início
          </button>
          <button type="button" className="nav-item" onClick={() => void openOther()}>
            <FolderOpen size={16} /> Abrir projeto…
          </button>
          <button
            type="button"
            className="nav-item"
            onClick={() => useApp.getState().set({ settingsOpen: true })}
          >
            <Sparkles size={16} /> Inteligência artificial
          </button>
        </nav>
        <div className="spacer" />
        <div className="home-sys">
          <Cpu size={14} />
          <span>
            Exportação: {info ? (info.encoder === "nvenc" ? "GPU (NVENC)" : "CPU (x264)") : "…"}
            <br />
            <span className="muted">EdiAula {info?.version ?? ""}</span>
          </span>
        </div>
      </aside>

      <main className="home-main">
        <header className="home-header drag">
          <div className="home-head-text">
            <h1>Suas aulas</h1>
            <p className="muted">
              {recent === null
                ? "Carregando…"
                : `${recent.length} ${recent.length === 1 ? "projeto" : "projetos"}${courses.length ? ` · ${courses.length} ${courses.length === 1 ? "curso" : "cursos"}` : ""}`}
            </p>
          </div>
          <label className="search no-drag">
            <Search size={14} />
            <input
              placeholder="Buscar aulas e cursos…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <Button
            variant="secondary"
            icon={CircleDot}
            onClick={() => void openRecorder()}
            title="Gravar a tela com o cursor à parte (F9 inicia, F10 para)"
          >
            Gravar tela
          </Button>
        </header>

        {recent !== null && recent.length === 0 ? (
          <div className="home-welcome">
            <div className="welcome-mark">
              <GraduationCap size={30} />
            </div>
            <h2>Comece sua primeira aula</h2>
            <p className="muted">
              Crie um projeto, importe as gravações e corte direto na timeline. Tudo é salvo
              automaticamente.
            </p>
            <div className="row-10">
              <Button
                variant="primary"
                icon={Plus}
                onClick={() => setCreating({ thenImport: true })}
              >
                Novo projeto com vídeos
              </Button>
              <Button variant="secondary" icon={FolderOpen} onClick={() => void openOther()}>
                Abrir projeto
              </Button>
            </div>
          </div>
        ) : (
          <>
            <section className="home-top">
              {last && <ContinueCard entry={last} />}
              <div className="quick-actions">
                <QuickAction
                  icon={FileUp}
                  color="var(--blue)"
                  title="Importar vídeos"
                  text="Cria um projeto e já coloca na timeline"
                  onClick={() => setCreating({ thenImport: true })}
                />
                <QuickAction
                  icon={Plus}
                  color="var(--accent)"
                  title="Projeto vazio"
                  text="Escolha nome, curso e formato"
                  onClick={() => setCreating({ thenImport: false })}
                />
                <QuickAction
                  icon={FolderOpen}
                  color="var(--violet)"
                  title="Abrir projeto"
                  text="Arquivo .ediaula de outra pasta"
                  onClick={() => void openOther()}
                />
              </div>
            </section>

            <section className="recent-head">
              <h2>Recentes</h2>
              {courses.length > 0 && (
                <div className="row-6">
                  <Chip active={!course} onClick={() => setCourse(null)}>
                    Todos
                  </Chip>
                  {courses.map((c) => (
                    <Chip key={c} active={course === c} onClick={() => setCourse(c)}>
                      {c}
                    </Chip>
                  ))}
                </div>
              )}
            </section>

            <section className="project-grid">
              {filtered.map((r) => (
                <ProjectCard
                  key={r.path}
                  entry={r}
                  onRemove={async () => {
                    await window.api.removeRecent(r.path);
                    reload();
                  }}
                />
              ))}
              {filtered.length === 0 && recent !== null && (
                <p className="muted">Nenhuma aula encontrada.</p>
              )}
            </section>
          </>
        )}
      </main>

      {creating && (
        <NewProjectModal courses={courses} onCancel={() => setCreating(null)} onCreate={create} />
      )}
    </div>
  );
}

function Cover({ entry, large }: { entry: RecentEntry; large?: boolean }): ReactNode {
  const bg = cover(entry.name);
  return (
    <div className={`cover ${large ? "cover-lg" : ""}`} style={{ background: bg }}>
      {entry.thumb ? (
        <img src={mediaUrl(entry.thumb)} alt="" draggable={false} />
      ) : (
        <span className="cover-title" style={{ color: darkText(bg) ? "#12140A" : "#fff" }}>
          {entry.name}
        </span>
      )}
    </div>
  );
}

function ContinueCard({ entry }: { entry: RecentEntry }): ReactNode {
  const st = status(entry);
  const steps: [string, "done" | "now" | "todo"][] = [
    ["Mídia importada", entry.assetCount > 0 ? "done" : "now"],
    ["Edição", entry.assetCount === 0 ? "todo" : st.label === "Exportado" ? "done" : "now"],
    ["Exportado", st.label === "Exportado" ? "done" : "todo"],
  ];
  return (
    <div className="continue-card">
      <Cover entry={entry} large />
      <div className="continue-info">
        <div className="kicker">
          <History size={14} /> CONTINUAR EDITANDO
        </div>
        <div>
          <h3>{entry.name}</h3>
          <p className="muted">
            {entry.course ? `${entry.course} · ` : ""}editado {relativeTime(entry.updatedAt)} ·{" "}
            {duration(entry.duration)} na timeline
          </p>
        </div>
        <div className="pipeline">
          {steps.map(([label, s], i) => (
            <span key={label} className="pipeline-item">
              <span className={`step step-${s}`}>
                {s === "done" ? <Check size={12} /> : <Circle size={12} />}
                {label}
              </span>
              {i < steps.length - 1 && <span className="step-line" />}
            </span>
          ))}
        </div>
        <div className="row-10">
          <Button
            variant="primary"
            icon={ArrowRight}
            onClick={() => void actions.openProject(entry.path)}
          >
            Abrir no editor
          </Button>
        </div>
      </div>
    </div>
  );
}

function QuickAction({
  icon: Icon,
  color,
  title,
  text,
  onClick,
}: {
  icon: typeof Plus;
  color: string;
  title: string;
  text: string;
  onClick: () => void;
}): ReactNode {
  return (
    <button type="button" className="quick-action" onClick={onClick}>
      <span className="qa-icon">
        <Icon size={18} color={color} />
      </span>
      <span className="qa-text">
        <strong>{title}</strong>
        <span className="muted">{text}</span>
      </span>
      <ChevronRight size={16} className="muted" />
    </button>
  );
}

function ProjectCard({ entry, onRemove }: { entry: RecentEntry; onRemove: () => void }): ReactNode {
  const st = status(entry);
  return (
    <div className="project-card" style={{ position: "relative" }}>
      <button
        type="button"
        className="card-open"
        aria-label={`Abrir ${entry.name}`}
        onClick={() => void actions.openProject(entry.path)}
      />
      <div className="project-thumb">
        <Cover entry={entry} />
        <span className="pc-status">
          <span className="dot" style={{ background: st.tone }} />
          {st.label}
        </span>
        <span className="pc-duration mono">{duration(entry.duration)}</span>
        <button
          type="button"
          className="pc-remove"
          style={{ zIndex: 2 }}
          title="Remover da lista (o arquivo não é apagado)"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <X size={13} />
        </button>
      </div>
      <div className="pc-info">
        <strong>{entry.name}</strong>
        <div className="pc-meta muted">
          <span>{entry.course ?? "Sem curso"}</span>
          <span>
            {entry.editSeconds ? `${formatEditTime(entry.editSeconds)} de edição · ` : ""}
            {relativeTime(entry.updatedAt)}
          </span>
        </div>
      </div>
    </div>
  );
}
