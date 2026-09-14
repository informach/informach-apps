"use client";
import { cn } from "@informach/ui/lib/utils";
import { ArrowRight, ChevronLeft, Flag, Lightbulb } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { StartButton } from "@/components/controls";
import { Mascote } from "@/components/mascote";
import { BotaoChapa, LinkChapa } from "@/components/ui/botao-chapa";
import { Chapa } from "@/components/ui/chapa";
import { Confete } from "@/components/ui/confete";
import { Etiqueta } from "@/components/ui/pagina";
import { PainelDevolutiva } from "@/components/ui/painel-devolutiva";
import { ProgressoSegmentado } from "@/components/ui/progresso-segmentado";
import { Lab } from "@/features/labs/components/labs";
import { answerAction, hintAction, interruptAction, reportAction } from "../actions";
import type { SessionView } from "../service";
import { initialResponse, ResponseInput } from "./response-input";

const reportCategories = [
  ["not_understood", "Não entendi esta questão"],
  ["possible_error", "Acho que há um erro"],
  ["figure_issue", "A figura está com problema"],
  ["app_difficulty", "Tive dificuldade para usar o app"],
] as const;

type ReportCategory = (typeof reportCategories)[number][0];

function ItemReport({
  sessionId,
  itemId,
  initialReports,
}: {
  sessionId: string;
  itemId: string;
  initialReports: { category: ReportCategory; detail: string }[];
}) {
  const initialCategory = initialReports[0]?.category ?? "not_understood";
  const [category, setCategory] = useState<ReportCategory>(initialCategory);
  const [detail, setDetail] = useState(
    initialReports.find((report) => report.category === initialCategory)?.detail ?? "",
  );
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [reportedCategories, setReportedCategories] = useState(initialReports);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const alreadyReported = reportedCategories.some((report) => report.category === category);
  return (
    <details className="mt-7 text-sm text-tinta-suave">
      <summary className="flex cursor-pointer items-center gap-2">
        <Flag size={14} aria-hidden="true" /> Algo nesta questão atrapalhou?
      </summary>
      <label htmlFor={`report-category-${itemId}`} className="mt-3 block font-semibold text-tinta">
        O que aconteceu?
      </label>
      <select
        id={`report-category-${itemId}`}
        value={category}
        onChange={(event) => {
          const next = event.target.value as ReportCategory;
          setCategory(next);
          setDetail(reportedCategories.find((report) => report.category === next)?.detail ?? "");
          setMessage("");
        }}
        className="mt-1.5 w-full rounded-controle border-2 border-sombra bg-creme p-3 text-tinta"
      >
        {reportCategories.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <label htmlFor={`report-detail-${itemId}`} className="mt-3 block font-semibold text-tinta">
        Conte mais, se quiser, sem incluir dados pessoais
      </label>
      <textarea
        id={`report-detail-${itemId}`}
        maxLength={1000}
        value={detail}
        onChange={(event) => setDetail(event.target.value)}
        className="mt-1.5 min-h-24 w-full rounded-controle border-2 border-sombra bg-creme p-3 text-tinta"
      />
      <BotaoChapa
        type="button"
        tom="contorno"
        medida="p"
        className="mt-2"
        disabled={pending || alreadyReported}
        onClick={() =>
          start(async () => {
            try {
              const response = await reportAction({
                sessionId,
                itemId,
                category,
                detail,
                requestKey,
              });
              if (response.ok) {
                setReportedCategories((current) => [...current, { category, detail }]);
                setRequestKey(crypto.randomUUID());
                setMessage("Relato registrado. Obrigado!");
              } else setMessage(response.error);
            } catch {
              setMessage("Não foi possível enviar o relato.");
            }
          })
        }
      >
        {alreadyReported ? "Relato registrado" : "Enviar relato"}
      </BotaoChapa>
      <p role="status" className="mt-2 text-sm">
        {message}
      </p>
    </details>
  );
}

export function Player({ initial }: { initial: SessionView }) {
  const [view, setView] = useState(initial);
  const [index, setIndex] = useState(initial.saved.length);
  const [choice, setChoice] = useState(() =>
    initialResponse(initial.lesson.items[initial.saved.length]),
  );
  const [feedback, setFeedback] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const item = view.lesson.items[index];
  const result = item && view.saved.find((saved) => saved.itemId === item.id);
  const itemHints = item ? (view.hints[item.id] ?? []) : [];
  const assessment = view.mode === "exam" || view.mode === "diagnostic";

  if (view.interrupted)
    return (
      <Chapa tom="sol" className="mx-auto max-w-2xl text-center">
        <Mascote humor="acolhendo" tamanho="m" className="mx-auto" />
        <h1 className="mt-3 font-display text-2xl font-semibold text-tinta">
          Esta sessão foi encerrada com segurança.
        </h1>
        <p className="mx-auto mt-2 max-w-lg text-sm text-tinta-suave">
          {view.interruptionReason}. As respostas que você já registrou continuam no histórico, sem
          completar as questões restantes nem atribuir domínio.
        </p>
        <LinkChapa href="/hoje" medida="g" className="mt-5">
          Ver outra missão
        </LinkChapa>
      </Chapa>
    );

  if (view.suspended && !view.completed)
    return (
      <Chapa tom="sol" className="mx-auto max-w-2xl text-center">
        <Mascote humor="acolhendo" tamanho="m" className="mx-auto" />
        <h1 className="mt-3 font-display text-2xl font-semibold text-tinta">
          Esta missão está pausada para correção.
        </h1>
        <p className="mx-auto mt-2 max-w-lg text-sm text-tinta-suave">
          Suas respostas anteriores continuam guardadas. Você pode encerrar esta sessão sem
          preencher as questões restantes e sem transformar o percurso parcial em conclusão.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <BotaoChapa
            type="button"
            medida="g"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError("");
                try {
                  const response = await interruptAction(view.id);
                  if (response.ok) setView(response.data);
                  else setError(response.error);
                } catch {
                  setError("Não foi possível encerrar a sessão. Tente novamente.");
                }
              })
            }
          >
            {pending ? "Encerrando…" : "Encerrar esta sessão"}
          </BotaoChapa>
          <LinkChapa href="/hoje" tom="contorno" medida="g">
            Voltar sem encerrar
          </LinkChapa>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm font-semibold text-coral-fundo">
            {error}
          </p>
        )}
      </Chapa>
    );

  if (view.completed && !feedback) {
    const objective = view.saved.filter((saved) => saved.feedback?.correct !== null);
    const correct = objective.filter((saved) => saved.feedback?.correct).length;
    const reflections = view.saved.filter((saved) => saved.result === "reflection").length;
    return (
      <section className="relative mx-auto max-w-3xl text-center">
        <Confete />
        <div className="relative">
          <Mascote humor="comemorando" tamanho="g" className="mx-auto" />
          <Etiqueta tom="lima" className="mt-2">
            Mais uma descoberta no seu caminho
          </Etiqueta>
          <h1 className="mt-3 font-display text-3xl leading-tight font-semibold text-tinta sm:text-4xl">
            Uma ideia para levar com você.
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-tinta-suave">
            Você acertou {correct} de {objective.length} questões com correção objetiva.{" "}
            {view.saved.filter((s) => s.helpCount > 0).length} tiveram pistas. Esse registro ajuda a
            escolher o próximo passo.
          </p>
          {reflections > 0 && (
            <p className="mx-auto mt-2 max-w-xl text-sm text-tinta-suave">
              {reflections}{" "}
              {reflections === 1 ? "reflexão foi registrada" : "reflexões foram registradas"} sem
              nota automática.
            </p>
          )}
          {assessment && (
            <p className="mx-auto mt-2 max-w-xl text-sm text-tinta-suave">
              Resultado formativo de um percurso autoral. Não equivale a nota, classificação ou
              diagnóstico oficial.
            </p>
          )}
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <LinkChapa href="/hoje" medida="g">
              Voltar ao meu dia
            </LinkChapa>
            <LinkChapa href="/caderno" tom="contorno" medida="g">
              Registrar uma descoberta
            </LinkChapa>
          </div>
        </div>

        {view.nextStep && (
          <Chapa tom="verde" className="mt-8 text-left">
            <Etiqueta tom="verde">Um próximo passo possível</Etiqueta>
            <h2 className="mt-2.5 font-display text-xl font-semibold text-tinta">
              {view.nextStep.title}
            </h2>
            <p className="mt-1.5 mb-4 text-sm text-tinta-suave">{view.nextStep.reason}</p>
            <StartButton
              profileId={view.profileId}
              lessonId={view.nextStep.lessonId}
              mode={view.nextStep.mode}
            >
              Continuar por esta ideia
            </StartButton>
          </Chapa>
        )}

        {assessment && (
          <div className="mt-8 overflow-x-auto rounded-card border-2 border-sombra bg-creme text-left">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-sombra">
                  <th className="p-3.5 text-left font-display font-semibold">Habilidade</th>
                  <th className="p-3.5 text-left font-display font-semibold">
                    Acertos neste percurso
                  </th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(view.skillLabels).map(([skill, label]) => {
                  const ids = new Set(
                    view.lesson.items.filter((q) => q.skillId === skill).map((q) => q.id),
                  );
                  const answers = view.saved.filter(
                    (saved) => ids.has(saved.itemId) && saved.feedback?.correct !== null,
                  );
                  return (
                    <tr key={skill} className="border-b border-sombra/60 last:border-0">
                      <td className="p-3.5">{label}</td>
                      <td className="p-3.5 font-display font-semibold">
                        {answers.filter((s) => s.feedback?.correct).length} / {answers.length}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <h2 className="mt-9 mb-3 text-left font-display text-2xl font-semibold text-tinta">
          Revisite seu raciocínio
        </h2>
        <div className="grid gap-2.5 text-left">
          {view.saved.map((saved) => (
            <details
              key={saved.itemId}
              className="rounded-card border-2 border-sombra bg-creme p-4 shadow-chapa"
            >
              <summary className="flex cursor-pointer items-start gap-2.5 font-semibold text-tinta">
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-xs text-white",
                    saved.feedback?.correct === null
                      ? "bg-uva"
                      : saved.feedback?.correct
                        ? "bg-verde-solido"
                        : "bg-coral-solido",
                  )}
                >
                  {saved.feedback?.correct === null ? "✎" : saved.feedback?.correct ? "✓" : "↗"}
                </span>
                {view.lesson.items.find((q) => q.id === saved.itemId)?.prompt}
              </summary>
              <p className="mt-3 text-sm text-tinta-suave">
                Sua resposta: {saved.chosen === "__skip__" ? "Ainda não sei" : saved.chosen} ·{" "}
                {saved.helpCount ? "Com pistas" : "Sem pistas nesta tentativa"}
              </p>
              <p className="mt-1.5 text-sm text-tinta">{saved.feedback?.explanation}</p>
              {saved.feedback?.rubric && (
                <ul className="mt-2 grid gap-1 pl-5 text-sm text-tinta-suave [&>li]:list-disc">
                  {saved.feedback.rubric.map((criterion) => (
                    <li key={criterion}>{criterion}</li>
                  ))}
                </ul>
              )}
              {saved.feedback?.solution && saved.feedback.correct === null && (
                <p className="mt-2 text-sm text-tinta">
                  <strong>Uma resposta possível:</strong> {saved.feedback.solution}
                </p>
              )}
            </details>
          ))}
        </div>
      </section>
    );
  }

  if (!item)
    return (
      <p role="alert" className="mx-auto max-w-3xl">
        Esta missão precisa ser retomada.{" "}
        <Link href="/hoje" className="underline underline-offset-4">
          Voltar ao início
        </Link>
      </p>
    );

  function submit(answer: string) {
    if (!item) return;
    start(async () => {
      setError("");
      try {
        const response = await answerAction({
          sessionId: view.id,
          itemId: item.id,
          answer,
          requestKey,
        });
        if (!response.ok) {
          setError(response.error);
          return;
        }
        setView(response.data);
        setRequestKey(crypto.randomUUID());
        if (assessment) {
          setIndex(response.data.saved.length);
          setChoice(initialResponse(response.data.lesson.items[response.data.saved.length]));
        } else setFeedback(true);
      } catch {
        setError(
          "A conexão falhou. Sua resposta pode ter sido salva: tente novamente para recuperar o mesmo registro.",
        );
      }
    });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-4 flex items-center gap-3">
        <Link
          href="/hoje"
          className="grid size-11 shrink-0 place-items-center rounded-full border-2 border-sombra bg-creme text-tinta-suave transition-colors hover:text-tinta"
          aria-label="Pausar e sair"
          title="Pausar e sair"
        >
          <ChevronLeft size={22} aria-hidden="true" />
        </Link>
        <ProgressoSegmentado
          total={view.lesson.items.length}
          feitos={view.saved.length}
          className="flex-1"
        />
        <span className="shrink-0 font-display text-sm font-semibold text-tinta-suave">
          {index + 1} de {view.lesson.items.length}
        </span>
      </header>

      <Etiqueta tom={view.mode === "exam" ? "ceu" : assessment ? "uva" : "lima"}>
        {view.mode === "exam"
          ? "Simulado autoral · sem pistas"
          : view.mode === "diagnostic"
            ? "Diagnóstico · ainda não sei é uma resposta"
            : "Uma ideia de cada vez"}
      </Etiqueta>
      <h1 className="mt-2 font-display text-2xl leading-tight font-semibold text-tinta sm:text-3xl">
        {view.lesson.title}
      </h1>
      <p className="mt-1.5 text-sm text-tinta-suave">{view.lesson.objective}</p>

      {index === 0 && !assessment && (
        <details className="mt-5 rounded-card border-2 border-sol/40 bg-sol-claro p-4">
          <summary className="cursor-pointer font-display font-semibold text-tinta">
            Antes de começar: uma ideia que ajuda
          </summary>
          <p className="mt-2.5 text-sm text-tinta">{view.lesson.introduction}</p>
        </details>
      )}

      <fieldset className="mt-7 border-0 p-0" disabled={pending || feedback}>
        <legend className="mb-5 font-display text-xl leading-snug font-semibold text-tinta sm:text-2xl">
          {item.prompt}
        </legend>
        <ResponseInput
          key={item.id}
          item={item}
          value={choice}
          disabled={pending || feedback}
          onChange={setChoice}
        />
      </fieldset>

      {item.exploration && !feedback && (
        <details className="mt-5 rounded-card border-2 border-ceu/40 bg-ceu-claro p-4">
          <summary className="cursor-pointer font-display font-semibold text-tinta">
            Explorar antes de responder
          </summary>
          <p className="mt-2 text-sm text-tinta">{item.exploration.instruction}</p>
          <p className="mt-1 text-xs text-tinta-suave">{item.exploration.alternativeText}</p>
          <div className="mt-3">
            <Lab kind={item.exploration.kind} />
          </div>
        </details>
      )}

      {!assessment && !feedback && (
        <div className="mt-6">
          <BotaoChapa
            type="button"
            tom="sol"
            medida="p"
            disabled={pending || itemHints.length >= 3}
            onClick={() =>
              start(async () => {
                setError("");
                try {
                  const response = await hintAction({
                    sessionId: view.id,
                    itemId: item.id,
                    level: itemHints.length + 1,
                  });
                  if (response.ok)
                    setView({ ...view, hints: { ...view.hints, [item.id]: response.data } });
                  else setError(response.error);
                } catch {
                  setError("Não foi possível abrir a pista. Tente novamente.");
                }
              })
            }
          >
            <Lightbulb size={18} aria-hidden="true" />
            {itemHints.length ? "Próxima pista" : "Quero uma pista"} ({itemHints.length}/3)
          </BotaoChapa>
          <div aria-live="polite" className="mt-3 grid gap-2.5">
            {itemHints.map((hint, i) => (
              <p
                key={hint}
                className="rounded-card border-2 border-sol/45 bg-sol-claro p-3.5 text-sm text-tinta motion-safe:animate-pop-in"
              >
                <strong className="font-display">Pista {i + 1}.</strong> {hint}
              </p>
            ))}
          </div>
          {view.lesson.lab && itemHints.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer font-semibold text-tinta-suave underline underline-offset-4 hover:text-tinta">
                Explorar uma ferramenta de apoio
              </summary>
              <div className="mt-3">
                <Lab kind={view.lesson.lab} />
              </div>
            </details>
          )}
        </div>
      )}

      {error && (
        <p
          className="mt-5 rounded-card border-2 border-coral/45 bg-coral-claro p-3.5 text-sm font-semibold wrap-anywhere text-tinta"
          role="alert"
        >
          {error}
        </p>
      )}

      {!feedback && (
        <div className="mt-7 flex flex-wrap items-center justify-end gap-4 border-t-2 border-sombra pt-6">
          <BotaoChapa
            type="button"
            tom="contorno"
            disabled={pending}
            onClick={() => submit("__skip__")}
          >
            Ainda não sei
          </BotaoChapa>
          <BotaoChapa
            type="button"
            medida="g"
            disabled={
              pending ||
              !choice.trim() ||
              (item.type === "justification" && choice.trim().length < item.response.minLength)
            }
            onClick={() => submit(choice)}
          >
            {pending ? "Salvando…" : assessment ? "Registrar resposta" : "Conferir minha ideia"}
            <ArrowRight size={19} aria-hidden="true" />
          </BotaoChapa>
        </div>
      )}

      <ItemReport
        key={item.id}
        sessionId={view.id}
        itemId={item.id}
        initialReports={view.reports.filter((report) => report.itemId === item.id)}
      />

      {feedback && result?.feedback && result.feedback.correct === null && (
        <Chapa tom="uva" className="mt-7">
          <h2 className="font-display text-xl font-semibold text-tinta">Reflexão registrada.</h2>
          <p className="mt-2 text-sm text-tinta">{result.feedback.explanation}</p>
          {result.feedback.rubric && (
            <ul className="mt-3 grid gap-1 pl-5 text-sm text-tinta-suave [&>li]:list-disc">
              {result.feedback.rubric.map((criterion) => (
                <li key={criterion}>{criterion}</li>
              ))}
            </ul>
          )}
          {result.feedback.solution && (
            <p className="mt-3 text-sm text-tinta">
              <strong>Uma resposta possível:</strong> {result.feedback.solution}
            </p>
          )}
          <BotaoChapa
            type="button"
            medida="g"
            tom="uva"
            className="mt-4"
            onClick={() => {
              setFeedback(false);
              setIndex(view.saved.length);
              setChoice(initialResponse(view.lesson.items[view.saved.length]));
            }}
          >
            {view.completed ? "Ver minhas descobertas" : "Continuar"}
            <ArrowRight size={19} aria-hidden="true" />
          </BotaoChapa>
        </Chapa>
      )}

      {feedback && result?.feedback && result.feedback.correct !== null && (
        <>
          {/* Espaço para o painel fixo não cobrir o fim do conteúdo. */}
          <div aria-hidden="true" className="h-56 sm:h-44" />
          <PainelDevolutiva
            acertou={result.feedback.correct}
            titulo={
              result.feedback.correct ? "Isso! Agora, veja por quê." : "Vamos encontrar o caminho."
            }
            explicacao={result.feedback.explanation}
            nota={
              result.helpCount
                ? "Esta tentativa foi registrada com apoio de pistas."
                : "Esta tentativa foi registrada sem pistas."
            }
          >
            <BotaoChapa
              type="button"
              medida="g"
              tom={result.feedback.correct ? "verde" : "coral"}
              className="max-sm:w-full"
              onClick={() => {
                setFeedback(false);
                setIndex(view.saved.length);
                setChoice(initialResponse(view.lesson.items[view.saved.length]));
              }}
            >
              {view.completed ? "Ver minhas descobertas" : "Continuar"}
              <ArrowRight size={19} aria-hidden="true" />
            </BotaoChapa>
          </PainelDevolutiva>
        </>
      )}
    </div>
  );
}
