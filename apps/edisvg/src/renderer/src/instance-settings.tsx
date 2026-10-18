import { useId } from "react";
import type { ComponentInstance } from "../../shared/componentContracts";
import type { Artboard } from "../../shared/project";
import { FormNumberField } from "./form-number-field";
import { InstanceInputs } from "./instance-inputs";
export interface ClipChoice {
  id: string;
  name: string;
}
export function initialInstance(board: Artboard): ComponentInstance {
  return {
    artboardId: board.id,
    animationId: null,
    width: board.scene.viewBox[2],
    height: board.scene.viewBox[3],
    fit: "contain",
    speed: 1,
    offsetSeconds: 0,
    overrides: [],
  };
}
interface Props {
  value: ComponentInstance;
  boards: Artboard[];
  clips: ClipChoice[];
  change(value: ComponentInstance): void;
}
/** All changes are an unsaved form draft. Only the outer submit commits. */
export function InstanceSettings({ value, boards, clips, change }: Props) {
  const fieldPrefix = useId();
  const master = boards.find((board) => board.id === value.artboardId),
    behavior = master?.behavior,
    independent =
      !!master?.layout ||
      (!!behavior &&
        (behavior.inputs.length > 0 ||
          behavior.machines.length > 0 ||
          behavior.bindings.length > 0 ||
          behavior.listeners.length > 0 ||
          behavior.events.length > 0 ||
          !!behavior.data));
  const number = (key: "width" | "height" | "speed" | "offsetSeconds", raw: string) =>
    change({ ...value, [key]: raw === "" ? Number.NaN : Number(raw) });
  return (
    <>
      <label className="scene-field">
        Componente de origem
        <select
          aria-label="Componente de origem"
          value={value.artboardId}
          onChange={(event) => {
            const board = boards.find((board) => board.id === event.target.value);
            if (board) change(initialInstance(board));
          }}
        >
          {boards.map((board) => (
            <option key={board.id} value={board.id}>
              {board.name}
            </option>
          ))}
        </select>
      </label>
      <label className="scene-field" htmlFor={`${fieldPrefix}-width`}>
        Largura da instância
        <FormNumberField
          id={`${fieldPrefix}-width`}
          label="Largura da instância"
          min="0.001"
          max="100000"
          value={value.width}
          change={(raw) => number("width", raw)}
        />
      </label>
      <label className="scene-field" htmlFor={`${fieldPrefix}-height`}>
        Altura da instância
        <FormNumberField
          id={`${fieldPrefix}-height`}
          label="Altura da instância"
          min="0.001"
          max="100000"
          value={value.height}
          change={(raw) => number("height", raw)}
        />
      </label>
      <label className="scene-field">
        Encaixe
        <select
          aria-label="Encaixe do componente"
          value={value.fit}
          onChange={(event) => {
            const fit = event.target.value;
            if (fit === "contain" || fit === "cover" || fit === "stretch")
              change({ ...value, fit });
          }}
        >
          <option value="contain">Conter sem distorcer</option>
          <option value="cover">Preencher com recorte</option>
          <option value="stretch">Esticar</option>
        </select>
      </label>
      <label className="scene-field">
        Animação da instância
        <select
          aria-label="Animação da instância"
          disabled={!!behavior?.machines.length}
          value={value.animationId ?? ""}
          onChange={(event) =>
            change({
              ...value,
              animationId: event.target.value || null,
              ...(!event.target.value ? { speed: 1, offsetSeconds: 0 } : {}),
            })
          }
        >
          <option value="">
            {behavior?.machines.length ? "Controlada pela máquina" : "Nenhuma (pose-base)"}
          </option>
          {clips.map((clip) => (
            <option key={clip.id} value={clip.id}>
              {clip.name}
            </option>
          ))}
        </select>
      </label>
      {!!behavior?.machines.length && (
        <label className="scene-field">
          Máquina inicial da instância
          <select
            aria-label="Máquina inicial da instância"
            value={value.machineId ?? ""}
            onChange={(event) =>
              change({
                ...value,
                machineId: event.target.value || null,
                animationId: null,
                offsetSeconds: 0,
              })
            }
          >
            <option value="">Padrão da origem</option>
            {behavior.machines.map((machine) => (
              <option key={machine.id} value={machine.id}>
                {machine.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {behavior && <InstanceInputs behavior={behavior} value={value} change={change} />}
      <label className="scene-field" htmlFor={`${fieldPrefix}-speed`}>
        Velocidade
        <FormNumberField
          id={`${fieldPrefix}-speed`}
          label="Velocidade da instância"
          min="0.01"
          max="100"
          value={value.speed}
          disabled={value.animationId === null && !independent}
          change={(raw) => number("speed", raw)}
        />
      </label>
      <label className="scene-field" htmlFor={`${fieldPrefix}-offsetSeconds`}>
        Deslocamento de tempo (s)
        <FormNumberField
          id={`${fieldPrefix}-offsetSeconds`}
          label="Deslocamento de tempo da instância"
          min="-3600"
          max="3600"
          value={value.offsetSeconds}
          disabled={value.animationId === null || independent}
          change={(raw) => number("offsetSeconds", raw)}
        />
      </label>
      <p className="micro">
        Alterações na origem se propagam às instâncias.{" "}
        {independent
          ? "Lógica e dados têm sessão independente por instância, coordenada pelo relógio da cena; offset não se aplica."
          : "A animação segue a fase do pai, respeitando FPS, modo e velocidade próprios."}{" "}
        Se trocar a origem, os overrides deste rascunho serão removidos.
      </p>
    </>
  );
}
