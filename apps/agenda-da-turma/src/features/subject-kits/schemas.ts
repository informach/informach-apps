import { z } from "zod";

/** Uma lista curta, de itens curtos: é uma mochila, não um inventário. */
export const MAX_KIT_ITEMS = 10;
export const MAX_KIT_ITEM_LENGTH = 40;

export const saveSubjectKitSchema = z
  .object({
    profileId: z.string().uuid(),
    subjectId: z.string().uuid().nullable().default(null),
    profileSubjectId: z.string().uuid().nullable().default(null),
    items: z.array(z.string().trim().max(MAX_KIT_ITEM_LENGTH)).max(MAX_KIT_ITEMS),
  })
  .refine((v) => Boolean(v.subjectId) !== Boolean(v.profileSubjectId), {
    message: "Escolha uma matéria da turma ou uma extracurricular, não as duas",
    path: ["subjectId"],
  });
