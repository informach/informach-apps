// Registra, em cada página do palco aberta pelo gravador (ensaio e gravação), o contorno de cada alvo que a
// ponte devolve: é dele que a edição tira zoom e destaque. O bloco que cai num arrasto é medido quando o
// próximo gesto é pedido (o arrasto já acabou).
// ctx.state.caixasEtapa = "ligar" (fica vigiando até ctx.state.caixasMin minutos; rode em paralelo à
// gravação) ou "ler" (devolve {página: registros}; a última página é a da gravação).
export default async function sondaCaixas(ctx) {
  const etapa = ctx.state.caixasEtapa;
  const minutos = ctx.state.caixasMin ?? 25;
  return await ctx.app.evaluate(
    async ({ webContents }, { etapa, minutos }) => {
      if (!globalThis.__caixas2) globalThis.__caixas2 = { paginas: {} };
      const g = globalThis.__caixas2;
      if (etapa === "ler") return JSON.stringify(g.paginas);
      const wrap = `(() => {
        if (window.__caixasOn) return "ja";
        const gr = window.__gravacao; if (!gr || !gr.agir) return "sem ponte";
        const orig = gr.agir.bind(gr); window.__caixas = []; let pendente = null;
        const cx = (el) => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom].map(Math.round); };
        const sob = (pt) => { for (const dy of [0, -12, -24, -36]) for (let dx = 0; dx <= 420; dx += 14) { const e2 = document.elementFromPoint(pt[0] - dx, pt[1] + dy); const b = e2 && e2.closest && e2.closest(".blocklyDraggable"); if (b) return cx(b); } return null; };
        const novo = async (verbo, ...rest) => {
          if (pendente) { pendente.reg.depois = sob(pendente.ponto); pendente = null; }
          const out = await orig(verbo, ...rest);
          try { for (const p of out || []) { for (const k of ["alvo", "para"]) { const a = p[k]; if (!a || !a.seletor) continue; const el = document.querySelector(a.seletor); if (!el) continue;
            const r = el.getBoundingClientRect(); const ponto = [r.left + r.width * (a.u ?? .5), r.top + r.height * (a.v ?? .5)];
            const blk = el.closest && el.closest(".blocklyDraggable");
            const reg = { verbo, fazer: p.fazer, k, t: Date.now(), ponto: ponto.map(Math.round), alvo: cx(el), bloco: blk ? cx(blk) : sob(ponto), tag: el.tagName };
            window.__caixas.push(reg);
            if (p.fazer === "arrastar" && k === "para") pendente = { reg, ponto }; } } } catch (e) {}
          return out; };
        try { gr.agir = novo; } catch (e) {}
        if (gr.agir !== novo) Object.defineProperty(window, "__gravacao", { value: { ...gr, agir: novo }, configurable: true });
        window.__caixasOn = true; return "ligado";
      })()`;
      const fim = Date.now() + minutos * 60000;
      while (Date.now() < fim) {
        for (const w of webContents.getAllWebContents()) {
          if (!/palco-gravacao|\/aulas\//.test(w.getURL()) || w.isDestroyed()) continue;
          const r = await w.executeJavaScript(wrap).catch(() => null);
          if (r === "ligado" || r === "ja") {
            const c = await w
              .executeJavaScript("JSON.stringify(window.__caixas || [])")
              .catch(() => null);
            if (c) g.paginas[w.id] = JSON.parse(c);
          }
        }
        await new Promise((r) => setTimeout(r, 300));
      }
      return Object.keys(g.paginas);
    },
    { etapa, minutos },
  );
}
