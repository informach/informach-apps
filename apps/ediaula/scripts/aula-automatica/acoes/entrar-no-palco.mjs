// Entra no palco de gravação com a conta da equipe, na mesma sessão que o gravador guiado usa
// (partition persist:ediaula-guided-web). Só precisa uma vez por perfil, até a sessão expirar.
// Estado: aula (endereço da aula no palco), credenciais (arquivo local com o e-mail na 1ª linha e a
// senha na 2ª; padrão AULA_CREDENCIAIS_PALCO). O arquivo nunca entra no repositório.
import { readFileSync } from "node:fs";

export default async function entrarNoPalco(ctx) {
  const arq = ctx.state.credenciais ?? process.env.AULA_CREDENCIAIS_PALCO;
  if (!arq)
    throw new Error("diga onde estão as credenciais: estado credenciais ou AULA_CREDENCIAIS_PALCO");
  const [email, senha] = readFileSync(arq, "utf8")
    .split(/\r?\n/)
    .map((s) => s.trim());
  const url = `${ctx.state.aula}?parte=${ctx.state.parte ?? 1}`;
  return await ctx.app.evaluate(
    async ({ BrowserWindow }, { url, email, senha }) => {
      const w = new BrowserWindow({
        show: false,
        width: 1920,
        height: 1080,
        webPreferences: { partition: "persist:ediaula-guided-web", offscreen: true },
      });
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      await w.loadURL(url);
      await wait(8000);
      const js = `(() => {
        const set = (el, v) => { const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value"); d.set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); };
        if (window.__gravacao) return "já entrou";
        const e = document.querySelector('input[type=email], input[name=email], input[autocomplete=email], input[autocomplete=username]');
        const s = document.querySelector('input[type=password]');
        if (!e || !s) return "sem campos";
        set(e, ${JSON.stringify(email)}); set(s, ${JSON.stringify(senha)});
        const b = [...document.querySelectorAll("button")].find(x => /^Entrar$/.test(x.innerText.trim()));
        b.click(); return "enviado";
      })()`;
      const out = [await w.webContents.executeJavaScript(js)];
      for (let i = 0; i < 16 && out[0] !== "já entrou"; i++) {
        await wait(2500);
        const s = await w.webContents
          .executeJavaScript("({ url: location.pathname, ponte: !!window.__gravacao })")
          .catch((e) => String(e));
        if (s.ponte || i === 15) {
          out.push(s);
          break;
        }
      }
      w.destroy();
      return out;
    },
    { url, email, senha },
  );
}
