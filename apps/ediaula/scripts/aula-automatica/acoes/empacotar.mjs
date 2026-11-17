// Empacota o projeto aberto ("Empacotar para outra pessoa (com as mídias)") e devolve o caminho do .zip.
// O EdiAula escolhe o nome e a pasta (o .zip sai em "<pasta>/<curso>, <projeto>.zip"); quem chama move.
export default async function empacotar(ctx) {
  const e = await ctx.editor();
  await e.keyboard.press("Control+s").catch(() => {});
  await ctx.delay(800);
  if (ctx.state.destino) await ctx.answer("save", ctx.state.destino);
  await e.getByText("Arquivo", { exact: true }).first().click();
  await ctx.delay(500);
  await e
    .getByText(/Empacotar para outra pessoa \(com as mídias\)/)
    .first()
    .click();
  await ctx.delay(3000);
  await e.getByRole("button", { name: /^Empacotar (na pasta de envio|e salvar…)$/ }).click();
  let feito = "";
  for (let i = 0; i < 900; i++) {
    await ctx.delay(1000);
    feito = await e
      .locator(".modal, [role=dialog]")
      .first()
      .innerText()
      .catch(() => "");
    // Só o fim: a tela de antes do clique já fala em "salvar" e em "empacotar".
    if (/Aula empacotada em|não foi empacotada/i.test(feito)) break;
  }
  const zip = /Aula empacotada em (.+\.zip)/.exec(feito)?.[1] ?? null;
  const pronto = e.getByRole("button", { name: "Pronto", exact: true });
  if (await pronto.count()) await pronto.first().click();
  return { zip, mensagem: feito.slice(0, 400) };
}
