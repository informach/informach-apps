// Foto da janela principal pelo Electron (o screenshot do Playwright trava com a janela atrás de outras
// ou com o gravador aberto). ctx.state.foto = nome do arquivo (sem extensão).
import { writeFileSync } from "node:fs";

export default async function foto(ctx) {
  const nome = ctx.state.foto ?? "janela";
  const b64 = await ctx.app.evaluate(async ({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find(
      (x) => x.webContents.getURL().startsWith("file:") && !x.webContents.getURL().includes("#rec"),
    );
    const img = await w.webContents.capturePage();
    return img.toJPEG(80).toString("base64");
  });
  const f = `${ctx.shots}/${nome}.jpg`;
  writeFileSync(f, Buffer.from(b64, "base64"));
  return f;
}
