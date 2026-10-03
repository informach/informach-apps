import {
  catalogGrades,
  courseLine,
  skillNames,
  suggestedCourses,
} from "@/features/content/catalog";
import { gradeOptions } from "./school-year";

export const familyCourseChoices = suggestedCourses.map((course) => ({
  id: course.id,
  label: course.label,
  grades: course.grades,
  line: courseLine(course),
  description: `Trabalha ${course.skills
    .slice(0, 3)
    .map((skill) => skillNames[skill] ?? skill)
    .join(", ")
    .toLocaleLowerCase("pt-BR")}.`,
}));
export const familyGradeChoices = gradeOptions(catalogGrades);
