// Abre um projeto do EdiAula. ctx.state.arquivo = caminho do .ediaula (abre por "Abrir projeto…", porque
// o EdiAula só lê arquivos escolhidos na janela de abrir); sem arquivo, abre o último ("Abrir no editor").
// Responde sozinho às perguntas "Gravações que não entraram" (decidir depois) e "Arquivos vinculados".
export default async function abrirProjeto(ctx) {
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
  await ctx.answer("message", 0);
  if (ctx.state.arquivo) {
    await ctx.answer("open", [ctx.state.arquivo]);
    await e.getByText("Abrir projeto…", { exact: true }).first().click();
  } else {
    await e.getByRole("button", { name: "Abrir no editor" }).click();
  }
  // A resposta que sobrar na fila (o projeto não perguntou) não pode responder outra pergunta depois.
  const limpar = () =>
    ctx.app.evaluate(() => {
      const q = globalThis.__prova.queue;
      for (let i = q.length - 1; i >= 0; i--) if (q[i].kind === "message") q.splice(i, 1);
    });
  for (let i = 0; i < 40; i++) {
    await ctx.delay(1000);
    if (await e.locator(".statusbar").count()) {
      await limpar();
      const status = await e.locator(".statusbar").innerText();
      return status.split("\n").find((l) => l.startsWith("Duração")) ?? status;
    }
  }
  await limpar();
  throw new Error(
    "o projeto não abriu (veja o registro do condutor: um projeto inválido aparece lá)",
  );
}
