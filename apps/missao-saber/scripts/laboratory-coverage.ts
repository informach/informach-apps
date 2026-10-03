import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { courses } from "../src/features/content/catalog";
import { algebraTools } from "../src/features/labs/runtime/algebra";
import {
  eligibleExperiences,
  labCurriculum,
  labExperiences,
} from "../src/features/labs/runtime/catalog";
import { elementaryTools } from "../src/features/labs/runtime/elementary";
import { reasoningTools } from "../src/features/labs/runtime/reasoning";

const destination = resolve(
  import.meta.dirname,
  "../../../docs/propostas/missao-saber-laboratorio-2026-10-03",
);
const tools = [...elementaryTools, ...algebraTools, ...reasoningTools];
const items = labCurriculum.lessons.flatMap((lesson) => lesson.items);
const rows = labCurriculum.lessons.flatMap((lesson) =>
  lesson.items.map((item) => ({
    lesson: lesson.lessonId,
    skill: lesson.skillId,
    item: item.id,
    family: item.familyId,
    modes: item.modes.join(" + "),
  })),
);
const keys = ["lesson", "skill", "item", "family", "modes"] as const;
const csv = `${[keys, ...rows.map((row) => keys.map((key) => row[key]))]
  .map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(","))
  .join("\n")}\n`;
const report = {
  generatedAt: new Date().toISOString(),
  families: tools.length,
  modes: tools.reduce((sum, tool) => sum + tool.modes.length, 0),
  experiences: labExperiences.length,
  lessons: labCurriculum.lessons.length,
  skills: new Set(labCurriculum.lessons.map((lesson) => lesson.skillId)).size,
  items: items.length,
  teachingFamilies: new Set(items.map((item) => item.familyId)).size,
  tools: tools.map((tool) => ({
    family: tool.family,
    name: labCurriculum.tools[tool.family],
    modes: tool.modes.length,
  })),
  courses: courses.map((course) => ({
    id: course.id,
    grades: course.grades,
    eligible: course.grades.map((grade) => ({
      grade,
      experiences: eligibleExperiences({
        grade,
        courseId: course.id,
        paid: true,
        profileAllowed: true,
      }).length,
    })),
  })),
};
writeFileSync(resolve(destination, "cobertura-implementada.csv"), csv);
writeFileSync(
  resolve(destination, "cobertura-implementada.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(
  JSON.stringify({
    families: report.families,
    modes: report.modes,
    experiences: report.experiences,
    items: report.items,
  }),
);
