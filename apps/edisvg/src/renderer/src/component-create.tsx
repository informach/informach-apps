import { type FormEvent, useState } from "react";
import { type ComponentCommand, instanceSchema } from "../../shared/componentContracts";
import type { Artboard } from "../../shared/project";
import { type ClipChoice, InstanceSettings, initialInstance } from "./instance-settings";

interface Props {
  boards: Artboard[];
  ownerId: string;
  clips: ClipChoice[];
  execute(command: ComponentCommand): void;
  report(message: string): void;
}
function AvailableComponentForm({
  boards,
  clips,
  execute,
  report,
}: {
  boards: Artboard[];
  clips: ClipChoice[];
  execute: Props["execute"];
  report: Props["report"];
}) {
  const first = boards[0];
  const [draft, setDraft] = useState(() => (first ? initialInstance(first) : null));
  if (!draft) return null;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      execute({
        type: "component",
        operation: "create",
        name: boards.find((board) => board.id === draft?.artboardId)?.name ?? "Componente",
        instance: instanceSchema.parse(draft),
      });
    } catch (error) {
      report(error instanceof Error ? error.message : "Não foi possível criar a instância.");
    }
  }
  return (
    <form onSubmit={submit} aria-label="Inserir componente">
      <InstanceSettings value={draft} boards={boards} clips={clips} change={setDraft} />
      <button type="submit" data-component-create>
        Inserir componente nesta prancheta
      </button>
    </form>
  );
}
export function CreateComponentForm({ boards, ownerId, ...actions }: Props) {
  const sources = boards.filter((board) => board.id !== ownerId);
  return (
    <details>
      <summary>Reutilizar outra prancheta como componente</summary>
      {sources.length ? (
        <AvailableComponentForm boards={sources} {...actions} />
      ) : (
        <p className="micro">Crie outra prancheta com a arte que deseja reutilizar.</p>
      )}
    </details>
  );
}
