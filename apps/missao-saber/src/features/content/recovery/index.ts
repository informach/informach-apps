import { type ObjectiveSpec, objectiveItem } from "../skill-factory";
import { type Lesson, lessonSchema } from "../types";
import { advancedRecovery } from "./advanced";
import { earlyRecovery } from "./early";
import { financialRecovery } from "./financial";
import { legacyRecovery } from "./legacy";
import { middleRecovery } from "./middle";

export const recoveryBank = {
  ...legacyRecovery,
  ...earlyRecovery,
  ...middleRecovery,
  ...advancedRecovery,
  ...financialRecovery,
};

export function buildRecoveryLessons(names: Record<string, string>, regular: Lesson[]): Lesson[] {
  if (
    Object.keys(names).some((skill) => !recoveryBank[skill]) ||
    Object.keys(recoveryBank).some((skill) => !names[skill])
  )
    throw new Error("Recovery skill coverage differs from curriculum");
  return Object.entries(recoveryBank).flatMap(([skillId, strategies]) =>
    [0, 1].map((encounter) => {
      const id = `${skillId}-recuperacao-${encounter + 1}`;
      return lessonSchema.parse({
        id,
        version: 1,
        skillId,
        title: `${names[skillId]}: novo encontro ${encounter + 1}`,
        kind: "recovery",
        stage: "practice",
        lab: null,
        free: regular.some((lesson) => lesson.skillId === skillId && lesson.free),
        prerequisites: [],
        estimatedMinutes: 6,
        objective:
          "Aplicar três estratégias em situações novas e observar o que já consegue resolver sem pistas.",
        introduction:
          encounter === 0
            ? "São três questões novas. Experimente antes de pedir uma pista; se precisar, ela está aqui para ajudar. O segundo encontro abre em outro dia, depois de você responder às três questões deste encontro."
            : "Em outro dia, reencontre as três estratégias em situações diferentes. Repetir uma questão ajuda a estudar; a autonomia usa a primeira tentativa em questões novas.",
        items: strategies.map(([family, hint, method, first, later], index) => {
          const question = encounter === 0 ? first : later;
          const [prompt, answer, explanation, wrong] = question;
          const hints: [string, string, string] = [
            typeof hint === "string" ? hint : encounter === 0 ? hint[0] : hint[1],
            typeof method === "string" ? method : encounter === 0 ? method[0] : method[1],
            explanation,
          ];
          const common = {
            family,
            prompt,
            explanation,
            hints,
          };
          let spec: ObjectiveSpec;
          if (typeof answer === "number") spec = { ...common, kind: "numeric", value: answer };
          else {
            if (!wrong) throw new Error(`Missing recovery distractors: ${id}-${index + 1}`);
            spec = {
              ...common,
              kind: "choice",
              answer,
              wrong,
              feedback: [
                "Esta alternativa não corresponde às condições da pergunta.",
                "Confira esta alternativa usando a relação pedida.",
              ],
            };
          }
          const item = objectiveItem(skillId, id, index, spec);
          return {
            ...item,
            familyId: `${skillId}:${family}`,
            purpose: "independent-practice",
            domain:
              regular.find((lesson) => lesson.skillId === skillId)?.items[0]?.domain ?? "common",
          };
        }),
      });
    }),
  );
}
