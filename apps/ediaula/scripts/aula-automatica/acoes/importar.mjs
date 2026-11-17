// Importa mídias para a biblioteca do projeto aberto pelo botão Importar (o import_media das ferramentas
// recusa arquivo que não foi escolhido na janela de abrir). ctx.state.arquivos = [caminhos absolutos].
// Devolve a lista da biblioteca; use add_clip (comando.sh ia) para pôr cada uma na linha do tempo.
import { chamar } from "./ia.mjs";

export default async function importar(ctx) {
  const e = await ctx.editor();
  await ctx.answer("open", ctx.state.arquivos);
  await e.getByRole("button", { name: "Importar" }).first().click();
  await ctx.delay(4000 + 1500 * ctx.state.arquivos.length);
  return (await chamar(ctx, "list_library", {})).text;
}
