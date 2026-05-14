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
import { loadSlotsByClassDayMap } from "@/features/subjects/alternating-slots-repository";
import { billing } from "@/lib/billing";

export type ParseActivitiesFromImageInput = {
  userId: string;
  /** Data URL no formato `data:image/{jpeg|png|webp};base64,...`. */
  imageDataUrl: string;
};

export type ParseActivitiesFromImageResult = EnrichedParseResult;

const FEATURE = "agenda.activities.parse_image" as const;

type ActivitiesAgentResponse = {
  object: unknown;
  usage?: unknown;
};

const IMAGE_INSTRUCTION =
  "Extraia as atividades escolares descritas nesta imagem (foto de caderno, " +
  "agenda do aluno, recado da escola, print de mensagem). Para cada atividade, " +
  "preencha TODOS os campos disponíveis do schema (title, type, dueAt, " +
  "description, subjectHint, studentNameHint). Se a imagem trouxer datas, " +
  "resolva relativas ao 'hoje' informado no cabeçalho do conteúdo. " +
  "ANTES DE EXTRAIR: leia a página inteira mapeando a estrutura visual — " +
  "cabeçalhos de matéria, setas/chaves/linhas que ligam itens, bullets e " +
  "marcadores de tarefa. SIGA AS SETAS antes de usar proximidade: se uma " +
  "palavra (ex.: 'Ciências') tem uma seta que cruza outra seção e termina " +
  "num comentário, esse comentário pertence à palavra de origem da seta, " +
  "NÃO ao bloco mais próximo. " +
  "QUEBRE EM ATIVIDADES SEPARADAS APENAS quando houver SUPORTES distintos " +
  "(digital vs livro físico vs apostila; ou apps diferentes como SAS vs " +
  "Google Sala de Aula) ou entregáveis claramente independentes (prova + " +
  "trabalho, leitura + redação). Módulos/livros dentro do MESMO app NÃO " +
  "quebram (ex.: Logos e Eureka são módulos do SAS Educacional → 1 atividade " +
  "'Fazer Logos e Eureka 4 no SAS'). Páginas ou exercícios diferentes do MESMO " +
  "livro/material (mesmo descontínuos, ex.: 'páginas 58, 59, 80, 86, 87') são " +
  "UMA atividade só, com a lista consolidada no title. " +
  "PROPAGAÇÃO DE DATA: data no topo da folha/seção é o 'contexto ativo' e se " +
  "aplica a TODAS as atividades abaixo até aparecer nova data. Não deixe " +
  "dueAt=null quando há data no contexto. PRESERVE também a descrição (ex.: " +
  "'o que é e como funciona') — não descarte só porque o título já está " +
  "formado. " +
  "ATENÇÃO ÀS PISTAS DE TURMA: cabeçalhos com códigos compactos (EFI[N]T[X], " +
  'EFII[N]T[X], EM[N]T[X]) ou série/letra por extenso ("5º A", "6º ano B", "7° G") ' +
  "indicam a turma da imagem inteira. Cruze com o bloco 'Matérias disponíveis " +
  "nas turmas dos estudantes' do cabeçalho do conteúdo para deduzir qual estudante " +
  "é dono daquela turma e preencha studentNameHint com o nome dele em TODAS as " +
  "atividades extraídas — siga as regras detalhadas nas instruções.";

/**
 * Estrutura uma imagem (foto/print/caderno) numa ou mais atividades.
 * Mesma estratégia do fluxo de voz: injeta lista de estudantes + matérias
 * disponíveis por turma no user-message multimodal, agente vision
 * (`activitiesParserVision` com `openai/gpt-4o` + `imageDetail: "low"`)
 * devolve a lista estruturada, server resolve via cascade `studentNameHint
 * → activeTurmaId | subjectHint cross-turma único` e calcula
 * `guessedTurmaId` para alimentar o passo intermediário de confirmação.
 *
 * Cobra 1 crédito. Pro gating e rate limit ficam no route handler.
 */
export async function parseActivitiesFromImage(
  input: ParseActivitiesFromImageInput,
): Promise<ParseActivitiesFromImageResult> {
  const [profiles, turmasWithSubjects] = await Promise.all([
    findStudentProfilesByUser(input.userId),
    listTurmasWithSubjectsForUserForm(input.userId),
  ]);
  // Carrega slots de revezamento quinzenal pras matérias de todas as turmas
  // do user. Map vazio quando nenhuma matéria tem horário quinzenal — não
  // muda o comportamento do fallback de dueAt (continua semanal pra todos).
  const allSubjectIds = turmasWithSubjects.flatMap((t) => t.subjects.map((s) => s.id));
  const slotsBySubjectId = await loadSlotsByClassDayMap(allSubjectIds);

  // Reaproveita o mesmo formato de cabeçalho do voice — a IA já está
  // treinada nas instruções pra esperar esse layout. O bloco "Matérias
  // disponíveis" só aparece quando o user tem turmas com matérias.
  const headerText = buildUserMessage({
    transcript: IMAGE_INSTRUCTION,
    studentNames: profiles.map((p) => p.name),
    turmasWithSubjects,
    profiles,
  });

  const out = await runBillableAgentCall<ActivitiesAgentResponse>({
    billing,
    owner: { type: "user", id: input.userId },
    app: "agenda-da-turma",
    feature: FEATURE,
    model: AGENDA_MODELS[FEATURE],
    recorder,
    agent: "activitiesParserVision",
    getUsage: (response) => response.usage,
    call: async ({ runId }) => {
      const mastra = getMastra();
      const response = await mastra.getAgent("activitiesParserVision").generate(
        [
          {
            role: "user",
            content: [
              { type: "text", text: headerText },
              {
                type: "image",
                image: input.imageDataUrl,
                // `imageDetail: "high"` aumenta tokens de visão (~5× vs "low")
                // mas é necessário para ler setas finas, escritas à mão em
                // caderno escolar, e datas pequenas no canto da página. Custo
                // ainda é centavos por chamada — vale a pena no Pro.
                providerOptions: { openai: { imageDetail: "high" } },
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
  return enrichWithResolvedTurma(parsed, profiles, turmasWithSubjects, undefined, slotsBySubjectId);
}
