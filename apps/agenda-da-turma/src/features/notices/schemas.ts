import { z } from "zod";
import {
  ACTIVITY_TYPES,
  type ActivityType,
  activityTypeSchema,
} from "@/features/unified-activities/activity-types";

export const NOTICE_SOURCES = ["teams", "batista", "notebook", "whatsapp", "other"] as const;
/**
 * Teto do texto de um recado, em caracteres.
 *
 * Exportado porque três lugares precisam do MESMO número: o `maxLength` do
 * campo, o texto montado a partir do WhatsApp e o texto que vem de um e-mail
 * encaminhado. Os dois últimos escrevem no estado sem passar pelo teclado, e o
 * `maxLength` não os alcança — passar do teto deixava a importação impossível
 * de enviar, com uma mensagem crua do Zod e nenhum caminho além de apagar
 * milhares de caracteres na mão.
 */
export const NOTICE_TEXT_MAX = 16000;

/** Corta no teto, preservando o começo — que é onde o recado começa. */
export function clampNoticeText(text: string): string {
  return text.length > NOTICE_TEXT_MAX ? text.slice(0, NOTICE_TEXT_MAX) : text;
}

export const noticeSourceSchema = z.enum(NOTICE_SOURCES);
export const SOURCE_LABELS = {
  teams: "Microsoft Teams",
  batista: "Batista ID",
  notebook: "Agenda ou caderno",
  whatsapp: "Grupo do WhatsApp",
  other: "Outra origem",
};
/**
 * De onde veio a data, nas palavras da família. O mesmo vocabulário no
 * formulário, na revisão do recado e no detalhe: "a escola disse" é o
 * argumento de confiança da Agenda, e não pode ter três nomes.
 */
/** Sem data numa atividade que não veio de recado: não há recado para culpar. */
export const UNSPECIFIED_WITHOUT_NOTICE = "A confirmar: ainda sem data";

export const DATE_ORIGIN_LABELS = {
  unspecified: "A confirmar: o recado não deu data",
  school: "A escola disse",
  relative: "Calculada a partir do recado",
  family: "Planejado por vocês",
  schedule: "Na próxima aula, pelo horário",
};

