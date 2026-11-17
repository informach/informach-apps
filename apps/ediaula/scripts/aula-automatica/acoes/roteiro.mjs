// Põe o roteiro (ctx.state.roteiro = caminho do .roteiro.md) no projeto aberto, trocando o anterior.
import { readFileSync } from "node:fs";

export default async function roteiro(ctx) {
  const text = readFileSync(ctx.state.roteiro, "utf8");
  const e = await ctx.editor();
  await e.getByRole("button", { name: "Roteiro", exact: true }).first().click();
  await ctx.delay(600);
  const tirar = e.getByRole("button", { name: "Tirar roteiro" });
  if (await tirar.count()) {
    e.once("dialog", (d) => void d.accept().catch(() => {}));
    await tirar.first().click();
    await ctx.delay(1000);
  }
  const ta = e.locator("textarea.script-paste");
  await ta.waitFor();
  await ta.fill(text);
  await e.getByRole("button", { name: "Usar roteiro" }).click();
  await ctx.delay(1500);
  return text.length;
}
