import { z } from "zod";
import {
  MAX_ACTIVITY_DESCRIPTION_LENGTH,
  MAX_ACTIVITY_TITLE_LENGTH,
} from "@/features/activities/limits";

/**
 * Schema da saída estruturada do `activitiesParser` (texto) e
 * `activitiesParserVision` (foto). Usado em `agent.generate(..., {
 * structuredOutput: { schema: activitiesParserSchema, errorStrategy: "strict" } })`.
 *
 * Limites batem com `agenda.activities` (`features/activities/limits.ts`).
 * `MAX_ACTIVITIES_PER_BATCH` é um cap duro defensivo contra payload absurdo —
 * 20 cobre o caso real (página de caderno de recados com várias entregas).
 *
 * `subjectHint` é texto livre — o client faz fuzzy-match contra as matérias
 * existentes na turma escolhida (Levenshtein ≤ 3). IA não conhece os UUIDs
 * de matéria; a resolução fica no cliente.
 *
 * `dueAt` aceita null porque dia/data nem sempre é mencionado — o usuário
 * preenche manualmente no batch confirm dialog antes de salvar. Forçar a IA
 * a chutar gera datas estranhas.
 */
export const MAX_ACTIVITIES_PER_BATCH = 20;
export const MAX_SUBJECT_HINT_LENGTH = 60;
export const MAX_STUDENT_HINT_LENGTH = 60;

const activityTypeSchema = z
  .enum(["task", "exam", "project", "reminder"])
  .describe(
    "Categoria da atividade: 'task' (tarefa/lição), 'exam' (prova/avaliação), 'project' (trabalho/projeto), 'reminder' (lembrete/recado).",
  );

const dueAtSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .describe(
    "Data de entrega em formato estrito YYYY-MM-DD. Resolva expressões relativas em pt-BR contra a data 'hoje' informada no input ('amanhã', 'quarta-feira', 'dia 25', 'na próxima semana'). Quando NÃO houver indicação alguma de data no conteúdo, use 'amanhã' (hoje + 1) como default — NUNCA chute uma data aleatória, e NUNCA retorne null. Null só em casos extremos onde até 'amanhã' faria menos sentido que campo vazio — preferível usar amanhã.",
  );

const subjectHintSchema = z
  .string()
  .min(1)
  .max(MAX_SUBJECT_HINT_LENGTH)
  .nullable()
  .describe(
    "Nome da matéria associada, em pt-BR canônico (ex.: 'Matemática', 'História', 'Educação Física'). Texto livre — o cliente faz o matching com a matéria cadastrada. Null quando o conteúdo não menciona matéria.",
  );

const studentNameHintSchema = z
  .string()
  .min(1)
  .max(MAX_STUDENT_HINT_LENGTH)
  .nullable()
  .describe(
    "Nome do estudante a quem a atividade pertence, quando mencionado no conteúdo. Use APENAS valores que apareçam na lista 'Estudantes disponíveis' fornecida no input — ignore nomes próprios que não estejam nessa lista (provavelmente são professor, colega ou parte do título). Null quando o conteúdo não amarrar a atividade a um estudante específico (o cliente tenta inferir pela turma ativa).",
  );

export const activitiesParserSchema = z.object({
  isValidInput: z
    .boolean()
    .describe(
      "true se o conteúdo (texto transcrito ou imagem) descreve uma ou mais atividades escolares (tarefas, provas, trabalhos, lembretes). false se for outra coisa (mensagem aleatória, foto não-escolar, conteúdo em branco, lista de matérias só, conversa sem agenda).",
    ),
  reason: z
    .string()
    .max(200)
    .nullable()
    .describe(
      "Quando isValidInput=false, motivo curto em PT-BR (ex.: 'Não identifiquei atividades escolares no áudio', 'A foto parece um print sem tarefas listadas'). Null quando isValidInput=true.",
    ),
  activities: z
    .array(
      z.object({
        title: z
          .string()
          .min(1)
          .max(MAX_ACTIVITY_TITLE_LENGTH)
          .describe(
            "Título curto e direto da atividade em pt-BR (ex.: 'Fazer páginas 32 e 33 do livro', 'Prova sobre frações', 'Trabalho em grupo de história'). Sem prefixos do tipo 'Tarefa:' — o tipo já vai no campo `type`.",
          ),
        description: z
          .string()
          .max(MAX_ACTIVITY_DESCRIPTION_LENGTH)
          .nullable()
          .describe(
            `Conteúdo detalhado da atividade (até ${MAX_ACTIVITY_DESCRIPTION_LENGTH} chars). Para atividades simples basta uma observação curta ("Não esquecer a régua", "Entregar em dupla"). Para roteiros/revisões de prova é OBRIGATÓRIO copiar a lista COMPLETA de tópicos e os enunciados de exercícios na íntegra (incluindo alíneas a/b/c) — esse campo guarda tudo que o aluno precisa pra estudar/resolver fora do PDF original. Use markdown leve (\\n entre seções, "- " como bullets, MAIÚSCULAS pros títulos). Pode condensar só comentários motivacionais ("bons estudos") e logística repetida. Null quando não houver nada além do título.`,
          ),
        type: activityTypeSchema,
        dueAt: dueAtSchema,
        subjectHint: subjectHintSchema,
        studentNameHint: studentNameHintSchema,
      }),
    )
    .max(MAX_ACTIVITIES_PER_BATCH)
    .describe(
      `Lista de atividades detectadas. Vazia quando isValidInput=false. Limite duro de ${MAX_ACTIVITIES_PER_BATCH} entradas. NÃO duplique a mesma atividade em itens diferentes.`,
    ),
});

export type ActivitiesParserOutput = z.infer<typeof activitiesParserSchema>;
export type ParsedActivity = ActivitiesParserOutput["activities"][number];
