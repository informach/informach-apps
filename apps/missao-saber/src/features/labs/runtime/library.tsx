"use client";
import { useEffect, useRef, useState } from "react";
import { BotaoChapa } from "@/components/ui/botao-chapa";
import { Chapa } from "@/components/ui/chapa";
import { readLabAction, startLabAction } from "./actions";
import type { LabExperience } from "./catalog";
import type { LabExecutionView, legacyLabChoices, listLabs, readLabNote } from "./repository";
import { LabRunner } from "./runner";

export function LabLibrary({
  profileId,
  experiences,
  saved,
  recommendation,
  initial = null,
  snapshot,
  legacy = [],
}: {
  profileId: string;
  experiences: LabExperience[];
  saved: Awaited<ReturnType<typeof listLabs>>;
  recommendation: { primaryId?: string; alternativeIds: string[] };
  initial?: LabExecutionView | null;
  snapshot?: Awaited<ReturnType<typeof readLabNote>>;
  legacy?: Awaited<ReturnType<typeof legacyLabChoices>>;
}) {
  const [view, setView] = useState(initial);
  const [generation, setGeneration] = useState(0);
  const [search, setSearch] = useState("");
  const [skill, setSkill] = useState("");
  const [family, setFamily] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState(saved);
  const [historyLimit, setHistoryLimit] = useState(10);
  const [libraryLimit, setLibraryLimit] = useState(24);
  const requests = useRef(new Map<string, string>());
  useEffect(() => {
    if (!view && generation > 0) document.getElementById("lab-library")?.focus();
  }, [view, generation]);
  const skills = [...new Map(experiences.map((entry) => [entry.skillId, entry.skill])).entries()];
  const tools = [...new Map(experiences.map((entry) => [entry.family, entry.toolName])).entries()];
  const recommended =
    experiences.find((entry) => entry.id === recommendation.primaryId) ?? experiences[0];
  const alternatives = recommendation.alternativeIds.flatMap((id) => {
    const entry = experiences.find((experience) => experience.id === id);
    return entry ? [entry] : [];
  });
  const query = search.toLocaleLowerCase("pt-BR");
  const shown = experiences.filter(
    (entry) =>
      (!skill || entry.skillId === skill) &&
      (!family || entry.family === family) &&
      `${entry.title} ${entry.activityTitle} ${entry.skill} ${entry.objective} ${entry.toolName}`
        .toLocaleLowerCase("pt-BR")
        .includes(query),
  );
  function remember(next: LabExecutionView) {
    setHistory((current) => [
      {
        id: next.id,
        experienceId: next.experience.id,
        title: next.experience.title,
        updatedAt: next.updatedAt,
        revision: next.revision,
        assessment: next.assessment,
      },
      ...current.filter((entry) => entry.id !== next.id),
    ]);
  }
  function open(next: LabExecutionView) {
    setView(next);
    setGeneration((value) => value + 1);
    remember(next);
    window.history.replaceState(null, "", `/laboratorio?exec=${next.id}`);
  }
  async function launch(
    experienceId: string,
    noteId?: string,
    legacyKind?: "bars" | "grid" | "groups",
  ) {
    setBusy(true);
    setMessage("");
    const source = `${experienceId}|${noteId ?? ""}|${legacyKind ?? ""}`;
    const id = requests.current.get(source) ?? crypto.randomUUID();
    requests.current.set(source, id);
    try {
      const result = await startLabAction({ profileId, experienceId, id, noteId, legacyKind });
      if (result.ok) {
        requests.current.delete(source);
        open(result.data);
      } else setMessage(result.error);
    } catch {
      setMessage("Não foi possível abrir. Tente novamente; sua experiência não será duplicada.");
    } finally {
      setBusy(false);
    }
  }
  if (view)
    return (
      <LabRunner
        key={`${view.id}-${generation}`}
        initial={view}
        onReplace={open}
        onClose={(savedVersion) => {
          remember({ ...view, ...savedVersion });
          setView(null);
          setGeneration((value) => value + 1);
          window.history.replaceState(null, "", "/laboratorio");
        }}
      />
    );
  return (
    <div className="grid gap-7">
      {legacy.length > 0 && (
        <section aria-label="Montagens anteriores">
          <h2 className="font-display text-xl font-semibold">Continuar uma montagem anterior</h2>
          <p className="mt-2 text-sm">
            Abra uma cópia no novo laboratório. O registro original continua guardado.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            {legacy.map((entry) => (
              <BotaoChapa
                key={entry.kind}
                disabled={busy}
                medida="p"
                tom="contorno"
                onClick={() => launch(entry.experienceId, undefined, entry.kind)}
              >
                Importar {entry.title}
              </BotaoChapa>
            ))}
          </div>
        </section>
      )}
      {snapshot && (
        <Chapa tom="sol">
          <h2 className="font-display text-2xl font-semibold">Do meu caderno: {snapshot.title}</h2>
          <p className="mt-2">{snapshot.question}</p>
          <p className="mt-2">Montagem guardada: {snapshot.summary}</p>
          {snapshot.transfer && (
            <div className="mt-3 border-t border-sombra pt-3">
              <p className="font-semibold">Novo caso: {snapshot.transfer.question}</p>
              <p className="mt-2">Montagem do novo caso: {snapshot.transfer.summary}</p>
            </div>
          )}
          <p className="mt-2">{snapshot.document.explanation || snapshot.document.observation}</p>
          <BotaoChapa
            className="mt-3"
            disabled={busy}
            onClick={() => launch(snapshot.experienceId, snapshot.noteId)}
          >
            Abrir uma cópia desta montagem
          </BotaoChapa>
        </Chapa>
      )}
      {recommended && (
        <Chapa tom="ceu">
          <p className="text-sm font-semibold">Uma ideia para investigar agora</p>
          <h2 className="mt-2 font-display text-2xl font-semibold">{recommended.title}</h2>
          <p className="mt-2">{recommended.objective}</p>
          <BotaoChapa className="mt-4" disabled={busy} onClick={() => launch(recommended.id)}>
            Começar investigação
          </BotaoChapa>
          {alternatives.length > 0 && (
            <div className="mt-5 border-t border-sombra pt-4">
              <p className="text-sm font-semibold">Outras ideias da sua trilha</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {alternatives.map((entry) => (
                  <BotaoChapa
                    key={entry.id}
                    medida="p"
                    tom="contorno"
                    disabled={busy}
                    onClick={() => launch(entry.id)}
                  >
                    {entry.activityTitle}
                  </BotaoChapa>
                ))}
              </div>
            </div>
          )}
        </Chapa>
      )}
      {history.length > 0 && (
        <section aria-labelledby="lab-history">
          <h2 id="lab-history" className="font-display text-2xl font-semibold">
            Minhas experiências
          </h2>
          <ul className="mt-3 grid gap-2">
            {history.slice(0, historyLimit).map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-card border-2 border-sombra p-4"
              >
                <div>
                  <p className="font-semibold">{entry.title}</p>
                  <p className="text-sm text-tinta-suave">
                    Salva em{" "}
                    {new Date(entry.updatedAt).toLocaleDateString("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                    })}
                  </p>
                </div>
                <BotaoChapa
                  medida="p"
                  tom="contorno"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setMessage("");
                    try {
                      const result = await readLabAction({ profileId, id: entry.id });
                      if (result.ok) open(result.data);
                      else setMessage(result.error);
                    } catch {
                      setMessage("Não foi possível retomar. Tente novamente.");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Retomar
                </BotaoChapa>
              </li>
            ))}
          </ul>
          {historyLimit < history.length && (
            <BotaoChapa
              className="mt-3"
              medida="p"
              tom="contorno"
              onClick={() => setHistoryLimit((value) => value + 10)}
            >
              Mais experiências salvas
            </BotaoChapa>
          )}
        </section>
      )}
      <section aria-labelledby="lab-library">
        <h2 id="lab-library" tabIndex={-1} className="font-display text-2xl font-semibold">
          Biblioteca da minha trilha
        </h2>
        <div className="my-4 grid gap-3 sm:grid-cols-3">
          <label className="font-semibold">
            Buscar
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setLibraryLimit(24);
              }}
              className="mt-1 w-full rounded-controle border-2 border-sombra p-3"
            />
          </label>
          <label className="font-semibold">
            Assunto
            <select
              value={skill}
              onChange={(event) => {
                setSkill(event.target.value);
                setLibraryLimit(24);
              }}
              className="mt-1 w-full rounded-controle border-2 border-sombra p-3"
            >
              <option value="">Todos os assuntos</option>
              {skills.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="font-semibold">
            Ferramenta
            <select
              value={family}
              onChange={(event) => {
                setFamily(event.target.value);
                setLibraryLimit(24);
              }}
              className="mt-1 w-full rounded-controle border-2 border-sombra p-3"
            >
              <option value="">Todas as ferramentas</option>
              {tools.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p role="status" className="mb-3 text-sm text-tinta-suave">
          {shown.length} experiências disponíveis para este perfil.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {shown.slice(0, libraryLimit).map((entry) => (
            <Chapa key={entry.id} tom="creme" className="flex min-w-0 flex-col">
              <p className="text-xs font-semibold text-tinta-suave">
                {entry.skill}
                {entry.recovery ? " · Retomada" : ""}
              </p>
              <h3 className="mt-2 font-display text-xl font-semibold">{entry.activityTitle}</h3>
              <p className="mt-1 text-sm text-tinta-suave">Na missão: {entry.title}</p>
              <p className="mt-2 flex-1 text-sm">{entry.objective}</p>
              <p className="my-3 text-sm font-semibold">{entry.toolName}</p>
              <BotaoChapa
                medida="p"
                tom="contorno"
                disabled={busy}
                onClick={() => launch(entry.id)}
              >
                Explorar
              </BotaoChapa>
            </Chapa>
          ))}
        </div>
        {shown.length > libraryLimit && (
          <BotaoChapa
            className="mt-4"
            tom="contorno"
            onClick={() => setLibraryLimit((value) => value + 24)}
          >
            Mais experiências da trilha
          </BotaoChapa>
        )}
        {shown.length === 0 && (
          <p>
            Não há experiências para estes filtros. Escolha outro assunto ou confira a trilha na
            área da família.
          </p>
        )}
      </section>
      <p role="alert">{message}</p>
    </div>
  );
}
