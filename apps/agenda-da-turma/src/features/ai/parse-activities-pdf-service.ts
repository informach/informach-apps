import "server-only";

import { runBillableAgentCall } from "@informach/ai-core";
import { getMastra } from "@/ai";
import {
  buildUserMessage,
  type EnrichedParseResult,
  enrichWithResolvedTurma,
} from "@/ai/activities-parser/enrich";
import { type ActivitiesParserOutput, activitiesParserSchema } from "@/ai/activities-parser/schema";
import { agentRunRecorder as recorder } from "@/ai/agent-run-recorder";
import { AGENDA_MODELS } from "@/ai/models";
import { listTurmasWithSubjectsForUserForm } from "@/features/activities/repository";
import { findStudentProfilesByUser } from "@/features/students/repository";
import { billing } from "@/lib/billing";
import { decodePdfDataUrl } from "./pdf-utils";

export type ParseActivitiesFromPdfInput = {
  userId: string;
  /** Data URL no formato `data:application/pdf;base64,...`. */
  pdfDataUrl: string;
};

export type ParseActivitiesFromPdfResult = EnrichedParseResult;

const FEATURE = "agenda.activities.parse_pdf" as const;

type ActivitiesAgentResponse = {
  object: unknown;
  usage?: unknown;
};

const PDF_INSTRUCTION =
  "Extraia as atividades escolares descritas neste PDF (comunicado da semana, " +
  "lista de tarefas, calendário de provas, roteiro/revisão de prova, plano de " +
  "estudos). Para cada atividade, preencha TODOS os campos disponíveis do " +
  "schema. Aplique TODAS as regras das instruções do agente, com ênfase " +
  "redobrada nestes pontos críticos pra PDFs: \n\n" +
  "1. ROTEIRO/REVISÃO DE PROVA: quando o PDF é folha de revisão, roteiro de " +
  "estudos, lista de conteúdos da prova, ou tem cabeçalho do tipo 'Revisão " +
  "da prova de [matéria]', 'Primeira prova de [matéria]', 'Conteúdo da " +
  "avaliação', 'O que vai cair em [matéria]' — siga a seção 'Roteiros de " +
  "estudo / cronogramas pra prova' das instruções. UMA atividade tipo " +
  "'exam', com TÍTULO da prova, DATA da prova, MATÉRIA da prova e " +
  "DESCRIPTION com TODOS os tópicos/exercícios na íntegra. NUNCA quebre " +
  "tópicos/exercícios em atividades separadas; eles são CONTEÚDO da " +
  "description.\n\n" +
  "2. EXERCÍCIOS NA ÍNTEGRA: enunciados de exercícios numerados (1., 2., 3., " +
  "alíneas a/b/c) devem ser COPIADOS LITERALMENTE no campo `description`, " +
  "incluindo o texto completo de cada enunciado e todas as alíneas. NÃO " +
  "resuma 'Exercício 1: identifique sujeito e predicado' quando o enunciado " +
  "real inclui 3 frases pra analisar — copie as 3 frases. Sem o enunciado " +
  "completo o aluno não consegue resolver o exercício fora do PDF original. " +
  "Tópicos de revisão também na íntegra. Pode condensar SÓ comentários " +
  "motivacionais ('bons estudos', 'caprichem') e logística repetida. " +
  "Description aceita até 2000 chars — use o espaço.\n\n" +
  "3. MATÉRIA — REGRA DUPLA: \n" +
  "   (a) Quando o TÍTULO do documento cita a matéria literal (ex.: " +
  "'Revisão da primeira prova de Língua Portuguesa', 'Conteúdo da prova de " +
  "matemática', 'Roteiro de geografia'), o subjectHint é OBRIGATÓRIO — " +
  "extraia a matéria do título. NUNCA retorne null quando a matéria está " +
  "explícita no título do PDF.\n" +
  "   (b) Aplique a seção 'Aliases comuns de matérias' das instruções. Se " +
  "o PDF diz 'Português' e a lista 'Matérias disponíveis' tem 'Língua " +
  "Portuguesa', o subjectHint é 'Língua Portuguesa' (e vice-versa). Idem " +
  "pra Mat ↔ Matemática, Ed Fis ↔ Educação Física, Hist ↔ História, Geo ↔ " +
  "Geografia, Inglês ↔ Língua Inglesa, etc.\n\n" +
  "4. DATA — REGRA NOVA: \n" +
  "   (a) Quando NÃO houver NENHUMA data no PDF (nem explícita, nem " +
  "relativa, nem ambígua) → dueAt é AMANHÃ (hoje + 1 do cabeçalho). " +
  "NUNCA retorne null e NUNCA invente uma data aleatória. Amanhã é o " +
  "default seguro; o user revisa antes de salvar.\n" +
  "   (b) Quando houver data explícita ou relativa, resolva conforme as " +
  "regras de 'Datas relativas' nas instruções.\n" +
  "   (c) PROPAGAÇÃO: data no topo do bloco propaga pras atividades abaixo " +
  "até aparecer nova data.\n\n" +
  "5. PISTAS DE TURMA: cabeçalhos com códigos compactos (EFI[N]T[X], " +
  'EFII[N]T[X], EM[N]T[X]) ou série/letra por extenso ("5º A", "6º ano B", "7° G") ' +
  "indicam a turma do documento inteiro. Cruze com o bloco 'Matérias " +
  "disponíveis nas turmas dos estudantes' do cabeçalho do conteúdo pra " +
  "deduzir qual estudante é dono da turma e preencha studentNameHint com o " +
  "nome dele em TODAS as atividades extraídas — siga as regras detalhadas " +
  "nas instruções.\n\n" +
  "6. QUEBRA DE ATIVIDADES: só quebre quando há SUPORTES distintos (app vs " +
  "livro físico, plataforma X vs apostila) ou entregáveis claramente " +
  "independentes (prova + trabalho na mesma matéria). Páginas/exercícios " +
  "diferentes do MESMO material são UMA atividade só.";