export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const date = new Date(`${v}T12:00:00Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === v;
  }, "Data inválida");
const safeUrl = z
  .string()
  .url()
  .max(2000)
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  }, "Use um endereço https sem credenciais");

export const parseNoticeSchema = z
  .object({
    profileId: z.string().uuid(),
    source: noticeSourceSchema,
    sourceUrl: safeUrl.nullable().default(null),
    publishedAt: dateSchema.nullable().default(null),
    text: z.string().trim().max(NOTICE_TEXT_MAX).default(""),
    attachment: z
      .object({
        name: z.string().trim().min(1).max(180),
        dataUrl: z
          .string()
          .max(7_100_000)
          .regex(/^data:(image\/(png|jpeg|webp)|application\/pdf);base64,[A-Za-z0-9+/]+={0,2}$/),
        pages: z.array(z.number().int().min(1).max(500)).min(1).max(3).optional(),
      })
      .nullable()
      .default(null),
  })
  .refine((v) => v.text.length > 0 || v.attachment, "Cole um recado ou escolha um anexo");

export const extractedActionSchema = z.object({
  type: activityTypeSchema,
  title: z.string().trim().min(1).max(180),
  description: z.string().max(3000).nullable(),
  dueAt: dateSchema.nullable(),
  dateOrigin: z.enum(["unspecified", "school", "relative"]),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
  location: z.string().max(300).nullable(),
  sourceExcerpt: z.string().max(1500).nullable(),
  // Nome da matéria como a leitura a reconheceu — de preferência copiado da
  // lista cadastrada da criança, que vai no contexto. É PISTA para a revisão:
  // o vínculo real continua sendo subjectId/profileSubjectId, escolhido no
  // formulário, e este campo nunca chega ao banco. Rascunhos anteriores não o
  // têm, por isso é opcional na leitura e obrigatório (nullable) na geração.
  // `.nullable().optional()` nesta ordem: `.required()` só desembrulha o
  // ZodOptional quando ele é a camada de fora.
  subjectHint: z.string().trim().max(80).nullable().optional(),
});
export type ExtractedAction = z.infer<typeof extractedActionSchema>;
export const noticeExtractionSchema = z.object({
  actions: z.array(extractedActionSchema).max(30),
  warnings: z.array(z.string().max(400)).max(10),
  publicationReference: z
    .object({
      date: dateSchema,
      sourceExcerpt: z.string().trim().min(1).max(1500),
    })
    .nullable()
    .optional(),
});
export type NoticeExtraction = z.infer<typeof noticeExtractionSchema>;
// Older stored drafts may lack this field; structured generation requires
// every property to be present, using null when no publication is known.
// O OpenRouter manda `json_schema.strict: true`, então toda propriedade precisa
// estar em `required` (nullable serve; optional não). `.required()` é raso: o
// item do array recebe o mesmo tratamento.
/**
 * Os tipos que a LEITURA pode produzir: todos, menos `study`.
 *
 * Sessão de estudo é planejamento da família — `features/study-plan` reparte as
 * sessões pelos dias livres e as liga à prova por `studyForTaskId`. Uma sessão
 * saída da leitura não teria prova nenhuma atrás dela, e a regra "a IA não
 * inventa sessão de estudo" viraria letra morta.
 *
 * O estreitamento vale só na GERAÇÃO. `extractedActionSchema` continua aceitando
 * os oito, porque é ele que lê rascunhos guardados e alimenta o formulário — e
 * o formulário precisa conseguir editar uma sessão de estudo que já existe.
 */
const EXTRACTABLE_BY_AI: Record<ActivityType, boolean> = {
  task: true,
  exam: true,
  project: true,
  reminder: true,
  material: true,
  authorization: true,
  event: true,
  // Planejamento da família, nunca leitura de recado.
  study: false,
};

/**
 * O `Record` acima é o guarda: um tipo novo em `ACTIVITY_TYPES` quebra o
 * typecheck até alguém decidir se a leitura pode produzi-lo. Foi assim que
 * `study` entrou sem ninguém notar — ele nasceu no vocabulário compartilhado e
 * a leitura o herdou de graça.
 */
export const NOTICE_EXTRACTION_TYPES = ACTIVITY_TYPES.filter((type) => EXTRACTABLE_BY_AI[type]) as [
  ActivityType,
  ...ActivityType[],
];

export const noticeGenerationSchema = noticeExtractionSchema
  .required({ publicationReference: true })
  .extend({
    actions: z
      .array(
        extractedActionSchema
          .required({ subjectHint: true })
          .extend({ type: z.enum(NOTICE_EXTRACTION_TYPES) }),
      )
      .max(30),
  });

// `parsed_result` guarda a leitura com um `id` por ação, atribuído ao
// persistir. Linhas anteriores a isso não o têm, por isso ele é opcional na
// leitura: `ensureStoredActionIds` preenche o que falta ao retomar.
export const draftActionSchema = extractedActionSchema.extend({
  id: z.string().uuid().optional(),
});
export const draftExtractionSchema = noticeExtractionSchema.extend({
  actions: z.array(draftActionSchema).max(30),
});
export type DraftExtraction = z.infer<typeof draftExtractionSchema>;
// Descartar uma ação do rascunho MARCA, nunca remove: reimportar o mesmo
// conteúdo recupera a leitura já paga, inteira, sem nova cobrança.
export const storedActionSchema = draftActionSchema.extend({
  discardedAt: z.string().datetime({ offset: true }).nullable().optional(),
});
export const storedExtractionSchema = noticeExtractionSchema.extend({
  actions: z.array(storedActionSchema).max(30),
});
export type StoredExtraction = z.infer<typeof storedExtractionSchema>;
export const discardDraftActionSchema = z.object({
  noticeId: z.string().uuid(),
  actionId: z.string().uuid(),
});
export const discardNoticeSchema = z.object({ noticeId: z.string().uuid() });

export const actionFieldsSchema = extractedActionSchema
  // A pista de matéria fica no rascunho da tela; o que se grava é o vínculo.
  .omit({ subjectHint: true })
  .extend({
    profileId: z.string().uuid(),
    // "schedule" só é atribuído pelo cálculo determinístico da próxima aula,
    // no formulário. `extractedActionSchema` (saída da IA) segue sem ele.
    dateOrigin: z.enum(["unspecified", "school", "relative", "family", "schedule"]),
    // Matéria da providência, escolhida pela pessoa na revisão. No máximo uma
    // das duas: da turma da criança OU extracurricular dela. O serviço
    // revalida a pertinência — o formulário só sugere as opções.
    subjectId: z.string().uuid().nullable().default(null),
    profileSubjectId: z.string().uuid().nullable().default(null),
    /**
     * Duração estimada, em minutos. A pessoa escolhe; a IA nunca preenche.
     *
     * Mesma regra do prazo: calcular a próxima aula a partir do horário
     * cadastrado é determinístico, adivinhar quanto tempo uma criança leva num
     * trabalho não é. O teto de 8 horas é sanidade, não regra de produto.
     */
    estimatedMinutes: z.number().int().min(1).max(480).nullable().default(null),
    assignedToUserId: z.string().max(128).nullable().default(null),
    reminderAt: z.string().datetime({ offset: true }).nullable().default(null),
    recurrence: z.enum(["none", "weekly"]).default("none"),
    // Publicar na turma é uma escolha da atividade, não um formulário à parte.
    // Só faz sentido com matéria da turma e prazo: é isso que as outras
    // famílias recebem.
    shareWithTurma: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (v.subjectId && v.profileSubjectId)
      ctx.addIssue({
        code: "custom",
        path: ["subjectId"],
        message: "Escolha uma matéria da turma ou uma extracurricular, não as duas",
      });
    if ((v.dueAt === null) !== (v.dateOrigin === "unspecified"))
      ctx.addIssue({
        code: "custom",
        path: ["dateOrigin"],
        message: "Informe a origem do prazo ou deixe a data vazia",
      });
    if (!v.dueAt && (v.time || v.reminderAt || v.recurrence !== "none"))
      ctx.addIssue({
        code: "custom",
        path: ["dueAt"],
        message: "Defina uma data para usar horário, lembrete ou repetição",
      });
    if (v.shareWithTurma && (!v.subjectId || !v.dueAt))
      ctx.addIssue({
        code: "custom",
        path: ["shareWithTurma"],
        message: "Para compartilhar com a turma, escolha a matéria da turma e a data",
      });
  });
export type NoticeActionInput = z.infer<typeof actionFieldsSchema>;
export const confirmNoticeSchema = z.object({
  noticeId: z.string().uuid().nullable(),
  actions: z.array(actionFieldsSchema).min(1).max(30),
  allowDuplicates: z.boolean().default(false),
  sourceProfileIds: z.array(z.string().uuid()).min(1).max(10).nullable().optional(),
  resolutions: z
    .array(
      z.discriminatedUnion("kind", [
        z.object({ index: z.number().int().min(0).max(29), kind: z.literal("separate") }),
        z.object({
          index: z.number().int().min(0).max(29),
          kind: z.literal("replace"),
          actionId: z.string().uuid(),
          version: z.number().int().positive(),
        }),
      ]),
    )
    .max(30)
    .optional(),
});
export const updateNoticeActionSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  action: actionFieldsSchema,
});
export const statusNoticeActionSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  status: z.enum(["pending", "done", "canceled"]),
});
