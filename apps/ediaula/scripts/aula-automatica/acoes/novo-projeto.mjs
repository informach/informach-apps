// Cria um projeto vazio. ctx.state.nome = nome da aula; ctx.state.curso = curso do EdiAula.
export default async function novoProjeto(ctx) {
  const e = await ctx.editor();
  const depois = e.getByRole("button", { name: "Decidir depois" });
  if (await depois.count()) {
    await depois.click();
    await ctx.delay(800);
  }
  if (await e.locator(".statusbar").count()) {
    await e.locator("button.logo").first().click();
    await ctx.delay(2500);
  }
  await e.getByRole("button", { name: "Novo projeto" }).first().click();
  const m = e.getByRole("dialog", { name: "Novo projeto" });
  await m.waitFor();
  await m.getByLabel("Nome da aula").fill(ctx.state.nome);
  await m.getByLabel("Curso (opcional)").fill(ctx.state.curso ?? "");
  await m.getByRole("button", { name: "Criar projeto" }).click();
  await m.waitFor({ state: "detached", timeout: 30000 });
  await ctx.delay(2500);
  return await e.title();
}
