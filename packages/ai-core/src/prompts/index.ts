export type PromptTemplate = {
  name: string;
  template: string;
};

export function renderPrompt(template: PromptTemplate, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (acc, [key, value]) => acc.replaceAll(`{{${key}}}`, value),
    template.template,
  );
}
