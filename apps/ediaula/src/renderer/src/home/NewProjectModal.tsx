import { focusOnMount } from "@informach/edi-desktop/renderer";
import type { CourseTemplate } from "@shared/courseTemplate";
import type { ProjectSettings } from "@shared/types";
import { FolderPlus } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { courseTemplate } from "@/lib/courseTemplate";
import { Button, Field, Modal, Toggle } from "@/ui";

export const FORMATS: { id: string; label: string; settings: ProjectSettings; hint?: string }[] = [
  {
    id: "1080p30",
    label: "1920 × 1080 · 30 fps (recomendado)",
    settings: { width: 1920, height: 1080, fps: 30 },
  },
  {
    id: "1080p60",
    label: "1920 × 1080 · 60 fps",
    settings: { width: 1920, height: 1080, fps: 60 },
  },
  {
    id: "vertical30",
    label: "1080 × 1920 · 30 fps (vertical 9:16)",
    settings: { width: 1080, height: 1920, fps: 30 },
    hint: "Para vídeos curtos de redes sociais e para ver no celular.",
  },
  { id: "4k30", label: "3840 × 2160 · 30 fps", settings: { width: 3840, height: 2160, fps: 30 } },
  { id: "720p30", label: "1280 × 720 · 30 fps", settings: { width: 1280, height: 720, fps: 30 } },
];

interface Props {
  courses: string[];
  defaultName?: string;
  onCancel: () => void;
  /** `template`: the course template the lesson starts from, when the person kept it on. */
  onCreate: (
    name: string,
    course: string | undefined,
    settings: ProjectSettings,
    template: CourseTemplate | null,
  ) => Promise<void>;
}

/** What starting from the template brings, in a sentence. */
function templateSummary(t: CourseTemplate): string {
  const parts = [
    t.palette && "paleta",
    t.captions && "legenda",
    t.tracks?.length && `as ${t.tracks.length} faixas`,
    t.music?.file && `a música ${t.music.file.name}`,
  ].filter((x): x is string => !!x);
  const cards =
    t.cards?.opening || t.cards?.closing
      ? `${t.cards.opening && t.cards.closing ? "a abertura e o encerramento entram" : t.cards.opening ? "a abertura entra" : "o encerramento entra"} quando a primeira mídia chegar`
      : "";
  const list =
    parts.length > 1 ? `${parts.slice(0, -1).join(", ")} e ${parts.at(-1)}` : (parts[0] ?? "");
  const head = list ? `${list[0].toUpperCase()}${list.slice(1)} de ${t.course ?? "curso"}` : "";
  return [head, cards].filter(Boolean).join("; ").concat(".") || "O modelo do curso.";
}

const formatOf = (s: ProjectSettings): string | undefined =>
  FORMATS.find(
    (f) =>
      f.settings.width === s.width && f.settings.height === s.height && f.settings.fps === s.fps,
  )?.id;

export function NewProjectModal({
  courses,
  defaultName = "",
  onCancel,
  onCreate,
}: Props): ReactNode {
  const [name, setName] = useState(defaultName);
  const [course, setCourse] = useState("");
  const [format, setFormat] = useState(FORMATS[0].id);
  const [busy, setBusy] = useState(false);
  // The course's template, looked up as the course is typed; on by default when there is one.
  // Its format is offered first, and the person may still choose another.
  const [template, setTemplate] = useState<CourseTemplate | null>(null);
  const [useTemplate, setUseTemplate] = useState(true);

  useEffect(() => {
    const typed = course.trim();
    if (!typed) {
      setTemplate(null);
      return;
    }
    let alive = true;
    const wait = setTimeout(() => {
      courseTemplate(typed).then(
        (found) => {
          if (!alive) return;
          setTemplate(found);
          if (found) setFormat(formatOf(found.format) ?? "template");
        },
        () => alive && setTemplate(null),
      );
    }, 250);
    return () => {
      alive = false;
      clearTimeout(wait);
    };
  }, [course]);

  const fromTemplate = !!template && useTemplate;
  // The template's format when it is none of the usual ones: one more choice, not the only one.
  const own = template && !formatOf(template.format) ? template.format : null;
  const chosen =
    format === "template" && own
      ? own
      : (FORMATS.find((f) => f.id === format) ?? FORMATS[0]).settings;
  const hint = FORMATS.find((f) => f.id === format)?.hint;

  const submit = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      await onCreate(
        name.trim() || "Aula sem nome",
        course.trim() || undefined,
        { ...chosen },
        fromTemplate ? template : null,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal label="Novo projeto" onClose={onCancel} width={540}>
      <form
        className="modal-body stack-16"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="modal-title-row">
          <FolderPlus size={18} color="var(--accent)" />
          <h2 className="modal-title">Novo projeto</h2>
        </div>
        <Field label="Nome da aula">
          <input
            className="input"
            ref={focusOnMount}
            value={name}
            placeholder="Ex.: Aula 03, Seção 01"
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Curso (opcional)" hint="Usado para agrupar as aulas na tela inicial.">
          <input
            className="input"
            list="courses"
            value={course}
            placeholder="Ex.: Cadê Todo Mundo"
            onChange={(e) => setCourse(e.target.value)}
          />
          <datalist id="courses">
            {courses.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        {template && (
          <div className="setup-offer">
            <div className="props-head">
              <span className="field-label">Começar com o modelo do curso</span>
              <Toggle
                on={useTemplate}
                onChange={setUseTemplate}
                label="Começar com o modelo do curso"
              />
            </div>
            <span className="field-hint">
              {useTemplate
                ? templateSummary(template)
                : "A aula começa vazia, com as faixas de sempre."}
            </span>
          </div>
        )}
        <Field label="Formato do vídeo" hint={hint}>
          <select className="select" value={format} onChange={(e) => setFormat(e.target.value)}>
            {own && (
              <option value="template">
                {own.width} × {own.height} · {own.fps} fps (do modelo do curso)
              </option>
            )}
            {FORMATS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="modal-actions">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            Criar projeto
          </Button>
        </div>
      </form>
    </Modal>
  );
}
