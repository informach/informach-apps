import { z } from "zod";
import { MAX_SUBJECT_NAME_LENGTH, MAX_TEACHER_NAME_LENGTH } from "@/features/subjects/limits";

/**
 * Schema da saída estruturada do `subjectsParser` (texto) e
 * `subjectsParserVision` (foto). Usado em `agent.generate(..., {
 * structuredOutput: { schema: subjectsParserSchema, errorStrategy: "strict" } })`.
 *
 * Limites batem com os do domínio (`features/subjects/limits.ts`) — assim
 * uma matéria sugerida pela IA cabe direto no `createSubjectsBatchAction`
 * sem validação extra do lado servidor.
 *
 * `MAX_SUBJECTS_PER_BATCH` é um cap duro de segurança contra payload absurdo
 * (ex.: foto com lista enorme ou alucinação do modelo). 40 cobre folgado o
 * caso real de um horário escolar (~10-12 matérias por turma).
 */
export const MAX_SUBJECTS_PER_BATCH = 40;

export const subjectsParserSchema = z.object({
  isValidInput: z
    .boolean()
    .describe(
      "true se o conteúdo (texto transcrito ou imagem) contém uma lista identificável de matérias escolares. false se for outra coisa (mensagem aleatória, imagem não-escolar, conteúdo em branco).",
    ),
  reason: z
    .string()
    .max(200)
    .nullable()
    .describe(
      "Quando isValidInput=false, motivo curto em PT-BR explicando o que faltou (ex.: 'Não identifiquei matérias escolares no áudio', 'A foto não mostra uma lista de matérias'). Null quando isValidInput=true.",
    ),
  subjects: z
    .array(
      z.object({
        name: z
          .string()
          .min(1)
          .max(MAX_SUBJECT_NAME_LENGTH)
          .describe(
            "Nome da matéria em pt-BR com capitalização correta (ex.: 'Matemática', 'Língua Portuguesa', 'Educação Física'). NÃO incluir o nome do professor aqui.",
          ),
        teacherName: z
          .string()
          .min(1)
          .max(MAX_TEACHER_NAME_LENGTH)
          .nullable()
          .describe(
            "Nome do professor(a) APENAS quando explicitamente associado à matéria pelo usuário ou pela imagem. Não inventar. Sem prefixos 'Prof.'/'Profa.'. Null quando não houver.",
          ),
        classDays: z
          .array(z.enum(["mon", "tue", "wed", "thu", "fri"]))
          .max(5)
          .describe(
            "Dias da semana em que a matéria tem aula (Seg-Sex). Use ['mon','tue','wed','thu','fri'] como enum. **SEMPRE retornar um array** — vazio (`[]`) quando o conteúdo NÃO informar horário. Quando o usuário enumerar dias por voz ('segunda, terça, quinta, sexta') ou a imagem mostrar uma grade de horário com colunas de dias, mapear cada matéria pros dias correspondentes. Sábado/domingo são ignorados nesta versão — se aparecer, simplesmente não incluir. Não inventar dias quando a fonte não disser.",
          ),
      }),
    )
    .max(MAX_SUBJECTS_PER_BATCH)
    .describe(
      `Lista de matérias detectadas. Vazio quando isValidInput=false. Limite duro de ${MAX_SUBJECTS_PER_BATCH} entradas para evitar payload absurdo.`,
    ),
});

export type SubjectsParserOutput = z.infer<typeof subjectsParserSchema>;
export type ParsedSubject = SubjectsParserOutput["subjects"][number];
