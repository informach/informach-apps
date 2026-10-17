import { focusOnMount } from "@informach/edi-desktop/renderer";
import type { ProjectSettings } from "@shared/types";
import { FolderPlus } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button, Field, Modal } from "@/ui";

export const FORMATS: { id: string; label: string; settings: ProjectSettings }[] = [
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
  { id: "4k30", label: "3840 × 2160 · 30 fps", settings: { width: 3840, height: 2160, fps: 30 } },
  { id: "720p30", label: "1280 × 720 · 30 fps", settings: { width: 1280, height: 720, fps: 30 } },
];

interface Props {
  courses: string[];
  defaultName?: string;
  onCancel: () => void;
  onCreate: (name: string, course: string | undefined, settings: ProjectSettings) => Promise<void>;
}

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

  const submit = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      await onCreate(
        name.trim() || "Aula sem nome",
        course.trim() || undefined,
        FORMATS.find((f) => f.id === format)!.settings,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal label="Novo projeto" onClose={onCancel} width={520}>
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
            placeholder="Ex.: Aula 03 — Seção 01"
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
        <Field label="Formato do vídeo">
          <select className="select" value={format} onChange={(e) => setFormat(e.target.value)}>
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
