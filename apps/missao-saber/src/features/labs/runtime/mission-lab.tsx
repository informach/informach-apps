"use client";
import { useEffect, useRef, useState } from "react";
import { BotaoChapa } from "@/components/ui/botao-chapa";
import { readLabAction, startLabAction } from "./actions";
import type { LabExperience } from "./catalog";
import type { LabExecutionView } from "./repository";
import { LabRunner } from "./runner";

export function MissionLab({
  profileId,
  sessionId,
  itemId,
  experiences,
  onBusy,
}: {
  profileId: string;
  sessionId: string;
  itemId: string;
  experiences: LabExperience[];
  onBusy: (busy: boolean) => void;
}) {
  const [view, setView] = useState<LabExecutionView | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [generation, setGeneration] = useState(0);
  const requests = useRef(new Map<string, string>());
  useEffect(() => {
    onBusy(busy || open);
    return () => onBusy(false);
  }, [busy, open, onBusy]);
  useEffect(() => {
    if (!open && view) document.getElementById(`launch-${view.experience.id}`)?.focus();
  }, [open, view]);
  if (!experiences.length) return null;
  return (
    <div className="mt-5">
      {open && view ? (
        <LabRunner
          key={`${view.id}-${generation}`}
          initial={view}
          onReplace={(next) => {
            setView(next);
            setGeneration((value) => value + 1);
          }}
          onClose={() => setOpen(false)}
          closeLabel="Voltar à questão"
        />
      ) : (
        <div>
          <p className="mb-2 text-sm text-tinta-suave">
            Uma ferramenta pode ajudar a pensar nesta questão. Ao abrir, sua resposta será
            registrada com apoio.
          </p>
          <div className="flex flex-wrap gap-2">
            {experiences.map((experience) => (
              <BotaoChapa
                key={experience.id}
                id={`launch-${experience.id}`}
                type="button"
                medida="p"
                tom="contorno"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  onBusy(true);
                  setMessage("");
                  const id = requests.current.get(experience.id) ?? crypto.randomUUID();
                  requests.current.set(experience.id, id);
                  try {
                    const result =
                      view?.experience.id === experience.id
                        ? await readLabAction({ profileId, id: view.id })
                        : await startLabAction({
                            profileId,
                            id,
                            experienceId: experience.id,
                            context: { sessionId, itemId },
                          });
                    if (result.ok) {
                      setView(result.data);
                      setOpen(true);
                    } else setMessage(result.error);
                  } catch {
                    setMessage("Não foi possível abrir a ferramenta. Tente novamente.");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Explorar:{" "}
                {experiences.filter((entry) => entry.family === experience.family).length > 1
                  ? experience.activityTitle
                  : experience.toolName}
              </BotaoChapa>
            ))}
          </div>
        </div>
      )}
      <p role="status" className="mt-2 text-sm">
        {message}
      </p>
    </div>
  );
}
