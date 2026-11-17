// Salva o projeto aberto (Ctrl+S) e devolve a barra de status.
export default async function salvar(ctx) {
  const e = await ctx.editor();
  await e.keyboard.press("Control+s").catch(() => {});
  await ctx.delay(2500);
  return await e.locator(".statusbar").innerText();
}
