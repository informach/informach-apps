// Entra na plataforma com uma conta de ensaio, na sessão do gravador guiado (a mesma janela da aula),
// para gravar telas da própria plataforma, como a área dos pais.
// Estado: plataforma = { url, contas (arquivo JSON com { <chave>: { email, password } }), conta }.
// A senha fica só no arquivo local de contas; nada dela volta no resultado.
import { readFileSync } from "node:fs";

export default async function entrarNaPlataforma(ctx) {
  const p = ctx.state.plataforma;
  if (!p?.url || !p.contas || !p.conta)
    throw new Error("falta plataforma {url, contas, conta} no estado");
  const conta = JSON.parse(readFileSync(p.contas, "utf8"))[p.conta];
  if (!conta?.email || !conta.password)
    throw new Error(`conta "${p.conta}" sem e-mail ou senha em ${p.contas}`);
  return await ctx.app.evaluate(
    async ({ BrowserWindow }, { url, email, password }) => {
      const w = new BrowserWindow({
        show: false,
        width: 1280,
        height: 860,
        webPreferences: { partition: "persist:ediaula-guided-web", offscreen: true },
      });
      try {
        await w.loadURL(`${url}/login`);
        const status = await w.webContents.executeJavaScript(
          `fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: ${JSON.stringify(
            JSON.stringify({ email, password }),
          )} }).then((r) => r.status)`,
        );
        if (status !== 200) return { entrou: false, status };
        await w.loadURL(`${url}/pais`);
        await new Promise((r) => setTimeout(r, 2500));
        const caminho = await w.webContents.executeJavaScript("location.pathname");
        return { entrou: caminho.startsWith("/pais"), caminho };
      } finally {
        w.destroy();
      }
    },
    { url: p.url, email: conta.email, password: conta.password },
  );
}
