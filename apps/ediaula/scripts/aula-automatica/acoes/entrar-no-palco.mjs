// Entra no palco de gravação com a conta da equipe, na mesma sessão que o gravador guiado usa
// (partition persist:ediaula-guided-web). Só precisa uma vez por perfil, até a sessão expirar.
// Estado: aula (endereço da aula no palco), credenciais (arquivo local com o e-mail na 1ª linha e a
// senha na 2ª; padrão AULA_CREDENCIAIS_PALCO). O arquivo nunca entra no repositório.
// Sem o arquivo, a janela do palco abre na tela para a pessoa entrar à mão; a ação espera o login (até 10 min)
// e fecha a janela.
import { existsSync, readFileSync } from "node:fs";

export default async function entrarNoPalco(ctx) {
  const arq = ctx.state.credenciais ?? process.env.AULA_CREDENCIAIS_PALCO;
  if (!arq || !existsSync(arq)) return await entrarAMao(ctx);
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

/** A janela do palco na tela, na sessão do gravador guiado: a pessoa entra, e a ação espera a ponte. */
async function entrarAMao(ctx) {
  const url = `${ctx.state.aula}?parte=${ctx.state.parte ?? 1}`;
  return await ctx.app.evaluate(
    async ({ BrowserWindow }, { url }) => {
      const w = new BrowserWindow({
        show: true,
        width: 1280,
        height: 860,
        title: "Entre no palco de gravação",
        webPreferences: { partition: "persist:ediaula-guided-web" },
      });
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      // Por cima das outras janelas até o login: senão ela pode abrir escondida atrás do editor.
      w.setAlwaysOnTop(true, "floating");
      await w.loadURL(url);
      w.show();
      w.focus();
      for (let i = 0; i < 240; i++) {
        await wait(2500);
        if (w.isDestroyed()) return ["janela fechada antes do login"];
        const ponte = await w.webContents
          .executeJavaScript("!!window.__gravacao")
          .catch(() => false);
        if (ponte) {
          w.destroy();
          return ["entrou à mão"];
        }
      }
      w.destroy();
      return ["o login não aconteceu em 10 minutos"];
    },
    { url },
  );
}
