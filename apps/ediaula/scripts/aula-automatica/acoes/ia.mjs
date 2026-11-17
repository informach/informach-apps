// Chama uma ferramenta do EdiAula (as mesmas do assistente e do MCP): ctx.state.ia = { name, input }.
// Devolve { ok, text, images? }. As imagens (get_frame) voltam em base64; use quadro.mjs para salvar.
export async function chamar(ctx, name, input) {
  return await ctx.app.evaluate(
    async ({ ipcMain, BrowserWindow }, { name, input }) => {
      if (!globalThis.__ia) globalThis.__ia = { results: new Map() };
      const g = globalThis.__ia;
      const handlers = ipcMain._invokeHandlers;
      if (!g.wrapped && handlers?.get) {
        const orig = handlers.get("ai:result");
        handlers.set("ai:result", async (e, id, result) => {
          if (g.results.has(id)) {
            g.results.set(id, result);
            return;
          }
          return orig(e, id, result);
        });
        g.wrapped = true;
      }
      const win = BrowserWindow.getAllWindows().find(
        (w) =>
          w.webContents.getURL().startsWith("file:") &&
          !w.webContents.getURL().includes("#recorder"),
      );
      const id = crypto.randomUUID();
      g.results.set(id, null);
      win.webContents.send("ai:call", { id, name, input, source: "mcp", client: "condutor" });
      for (let i = 0; i < 1200 && !g.results.get(id); i++)
        await new Promise((r) => setTimeout(r, 250));
      const r = g.results.get(id);
      g.results.delete(id);
      return r ?? { ok: false, text: "sem resposta" };
    },
    { name, input },
  );
}

export default async function ia(ctx) {
  const { name, input } = ctx.state.ia;
  const r = await chamar(ctx, name, input);
  return { ok: r.ok, text: String(r.text ?? "").slice(0, 20000) };
}
