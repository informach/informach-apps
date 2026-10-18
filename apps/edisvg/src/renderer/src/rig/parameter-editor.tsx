import type { Animation, Easing } from "@informach/edi-motion";
import {
  type RigDocument,
  type RigParameterProperty,
  rigParameterEntries,
  rigParameterKey,
  upgradeRigVersion,
} from "@informach/edi-motion/rig";
import { useState } from "react";
import { numberValue, textValue } from "./constraint-editor";

const valueLabels: Record<RigParameterProperty, string> = {
  strength: "Força da chave (%)",
  progress: "Progresso da chave (%)",
  weight: "Peso da chave (%)",
  activeIndex: "Filho ativo (-1 = nenhum)",
  start: "Início da chave (%)",
  end: "Fim da chave (%)",
  offset: "Offset da chave (graus)",
  x: "Eixo X da chave (%)",
  y: "Eixo Y da chave (%)",
};
export interface RigParameterFocus {
  animationId: string;
  channelKey: string;
  frame: number | null;
}

/** Bounded list plus an explicit key editor: never mounts 10k numeric inputs. */
export function RigParameterEditor({
  rig,
  animations,
  initialAnimationId,
  frame,
  save,
  report,
  focus,
  focusChanged,
}: {
  rig: RigDocument;
  animations: readonly Animation[];
  initialAnimationId?: string;
  frame: number;
  save(value: RigDocument, focus: RigParameterFocus): void;
  report(error: unknown): void;
  focus?: RigParameterFocus;
  focusChanged(value: RigParameterFocus): void;
}) {
  const entries = rigParameterEntries(rig),
    entryKey = (entry: (typeof entries)[number]) =>
      rigParameterKey([], entry.targetId, entry.property);
  const [animationId, setAnimationId] = useState(
      animations.some((clip) => clip.id === focus?.animationId)
        ? (focus?.animationId ?? "")
        : (initialAnimationId ?? animations[0]?.id ?? ""),
    ),
    [channelKey, setChannelKey] = useState(
      entries.some((entry) => entryKey(entry) === focus?.channelKey)
        ? (focus?.channelKey ?? "")
        : entries[0]
          ? entryKey(entries[0])
          : "",
    ),
    [offset, setOffset] = useState(0),
    [editingFrame, setEditingFrame] = useState<number | null>(focus?.frame ?? null),
    animation = animations.find((clip) => clip.id === animationId),
    entry = entries.find((value) => entryKey(value) === channelKey),
    targetId = entry?.targetId ?? "",
    property = entry?.property ?? "strength",
    percent = !entry?.definition.discrete && property !== "offset",
    valueLabel = valueLabels[property],
    clip = rig.parameterClips?.find((clip) => clip.animationId === animationId),
    track = clip?.tracks.find(
      (track) => track.targetId === targetId && track.property === property,
    ),
    key = track?.keys.find((key) => key.frame === editingFrame);
  function write(keys: NonNullable<typeof track>["keys"], focusFrame = editingFrame) {
    const tracks = (clip?.tracks ?? []).filter((value) => value !== track);
    if (keys.length)
      tracks.push({
        id: track?.id ?? `track-${crypto.randomUUID()}`,
        targetId,
        property,
        keys: [...keys].sort((a, b) => a.frame - b.frame),
      });
    const clips = (rig.parameterClips ?? []).filter((clip) => clip.animationId !== animationId);
    if (tracks.length) clips.push({ animationId, tracks });
    save(
      { ...rig, version: upgradeRigVersion(rig.version, 2), parameterClips: clips },
      { animationId, channelKey, frame: focusFrame },
    );
  }
  return (
    <fieldset disabled={!animation || !entry}>
      <legend>Canais de rig · parâmetros animados</legend>
      <p className="micro">
        A mesma interpolação da timeline, nos limites do parâmetro selecionado. Transições, blends e
        camadas também compõem este canal; a pose de referência não muda.
      </p>
      <label className="scene-field">
        Animação do canal
        <select
          aria-label="Animação do canal de rig"
          value={animationId}
          onChange={(event) => {
            setAnimationId(event.target.value);
            focusChanged({ animationId: event.target.value, channelKey, frame: null });
            setOffset(0);
            setEditingFrame(null);
          }}
        >
          {animations.map((clip) => (
            <option key={clip.id} value={clip.id}>
              {clip.name}
            </option>
          ))}
        </select>
      </label>
      <label className="scene-field">
        Restrição do canal
        <select
          aria-label="Restrição do canal de rig"
          value={channelKey}
          onChange={(event) => {
            setChannelKey(event.target.value);
            focusChanged({ animationId, channelKey: event.target.value, frame: null });
            setOffset(0);
            setEditingFrame(null);
          }}
        >
          {entries.map((entry) => (
            <option key={entryKey(entry)} value={entryKey(entry)}>
              {entry.targetId} · {entry.property}
            </option>
          ))}
        </select>
      </label>
      <form
        key={`${animationId}-${channelKey}-${editingFrame}`}
        onSubmit={(event) => {
          event.preventDefault();
          try {
            const data = new FormData(event.currentTarget),
              nextFrame = numberValue(data, "frame"),
              value = numberValue(data, "value") / (percent ? 100 : 1),
              curve = entry?.definition.discrete ? "hold" : textValue(data, "curve");
            const easing: Easing =
              entry?.definition.discrete || curve === "hold"
                ? "hold"
                : curve === "smooth"
                  ? { kind: "cubic-bezier", points: [0.42, 0, 0.58, 1] }
                  : curve === "elastic"
                    ? { kind: "elastic", amplitude: 1, period: 0.3 }
                    : curve === "preserve" && key
                      ? key.easing
                      : "linear";
            const keys = (track?.keys ?? []).filter(
              (value) => value.frame !== nextFrame && value !== key,
            );
            keys.push({
              id: key?.id ?? `key-${crypto.randomUUID()}`,
              frame: nextFrame,
              value,
              easing,
            });
            write(keys, editingFrame === null ? null : nextFrame);
          } catch (error) {
            report(error);
          }
        }}
      >
        <label className="scene-field">
          Quadro do parâmetro
          <input
            aria-label="Quadro do parâmetro"
            name="frame"
            type="number"
            min="0"
            max={animation?.frames ?? 0}
            step="any"
            defaultValue={key?.frame ?? Math.min(frame, animation?.frames ?? 0)}
            required
          />
        </label>
        <label className="scene-field">
          {valueLabel}
          <input
            aria-label={valueLabel}
            name="value"
            type="number"
            min={(entry?.definition.bounds[0] ?? 0) * (percent ? 100 : 1)}
            max={(entry?.definition.bounds[1] ?? 1) * (percent ? 100 : 1)}
            step={entry?.definition.discrete ? 1 : "any"}
            defaultValue={(key?.value ?? entry?.definition.initial ?? 0) * (percent ? 100 : 1)}
            required
          />
        </label>
        <label className="scene-field">
          Curva da chave
          <select
            name="curve"
            aria-label="Curva da chave de rig"
            defaultValue={entry?.definition.discrete ? "hold" : key ? "preserve" : "linear"}
            disabled={entry?.definition.discrete}
          >
            {key && <option value="preserve">Manter curva atual</option>}
            <option value="linear">Linear</option>
            <option value="hold">Degrau</option>
            <option value="smooth">Suave</option>
            <option value="elastic">Elástica</option>
          </select>
        </label>
        <button type="submit">Gravar chave de rig</button>
      </form>
      <ol aria-label="Chaves de rig">
        {track?.keys.slice(offset, offset + 20).map((key) => (
          <li key={key.id}>
            Quadro {key.frame} · {Number((key.value * (percent ? 100 : 1)).toFixed(3))}
            {percent ? "%" : ""}{" "}
            <button
              type="button"
              onClick={() => {
                setEditingFrame(key.frame);
                focusChanged({ animationId, channelKey, frame: key.frame });
              }}
            >
              Editar quadro {key.frame}
            </button>
            <button
              type="button"
              onClick={() => {
                try {
                  write(track.keys.filter((value) => value.id !== key.id));
                } catch (error) {
                  report(error);
                }
              }}
            >
              Excluir quadro {key.frame}
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        disabled={offset === 0}
        onClick={() => setOffset(Math.max(0, offset - 20))}
      >
        Chaves anteriores
      </button>
      <button
        type="button"
        disabled={offset + 20 >= (track?.keys.length ?? 0)}
        onClick={() => setOffset(offset + 20)}
      >
        Próximas chaves
      </button>
      <button
        type="button"
        onClick={() => {
          setEditingFrame(null);
          focusChanged({ animationId, channelKey, frame: null });
        }}
      >
        Nova chave
      </button>
    </fieldset>
  );
}
