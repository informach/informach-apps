// Prepara, confere e grava uma parte no gravador guiado do projeto aberto.
// Estado: parte (N), aula (endereço da aula no palco), voz (caminho do áudio da parte), tamanho
// ("1920x1080@1"), soVerificar (só ensaio seco), pularVerificacao, refazerVoz, enderecos/extras (por parte).
// Devolve o plano gerado, as etapas, o resultado do ensaio e, se gravou, a duração.
export default async function fazerParte(ctx) {
  const n = ctx.state.parte;
  const AULA = ctx.state.aula;
  if (!n || !AULA || !ctx.state.voz) throw new Error("faltam parte, aula ou voz no estado");
  const e = await ctx.editor();
  const res = { parte: n };
  // 1. A parte no roteiro.
  await e
    .locator("button, [role=tab]")
    .filter({ hasText: /^Roteiro$/ })
    .first()
    .click();
  await ctx.delay(500);
  const sel = e
    .locator("select")
    .filter({ has: e.locator("option", { hasText: /^Seção 1/ }) })
    .first();
  await sel.selectOption(
    await sel
      .locator("option")
      .evaluateAll((os, n) => os.find((o) => o.textContent.startsWith(`Seção ${n}`))?.value, n),
  );
  await ctx.delay(1000);
  // 2. O gravador no modo guiado.
  await e.getByRole("button", { name: "Gravar tela" }).first().click();
  for (let i = 0; i < 60 && !ctx.recorder(); i++) await ctx.delay(500);
  const r = ctx.recorder();
  await r.waitForLoadState();
  await ctx.delay(1500);
  await r.getByLabel("Modo de gravação").selectOption("guided");
  await ctx.delay(800);
  // 3. O plano da parte.
  const criar = r.getByRole("button", { name: "Criar um plano" });
  const planoSel = r.locator("select").first();
  const existente = (await criar.count())
    ? null
    : await planoSel
        .locator("option")
        .evaluateAll((os, n) => os.find((o) => o.textContent === `Parte ${n}`)?.value ?? null, n);
  if (existente) await planoSel.selectOption(existente);
  else {
    if (await criar.count()) await criar.click();
    else await r.getByRole("button", { name: "Novo plano" }).click();
    await ctx.delay(800);
    await r.getByRole("button", { name: "Renomear" }).click();
    await r.getByLabel("Nome do plano").fill(`Parte ${n}`);
    await r.getByLabel("Nome do plano").press("Tab");
    await r.getByLabel("Onde a demonstração acontece").selectOption("web");
    await ctx.delay(400);
  }
  await r.getByLabel("Tamanho da captura").selectOption(ctx.state.tamanho ?? "1920x1080@1");
  await ctx.delay(400);
  const endereco = ctx.state.enderecos?.[n];
  await r
    .getByLabel("Endereço da aula")
    .fill(
      endereco !== undefined
        ? `${AULA}${endereco}`
        : n === 1
          ? AULA
          : `${AULA}?parte=${n}${ctx.state.extras?.[n] ?? ""}`,
    );
  await ctx.delay(800);
  // 4. A narração da parte.
  if (ctx.state.refazerVoz && (await r.getByText(/^Áudio: /).count())) {
    await r.getByRole("button", { name: "Remover áudio" }).click();
    await ctx.delay(1000);
  }
  if (!(await r.getByText(/^Áudio: /).count())) {
    await ctx.answer("open", [ctx.state.voz]);
    await r.getByRole("button", { name: "Importar narração (áudio ou vídeo)" }).click();
    for (let i = 0; i < 300; i++) {
      await ctx.delay(1000);
      if (
        i > 3 &&
        (await r.getByText(/^Áudio: /).count()) &&
        !(await r.getByText(/Transcrevendo|Carregando|Separando/).count())
      )
        break;
    }
    await ctx.delay(1500);
  }
  // 5. O plano pelo roteiro (o botão só liga quando a transcrição da voz acaba).
  for (
    let i = 0;
    i < 300 && !(await r.getByRole("button", { name: "Gerar plano do roteiro" }).isEnabled());
    i++
  )
    await ctx.delay(1000);
  r.once("dialog", (d) => void d.accept().catch(() => {}));
  await r.getByRole("button", { name: "Gerar plano do roteiro" }).click();
  await ctx.delay(4000);
  res.gerado = await r
    .locator("p, div")
    .filter({ hasText: /etapas? gerada|Não encontrei/ })
    .last()
    .innerText()
    .catch(() => "");
  res.etapas = await r
    .locator("input[aria-label*='ala']")
    .evaluateAll((xs) => xs.map((x) => x.value))
    .catch(() => []);
  // 6. Ensaio seco (Verificar plano).
  await r.getByRole("button", { name: "Verificar plano" }).click();
  await ctx.delay(3000);
  for (let i = 0; i < 600; i++) {
    if (!(await r.getByText(/Verificando a etapa/).count())) break;
    await ctx.delay(1000);
  }
  await ctx.delay(1000);
  const t = await r.locator(".rec-root").innerText({ timeout: 10000 });
  res.verificacao = t
    .split("\n")
    .filter((l) => /^Etapa \d+:|etapas? com problema|Todas as etapas/i.test(l));
  if (
    !ctx.state.pularVerificacao &&
    res.verificacao.some((l) => /^Etapa \d+:|com problema/.test(l))
  )
    return res;
  if (ctx.state.soVerificar) return res;
  // 7. Gravar.
  const t0 = Date.now();
  await r
    .getByRole("button", { name: /^Gravar/ })
    .first()
    .click();
  for (let i = 0; i < 1200; i++) {
    await ctx.delay(1000);
    const rec = ctx.recorder();
    if (!rec || rec.isClosed()) break;
    const s = await rec
      .locator(".rec-root")
      .innerText({ timeout: 3000 })
      .catch(() => "");
    if (/salvo até a etapa/i.test(s)) {
      res.parou = s.slice(0, 500);
      break;
    }
  }
  await ctx.delay(4000);
  res.segundos = Math.round((Date.now() - t0) / 1000);
  res.duracao = (await e.locator(".statusbar").innerText())
    .split("\n")
    .find((l) => l.startsWith("Duração"));
  return res;
}
