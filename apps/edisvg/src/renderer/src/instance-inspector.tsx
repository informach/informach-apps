import { type FormEvent, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  type ComponentCommand,
  type ComponentInstance,
  instanceSchema,
} from "../../shared/componentContracts";
import type { Artboard } from "../../shared/project";
import { flattenScene } from "../../shared/scene.js";
import { type ClipChoice, InstanceSettings } from "./instance-settings";

interface Props {
  access: "editable" | "locked";
  targetId: string;
  value: ComponentInstance;
  boards: Artboard[];
  clips: ClipChoice[];
  execute(command: ComponentCommand): void;
  report(message: string): void;
}
function InstanceInspector({ targetId, value, boards, clips, execute, report, access }: Props) {
  const [draft, setDraft] = useState(() => structuredClone(value));
  const source = boards.find((board) => board.id === draft.artboardId);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      execute({
        type: "component",
        operation: "update",
        targetId,
        instance: instanceSchema.parse(draft),
      });
    } catch (error) {
      report(error instanceof Error ? error.message : "Não foi possível editar a instância.");
    }
  }
  return (
    <section className="scene-padding" aria-label="Instância de componente">
      <h3>INSTÂNCIA · COMPONENTE</h3>
      <fieldset disabled={access === "locked"}>
        <legend>Configuração da instância</legend>
        <form onSubmit={submit}>
          <InstanceSettings value={draft} boards={boards} clips={clips} change={setDraft} />
          <button type="submit">Aplicar instância</button>
          <button type="button" onClick={() => setDraft(structuredClone(value))}>
            Reverter campos da instância
          </button>
        </form>
        {source ? (
          <OverrideEditor
            key={source.id}
            draft={draft}
            source={source}
            change={setDraft}
            report={report}
          />
        ) : null}
        <p className="micro">
          Overrides alteram apenas a pose-base desta instância; trilhas animadas prevalecem. A
          origem não é modificada.
        </p>
        {draft.overrides.map((override) => (
          <div key={override.targetId} className="scene-field">
            <span>
              {flattenScene(source?.scene).find(({ node }) => node.id === override.targetId)?.node
                .name ?? override.targetId}
            </span>
            <button
              type="button"
              onClick={() =>
                setDraft({
                  ...draft,
                  overrides: draft.overrides.filter((item) => item !== override),
                })
              }
            >
              Remover override do rascunho
            </button>
          </div>
        ))}
      </fieldset>
    </section>
  );
}
function OverrideEditor({
  draft,
  source,
  change,
  report,
}: {
  draft: ComponentInstance;
  source: Artboard;
  change(value: ComponentInstance): void;
  report(message: string): void;
}) {
  const objects = flattenScene(source.scene);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget),
      targetId = String(form.get("target")),
      property = String(form.get("property")),
      value = String(form.get("value"));
    const previous = draft.overrides.find((item) => item.targetId === targetId) ?? { targetId };
    try {
      let override: ComponentInstance["overrides"][number];
      if (property === "text") override = { ...previous, text: value };
      else if (property === "fill" || property === "stroke")
        override = { ...previous, attrs: { ...previous.attrs, [property]: value } };
      else if (["x", "y", "rotation", "sx", "sy", "opacity"].includes(property))
        override = { ...previous, transform: { ...previous.transform, [property]: Number(value) } };
      else throw new Error("Propriedade de override inválida.");
      if (
        property === "text" &&
        objects.find(({ node }) => node.id === targetId)?.node.tag !== "text"
      )
        throw new Error("Selecione um objeto de texto para esse override.");
      const next = instanceSchema.parse({
        ...draft,
        overrides: [...draft.overrides.filter((item) => item.targetId !== targetId), override],
      });
      change(next);
    } catch (error) {
      report(error instanceof Error ? error.message : "Override inválido.");
    }
  }
  return (
    <form onSubmit={submit} aria-label="Preparar override">
      <h3>OVERRIDES DO RASCUNHO</h3>
      <label className="scene-field">
        Objeto de origem
        <select name="target" aria-label="Objeto do override" required>
          {objects.map(({ node }) => (
            <option key={node.id} value={node.id}>
              {node.name}
            </option>
          ))}
        </select>
      </label>
      <label className="scene-field">
        Propriedade
        <select name="property" aria-label="Propriedade do override">
          <option value="text">Texto</option>
          <option value="fill">Preenchimento</option>
          <option value="stroke">Contorno</option>
          {["x", "y", "rotation", "sx", "sy", "opacity"].map((property) => (
            <option key={property} value={property}>
              {property}
            </option>
          ))}
        </select>
      </label>
      <label className="scene-field">
        Valor
        <input name="value" aria-label="Valor do override" maxLength={10000} required />
      </label>
      <button type="submit" disabled={!objects.length}>
        Adicionar ao rascunho
      </button>
      <p className="micro">
        Depois de preparar os overrides, use Aplicar instância para gravar todos em uma única
        edição.
      </p>
    </form>
  );
}
export function mountInstanceInspector(host: Element, props: Props) {
  const root = createRoot(host, {
    onUncaughtError(error) {
      props.report(error instanceof Error ? error.message : "Falha no painel do componente.");
    },
  });
  root.render(<InstanceInspector {...props} />);
  return () => root.unmount();
}
