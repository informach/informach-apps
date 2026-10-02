"use client";
import { ArrowRight, ChevronLeft, Flag, Lightbulb } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { StartButton } from "@/components/controls";
import { Mascote } from "@/components/mascote";
import { BotaoChapa, LinkChapa } from "@/components/ui/botao-chapa";
import { Chapa } from "@/components/ui/chapa";
import { Confete } from "@/components/ui/confete";
import { FalaFaisca } from "@/components/ui/fala-faisca";
import { LerEmVoz } from "@/components/ui/ler-em-voz";
import { Etiqueta } from "@/components/ui/pagina";
import { PainelDevolutiva } from "@/components/ui/painel-devolutiva";
import { ProgressoSegmentado } from "@/components/ui/progresso-segmentado";
import { explorerBreakFor } from "@/features/content/pausas";
import { Lab } from "@/features/labs/components/labs";
import {
  answerAction,
  hintAction,
  interruptAction,
  readingSupportAction,
  reportAction,
} from "../actions";
import type { SessionView } from "../service";
import { ItemFigure } from "./item-figure";
import { initialResponse, ResponseInput } from "./response-input";
import { SessionResponses } from "./session-responses";

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

/** Estado da oferta de pausa: fora de cena, oferecida, aceita ou dispensada. */
type Pausa = "silenciosa" | "oferecida" | "aceita" | "dispensada";

