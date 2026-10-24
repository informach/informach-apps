import "server-only";
import { z } from "zod";
import { type ContentState, lessonAvailability } from "@/features/content/availability";
import { courses, findCourse, findLesson, skillNames } from "@/features/content/catalog";
import { algebraTools } from "./algebra";
import { algebraConceptLinks } from "./algebra/concept-links";
import curriculum from "./curriculum.json";
import { elementaryTools } from "./elementary";
import { elementaryConceptLinks } from "./elementary/concept-links";
import { reasoningTools } from "./reasoning";
import { reasoningConceptLinks } from "./reasoning/concept-links";
import { type ToolFamilyId, toolFamilySchema } from "./types";

const referenceSchema = z.string().regex(/^L\d{2}\.[a-z0-9-]+$/);
const curriculumSchema = z.object({
  version: z.literal(1),
  // Partial, as zod 3 read it: a record keyed by an enum is exhaustive in zod 4.
  tools: z.partialRecord(toolFamilySchema, z.string()),
  lessons: z.array(
    z.object({
      lessonId: z.string(),
      skillId: z.string(),
      modes: z.array(referenceSchema).nonempty(),
      items: z.array(
        z.object({
          id: z.string(),
          familyId: z.string(),
          modes: z.array(referenceSchema).nonempty(),
        }),
      ),
    }),
  ),
});
const conceptLinks = new Map<string, string[]>();
for (const links of [elementaryConceptLinks, algebraConceptLinks, reasoningConceptLinks])
  for (const [family, references] of Object.entries(links))
    conceptLinks.set(family, [...new Set([...(conceptLinks.get(family) ?? []), ...references])]);
const baseCurriculum = curriculumSchema.parse(curriculum);
export const labCurriculum = {
  ...baseCurriculum,
  lessons: baseCurriculum.lessons.map((row) => {
    const items = row.items.map((item) => ({
      ...item,
      modes: conceptLinks.get(item.familyId) ?? item.modes,
    }));
    return {
      ...row,
      items,
      modes: [...new Set([...row.modes, ...items.flatMap((item) => item.modes)])],
    };
  }),
};
const tools = new Map(
  [...elementaryTools, ...algebraTools, ...reasoningTools].map((tool) => [tool.family, tool]),
);
export type LabExperience = {
  id: string;
  version: 1;
  lessonId: string;
  skillId: string;
  skill: string;
  title: string;
  activityTitle: string;
  objective: string;
  family: ToolFamilyId;
  toolName: string;
  mode: string;
  recovery: boolean;
  itemIds: string[];
  familyIds: string[];
};
export const labExperiences: LabExperience[] = labCurriculum.lessons.flatMap((row) => {
  const lesson = findLesson(row.lessonId);
  if (!lesson || lesson.skillId !== row.skillId || lesson.skillId === "mixed")
    throw new Error(`Invalid laboratory lesson: ${row.lessonId}`);
  return row.modes.map((reference) => {
    const [familyValue, mode] = reference.split(".");
    const family = toolFamilySchema.parse(familyValue);
    if (!mode) throw new Error(`Invalid laboratory mode: ${reference}`);
    const tool = tools.get(family);
    if (!tool?.modes.includes(mode)) throw new Error(`Missing laboratory mode: ${reference}`);
    const grade = Math.min(
      ...courses
        .filter((course) =>
          lesson.kind === "recovery"
            ? course.skills.includes(lesson.skillId)
            : course.path.includes(lesson.id),
        )
        .flatMap((course) => course.grades),
    );
    const matching = row.items.filter((item) => item.modes.includes(reference));
    return {
      id: `${lesson.id}~${reference}`,
      version: 1,
      lessonId: lesson.id,
      skillId: lesson.skillId,
      skill: skillNames[lesson.skillId] ?? lesson.skillId,
      title: lesson.title,
      activityTitle: tool.activity({ family, mode, grade, variant: 0 }).title,
      objective: lesson.objective,
      family,
      toolName: labCurriculum.tools[family] ?? family,
      mode,
      recovery: lesson.kind === "recovery",
      itemIds: matching.map((item) => item.id),
      familyIds: [...new Set(matching.map((item) => item.familyId))],
    };
  });
});
const experiencesById = new Map(labExperiences.map((experience) => [experience.id, experience]));
export const findExperience = (id: string) => experiencesById.get(id);
export function eligibleExperiences(input: {
  grade: number;
  courseId: string;
  paid: boolean;
  profileAllowed: boolean;
  contentStates?: Map<string, ContentState>;
}) {
  const course = findCourse(input.courseId);
  // Laboratory does not expose tools outside the child's exact published grade.
  if (!course?.grades.includes(input.grade)) return [];
  return labExperiences.filter((experience) => {
    const lesson = findLesson(experience.lessonId);
    return (
      lesson &&
      lessonAvailability({
        lesson,
        course,
        grade: input.grade,
        paid: input.paid,
        profileAllowed: input.profileAllowed,
        state: input.contentStates?.get(lesson.id),
      }).available
    );
  });
}
export function experiencesForItem(lessonId: string, itemId: string) {
  return labExperiences.filter(
    (experience) => experience.lessonId === lessonId && experience.itemIds.includes(itemId),
  );
}