/**
 * Estrutura um PDF (comunicado escolar, lista de tarefas, calendário) numa ou
 * mais atividades. Espelha `parseActivitiesFromImage` mas envia o documento
 * como `type: "file"` + `mediaType: "application/pdf"` — AI SDK v6 suporta
 * nativamente PDF como input multimodal pro gpt-4o (OpenAI Chat API com PDF
 * support). Caller (route handler) garante <= 3 páginas e <= 5MB antes de
 * chamar; aqui assumimos payload já validado.
 *
 * Cobra 1 crédito. Pro gating e rate limit ficam no route handler.
 */
export async function parseActivitiesFromPdf(
  input: ParseActivitiesFromPdfInput,
): Promise<ParseActivitiesFromPdfResult> {
  const [profiles, turmasWithSubjects] = await Promise.all([
    findStudentProfilesByUser(input.userId),
    listTurmasWithSubjectsForUserForm(input.userId),
  ]);

  const headerText = buildUserMessage({
    transcript: PDF_INSTRUCTION,
    studentNames: profiles.map((p) => p.name),
    turmasWithSubjects,
    profiles,
  });

  // Decodifica uma vez antes de chamar a IA — o agente precisa do binário
  // bruto; AI SDK v6 aceita Uint8Array no campo `data` do file part.
  const pdfBytes = decodePdfDataUrl(input.pdfDataUrl);

  const out = await runBillableAgentCall<ActivitiesAgentResponse>({
    billing,
    owner: { type: "user", id: input.userId },
    app: "agenda-da-turma",
    feature: FEATURE,
    model: AGENDA_MODELS[FEATURE],
    recorder,
    agent: "activitiesParserPdf",
    getUsage: (response) => response.usage,
    call: async ({ runId }) => {
      const mastra = getMastra();
      const response = await mastra.getAgent("activitiesParserPdf").generate(
        [
          {
            role: "user",
            content: [
              { type: "text", text: headerText },
              {
                type: "file",
                data: pdfBytes,
                mediaType: "application/pdf",
              },
            ],
          },
        ],
        {
          runId,
          structuredOutput: {
            schema: activitiesParserSchema,
            errorStrategy: "strict",
          },
        },
      );
      return response;
    },
  });

  const parsed = out.result.object as ActivitiesParserOutput;
  return enrichWithResolvedTurma(parsed, profiles, turmasWithSubjects);
}