export function Player({
  initial,
  minutosSugeridos = 0,
}: {
  initial: SessionView;
  /** Rotina escolhida pelo responsável. Zero desliga a oferta de pausa. */
  minutosSugeridos?: number;
}) {
  const [view, setView] = useState(initial);
  const [index, setIndex] = useState(initial.saved.length);
  const [choice, setChoice] = useState(() =>
    initialResponse(initial.lesson.items[initial.saved.length]),
  );
  const [feedback, setFeedback] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [readingSupport, setReadingSupport] = useState(initial.readingSupport);
  const leituraUsada = useRef(initial.readingSupport);
  /* O registro do apoio roda em paralelo à leitura, mas não pode perder a
     corrida para a última resposta: se a sessão fechasse antes da marca, o
     resultado apareceria como leitura autônoma. `submit` espera este pendente. */
  const leituraPendente = useRef<Promise<void> | null>(null);
  const item = view.lesson.items[index];
  const result = item && view.saved.find((saved) => saved.itemId === item.id);
  const itemHints = item ? (view.hints[item.id] ?? []) : [];
  const assessment = view.mode === "exam" || view.mode === "diagnostic";
  const promptRef = useRef<HTMLParagraphElement>(null);
  const currentItemId = item?.id;
  useEffect(() => {
    if (currentItemId) promptRef.current?.focus();
  }, [currentItemId]);

  /**
   * Em treino, ouvir o enunciado é só conforto de leitura e não registra nada.
   * Em diagnóstico e simulado, a leitura pode alterar o construto medido, então
   * a sessão declara o apoio. Se o servidor recusar a marca — falha de rede ou
   * percurso já encerrado —, outra escuta pode tentar a marca novamente. O
   * fato de que houve leitura fica preservado e também segue com a resposta,
   * para não apresentar a avaliação como leitura autônoma por falha da marca.
   */
  function marcarLeitura() {
    if (!assessment) return;
    leituraUsada.current = true;
    if (readingSupport) return;
    setReadingSupport(true);
    const registro: Promise<void> = readingSupportAction(view.id).then(
      (response) => {
        if (!response.ok || !response.data.marked) setReadingSupport(false);
      },
      () => setReadingSupport(false),
    );
    leituraPendente.current = registro;
    void registro.then(() => {
      if (leituraPendente.current === registro) leituraPendente.current = null;
    });
  }

  /* Pausa do explorador: uma OFERTA quando o tempo sugerido passa, nunca uma
     parede. O botão de continuar a missão segue sendo a ação mais fácil da
     tela, a pausa não vale recompensa e "não preciso" encerra o assunto pela
     sessão inteira. A regra escrita em `Routine` é explícita: sem bloqueio de
     estudo e sem punição. */
  const [pausa, setPausa] = useState<Pausa>("silenciosa");
  const [adiamentos, setAdiamentos] = useState(0);
  useEffect(() => {
    if (!minutosSugeridos || pausa !== "silenciosa") return;
    // Primeira oferta no tempo sugerido; cada "mais tarde" adia cinco minutos.
    const espera = (adiamentos === 0 ? minutosSugeridos : 5) * 60_000;
    const relogio = setTimeout(() => setPausa("oferecida"), espera);
    return () => clearTimeout(relogio);
  }, [minutosSugeridos, adiamentos, pausa]);

  if (view.interrupted)
    return (
      <section className="mx-auto max-w-3xl">
        <Chapa tom="sol" className="text-center">
          <Mascote humor="acolhendo" tamanho="m" className="mx-auto" />
          <h1 className="mt-3 font-display text-2xl font-semibold text-tinta">
            Esta sessão foi encerrada com segurança.
          </h1>
          <p className="mx-auto mt-2 max-w-lg text-sm text-tinta-suave">
            {view.interruptionReason}. As respostas que você já registrou continuam no histórico,
            sem completar as questões restantes nem atribuir domínio.
          </p>
          <LinkChapa href="/hoje" medida="g" className="mt-5">
            Ver outra missão
          </LinkChapa>
        </Chapa>
        <SessionResponses view={view} />
      </section>
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
            Você acertou {correct} de {objective.length} questões.{" "}
            {view.saved.filter((s) => s.helpCount > 0).length} tiveram pistas. Esse registro ajuda a
            escolher o próximo passo.
          </p>
          {reflections > 0 && (
            <p className="mx-auto mt-2 max-w-xl text-sm text-tinta-suave">
              {reflections === 1
                ? "Sua explicação ficou guardada, sem nota."
                : `Suas ${reflections} explicações ficaram guardadas, sem nota.`}
            </p>
          )}
          {assessment && (
            <p className="mx-auto mt-2 max-w-xl text-sm text-tinta-suave">
              Este resultado serve para escolher os próximos passos. Não é nota nem classificação
              oficial.
              {view.readingSupport ? " Neste percurso, você usou a leitura em voz alta." : ""}
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
                  {view.previousAssessment && (
                    <th className="p-3.5 text-left font-display font-semibold">
                      Percurso anterior
                    </th>
                  )}
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
                  const before = view.previousAssessment?.counts[skill];
                  return (
                    <tr key={skill} className="border-b border-sombra/60 last:border-0">
                      <td className="p-3.5">{label}</td>
                      <td className="p-3.5 font-display font-semibold">
                        {answers.filter((s) => s.feedback?.correct).length} / {answers.length}
                      </td>
                      {view.previousAssessment && (
                        <td className="p-3.5 text-tinta-suave">
                          {before ? `${before.correct} / ${before.total}` : "sem registro"}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {assessment && view.previousAssessment && (
          <p className="mt-2 text-left text-sm text-tinta-suave">
            A coluna de comparação mostra o percurso de{" "}
            {new Date(view.previousAssessment.createdAt).toLocaleDateString("pt-BR", {
              timeZone: "America/Sao_Paulo",
            })}
            . Os percursos podem incluir questões já vistas. Compare as estratégias usadas e as
            condições de cada tentativa; estes registros não são uma nota oficial.
            {/* Sem esta frase, mudar o apoio de leitura entre um percurso e
                outro apareceria como avanço ou recuo de habilidade. */}
            {view.previousAssessment.readingSupport !== view.readingSupport
              ? view.readingSupport
                ? " Este percurso teve apoio de leitura em voz alta e o anterior não, então as duas colunas foram feitas em condições diferentes."
                : " O percurso anterior teve apoio de leitura em voz alta e este não, então as duas colunas foram feitas em condições diferentes."
              : ""}
          </p>
        )}

        <SessionResponses view={view} />
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
        // Ver `marcarLeitura`: a marca de apoio precisa chegar antes do fim.
        if (leituraPendente.current) await leituraPendente.current;
        const response = await answerAction({
          sessionId: view.id,
          itemId: item.id,
          answer,
          requestKey,
          readingSupport: assessment ? leituraUsada.current : undefined,
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

      {/* A ideia de abertura ficava fechada em um `<details>` que quase ninguém
          abre. Ela é o enquadramento da missão, então a Faísca a diz em voz
          alta antes da primeira questão. */}
      {index === 0 && !assessment && (
        <FalaFaisca
          humor="encorajando"
          tom="sol"
          titulo="Uma ideia que ajuda"
          className="mt-6 mb-1"
        >
          <p>{view.lesson.introduction}</p>
        </FalaFaisca>
      )}

      {pausa === "oferecida" && (
        <FalaFaisca
          humor="acolhendo"
          tom="ceu"
          titulo="Que tal uma pausa de dois minutos?"
          className="mt-6"
        >
          <p>Você já está nisso há um tempo. A missão espera aqui, e nada se perde.</p>
          <div className="mt-3 flex flex-wrap gap-2.5">
            <BotaoChapa type="button" tom="ceu" medida="p" onClick={() => setPausa("aceita")}>
              Vou pausar
            </BotaoChapa>
            <BotaoChapa
              type="button"
              tom="contorno"
              medida="p"
              onClick={() => {
                setAdiamentos((total) => total + 1);
                setPausa("silenciosa");
              }}
            >
              Mais tarde
            </BotaoChapa>
            <BotaoChapa
              type="button"
              tom="contorno"
              medida="p"
              onClick={() => setPausa("dispensada")}
            >
              Não preciso
            </BotaoChapa>
          </div>
        </FalaFaisca>
      )}

      {pausa === "aceita" && (
        <FalaFaisca humor="descansando" tom="ceu" titulo="Dois minutos seus." className="mt-6">
          <p>{explorerBreakFor(view.id)}</p>
          <p className="mt-1.5 text-sm text-tinta-suave">
            Isto não vale ponto nem selo. É só uma pausa.
          </p>
          <div className="mt-3">
            <BotaoChapa type="button" tom="ceu" medida="p" onClick={() => setPausa("dispensada")}>
              Voltei
            </BotaoChapa>
          </div>
        </FalaFaisca>
      )}

      {/* O enunciado sai do <legend> e vira um parágrafo próprio: um botão
          dentro de `fieldset[disabled]` herda o desabilitado, e ouvir o
          enunciado continua possível no treino enquanto a resposta é conferida.
          Na avaliação, uma nova escuta aguarda o envio para que o apoio seja registrado.
          O grupo de respostas continua se chamando pelo enunciado, agora por
          `aria-labelledby` — um rótulo genérico deixaria quem navega por
          leitor de tela entrar nas alternativas sem saber a pergunta. */}
      <div className="mt-7 mb-5 flex items-start gap-3">
        <p
          ref={promptRef}
          tabIndex={-1}
          id={`enunciado-${item.id}`}
          className="min-w-0 flex-1 font-display text-xl leading-snug font-semibold text-tinta sm:text-2xl"
        >
          {item.prompt}
        </p>
        <LerEmVoz texto={item.prompt} aoUsar={marcarLeitura} disabled={assessment && pending} />
      </div>

      <ItemFigure figure={item.figure} />
      <fieldset
        className="border-0 p-0"
        disabled={pending || feedback}
        aria-labelledby={`enunciado-${item.id}`}
      >
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
              <div
                key={hint}
                className="flex items-start gap-2.5 rounded-card border-2 border-sol/45 bg-sol-claro p-3.5 motion-safe:animate-pop-in"
              >
                <p className="min-w-0 flex-1 text-sm text-tinta">
                  <strong className="font-display">Pista {i + 1}.</strong> {hint}
                </p>
                <LerEmVoz texto={hint} rotulo={`Ouvir a pista ${i + 1}`} aoUsar={marcarLeitura} />
              </div>
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

      <Link
        className="mt-6 inline-block text-sm font-semibold underline underline-offset-4"
        href={`/caderno?${new URLSearchParams({ session: view.id, item: item.id })}`}
      >
        Anotar uma descoberta sobre esta questão
      </Link>
      <ItemReport
        key={item.id}
        sessionId={view.id}
        itemId={item.id}
        initialReports={view.reports.filter((report) => report.itemId === item.id)}
      />

      {feedback && result?.feedback && result.feedback.correct === null && (
        <Chapa tom="uva" className="mt-7">
          <FalaFaisca humor="pensando" tom="creme" titulo="Reflexão registrada." tituloComo="h2">
            <div className="flex items-start gap-2.5">
              <p className="min-w-0 flex-1">{result.feedback.explanation}</p>
              <LerEmVoz
                texto={result.feedback.explanation}
                rotulo="Ouvir a explicação"
                aoUsar={marcarLeitura}
              />
            </div>
          </FalaFaisca>
          {result.feedback.rubric && (
            <>
              {/* Rubrica como autoavaliação, não como nota: o produto não
                  atribui acerto a texto livre, então a interface não pode
                  sugerir que algum critério foi conferido automaticamente. */}
              <p className="mt-4 font-display font-semibold text-tinta">
                Compare sua explicação com estes critérios:
              </p>
              <ul className="mt-2 grid gap-1 pl-5 text-sm text-tinta-suave [&>li]:list-disc">
                {result.feedback.rubric.map((criterion) => (
                  <li key={criterion}>{criterion}</li>
                ))}
              </ul>
            </>
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
            voz={
              <LerEmVoz
                texto={result.feedback.explanation}
                rotulo="Ouvir a explicação"
                aoUsar={marcarLeitura}
              />
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
