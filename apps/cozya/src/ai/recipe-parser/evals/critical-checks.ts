import type { RecipeParserOutput } from "../schema";
import type { DatasetExpected } from "./dataset";
export function criticalIssues(output: RecipeParserOutput, expected: DatasetExpected): string[] {
  const issues: string[] = [];
  if (
    expected.allowSafeRefusal &&
    !output.isValidRecipe &&
    output.reason?.trim() &&
    !output.ingredients &&
    !output.preparation
  )
    return issues;
  const normalize = (text: string) =>
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  if (output.isValidRecipe !== expected.isValidRecipe) issues.push("validity");
  if (expected.isValidRecipe === false) {
    if (output.ingredients || output.preparation) issues.push("refusal-with-recipe-content");
    return issues;
  }
  if (!output.name || !output.ingredients || !output.preparation) issues.push("required-content");
  for (const ingredient of expected.mustContainIngredients ?? [])
    if (!normalize(output.ingredients ?? "").includes(normalize(ingredient)))
      issues.push(`ingredient:${ingredient}`);
  for (const step of expected.mustMentionInPreparation ?? [])
    if (!normalize(output.preparation ?? "").includes(normalize(step))) issues.push(`step:${step}`);
  for (const pattern of expected.ingredientPatterns ?? [])
    if (!new RegExp(pattern, "imu").test(normalize(output.ingredients ?? "")))
      issues.push(`quantity-unit:${pattern}`);
  for (const forbidden of expected.forbiddenIngredients ?? [])
    if (normalize(output.ingredients ?? "").includes(normalize(forbidden)))
      issues.push(`unexpected-ingredient:${forbidden}`);
  if (expected.servings !== undefined && (output.servings ?? null) !== expected.servings)
    issues.push("servings");
  if (
    expected.totalMinutes !== undefined &&
    (output.totalMinutes ?? null) !== expected.totalMinutes
  )
    issues.push("total-minutes");
  return issues;
}
