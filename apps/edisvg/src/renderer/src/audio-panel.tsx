import type { Asset } from "@informach/edi-motion/assets";
import type { AudioBinding } from "@informach/edi-motion/audio";
import { useId, useState } from "react";
import type { Artboard } from "../../shared/project";

interface Props {
  board: Artboard;
  assets: Asset[];
  execute(commands: unknown[]): void;
}
function BindingEditor({
  binding,
  save,
  remove,
  report,
}: {
  binding: AudioBinding;
  save: (value: AudioBinding) => void;
  remove: () => void;
  report: (message: string) => void;
}) {
  const id = useId();
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget),
          caption = form.get("caption"),
          volume = form.get("volume");
        if (typeof caption !== "string" || typeof volume !== "string") {
          report("Campos de áudio inválidos.");
          return;
        }
        save({ ...binding, caption, volume: Number(volume) });
      }}
    >
      <label htmlFor={`${id}-caption`}>Alternativa do efeito</label>
      <input
        id={`${id}-caption`}
        name="caption"
        required
        maxLength={500}
        defaultValue={binding.caption}
      />
      <label htmlFor={`${id}-volume`}>Volume do efeito</label>
      <input
        id={`${id}-volume`}
        name="volume"
        type="number"
        min="0"
        max="1"
        step="0.05"
        required
        defaultValue={binding.volume}
      />
      <p className="micro">Evento {binding.eventId}</p>
      <button type="submit">Salvar vínculo</button>
      <button type="button" onClick={remove}>
        Remover vínculo de áudio
      </button>
    </form>
  );
}
export function AudioPanel({ board, assets, execute }: Props) {
  const id = useId(),
    [error, setError] = useState(""),
    bindings = board.audio?.bindings ?? [],
    audio = assets.filter((asset) => asset.kind === "audio"),
    events = board.behavior?.events ?? [];
  const replace = (value: AudioBinding[]) => {
    try {
      execute([{ type: "audio", operation: "replace", value: { version: 1, bindings: value } }]);
      setError("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Áudio recusado.");
    }
  };
  return (
    <section className="resource-editor" aria-label="Efeitos de áudio">
      <h3>EFEITOS POR EVENTO</h3>
      <p className="micro">
        Efeitos pontuais disparados pelos eventos da timeline. O player começa sem áudio; a
        alternativa textual funciona mesmo desativado. Não é uma trilha sonora contínua.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget),
            assetId = data.get("asset"),
            eventId = data.get("event"),
            caption = data.get("caption");
          if (
            typeof assetId !== "string" ||
            typeof eventId !== "string" ||
            typeof caption !== "string"
          ) {
            setError("Selecione recurso/evento e uma alternativa.");
            return;
          }
          replace([
            ...bindings,
            { id: `audio-${crypto.randomUUID()}`, assetId, eventId, caption, volume: 1 },
          ]);
        }}
      >
        <fieldset disabled={!audio.length || !events.length || bindings.length >= 256}>
          <label htmlFor={`${id}-asset`}>Recurso de áudio</label>
          <select id={`${id}-asset`} name="asset" required defaultValue="">
            <option value="" disabled>
              Escolher áudio
            </option>
            {audio.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.name}
              </option>
            ))}
          </select>
          <label htmlFor={`${id}-event`}>Evento de áudio</label>
          <select id={`${id}-event`} name="event" required defaultValue="">
            <option value="" disabled>
              Escolher evento
            </option>
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.name}
              </option>
            ))}
          </select>
          <label htmlFor={`${id}-caption`}>Alternativa textual do áudio</label>
          <input id={`${id}-caption`} name="caption" required maxLength={500} />
          <button type="submit">Vincular áudio ao evento</button>
        </fieldset>
      </form>
      {!events.length && (
        <p className="micro">Crie um evento na área Estados antes de vincular áudio.</p>
      )}
      {!audio.length && <p className="micro">Importe um WAV PCM16 no catálogo.</p>}
      {bindings.map((binding) => (
        <BindingEditor
          key={binding.id}
          binding={binding}
          report={setError}
          save={(value) =>
            replace(bindings.map((current) => (current.id === binding.id ? value : current)))
          }
          remove={() => replace(bindings.filter((current) => current.id !== binding.id))}
        />
      ))}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
