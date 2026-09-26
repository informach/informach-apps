import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { db, eq } from "@informach/db";
import {
  customers,
  missaoAttempts,
  missaoSessions,
  sessions,
  subscriptions,
} from "@informach/db/schema";
import { expect, type Page, test } from "@playwright/test";

async function verificationCode(email: string) {
  const directory = process.env.EMAIL_SANDBOX_DIR;
  if (!directory) throw new Error("Missing sandbox");
  let code = "";
  await expect
    .poll(
      async () => {
        const files = await readdir(directory);
        for (const file of files.filter((f) => f.endsWith(".json"))) {
          const message = JSON.parse(await readFile(path.join(directory, file), "utf8"));
          if (message.to === email && message.category === "auth.verify-email-otp")
            code = message.text?.match(/\b\d{6}\b/)?.[0] ?? "";
        }
        return code.length;
      },
      { timeout: 10000 },
    )
    .toBe(6);
  return code;
}
/** Cadastra um responsável, confirma o e-mail e cria o primeiro perfil (6º ano, OLITEF). */
async function criarContaComPerfil(page: Page, apelido: string) {
  const email = `missao-${randomUUID()}@example.test`;
  await page.goto("/entrar");
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await page.getByLabel("Como podemos chamar o responsável?").fill("Responsável do piloto");
  await page.getByLabel("E-mail do responsável", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill("Missao-Teste-2026-Local!");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Criar conta do responsável" }).click();
  await expect(page.getByLabel("Código de seis dígitos")).toBeVisible();
  await page.getByLabel("Código de seis dígitos").fill(await verificationCode(email));
  await page.getByRole("button", { name: "Confirmar e-mail", exact: true }).click();
  await expect(page).toHaveURL(/\/familia$/);
  await page.getByLabel("Apelido do estudante").fill(apelido);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Criar perfil e explorar" }).click();
  await expect(page.getByRole("heading", { name: `Olá, ${apelido}.` })).toBeVisible();
  return email;
}
test("public exploration is useful without an account and bars preserve scale", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Experimentar uma missão", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Experimentar uma missão", exact: true }).click();
  await page.getByRole("radio", { name: "R$ 140", exact: true }).check();
  await page.getByRole("button", { name: "Conferir minha ideia" }).click();
  await expect(page.getByText(/Somar 20% e 10% usa os R\$ 200 como base duas vezes/)).toBeVisible();
  const ranges = page.getByRole("slider");
  await ranges.nth(1).focus();
  await page.keyboard.press("End");
  await ranges.nth(2).focus();
  await page.keyboard.press("End");
  await expect(ranges.nth(2)).toHaveValue("60");
  const ratio = await page
    .locator(".bar.final")
    .evaluate(
      (el) =>
        el.getBoundingClientRect().width / (el.parentElement?.getBoundingClientRect().width ?? 1),
    );
  expect(ratio).toBeCloseTo(0.16, 2);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
});
test("parent signup, verified profile, learning, saved lab, report and profile switch", async ({
  browser,
  page,
}) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  const email = await criarContaComPerfil(page, "Sol");
  await page.screenshot({ path: test.info().outputPath("hoje.png"), fullPage: true });
  await page.getByRole("button", { name: "Começar descoberta" }).click();
  await expect(page).toHaveURL(/\/missao\//);
  await page.getByRole("button", { name: /Quero uma pista/ }).click();
  await expect(page.getByText(/Pista 1\./)).toBeVisible();
  await page.getByText("Algo nesta questão atrapalhou?").click();
  await page.getByLabel("O que aconteceu?").selectOption("not_understood");
  await page
    .getByLabel("Conte mais, se quiser, sem incluir dados pessoais")
    .fill("A primeira leitura não deixou claro qual referência usar.");
  await page.getByRole("button", { name: "Enviar relato", exact: true }).click();
  await expect(page.getByText("Relato registrado. Obrigado!", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByText("Algo nesta questão atrapalhou?").click();
  await expect(page.getByRole("button", { name: "Relato registrado", exact: true })).toBeDisabled();
  await expect(page.getByLabel("Conte mais, se quiser, sem incluir dados pessoais")).toHaveValue(
    "A primeira leitura não deixou claro qual referência usar.",
  );
  await page.screenshot({ path: test.info().outputPath("missao.png"), fullPage: true });
  // O grupo de alternativas se chama pelo enunciado: quem navega por leitor de
  // tela entra nas opções sabendo a pergunta, não só "sua resposta".
  const enunciado = await page.locator("p[id^='enunciado-']").first().innerText();
  await expect(page.getByRole("group", { name: enunciado })).toBeVisible();
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: "Conferir minha ideia" }).click();
  await expect(page.getByText("Esta tentativa foi registrada com apoio de pistas.")).toBeVisible();
  await page.getByRole("link", { name: "Pausar e sair" }).click();
  await page.getByRole("link", { name: "Retomar missão" }).click();
  await expect(page.getByText("2 de 6", { exact: true })).toBeVisible();
  for (let i = 1; i < 6; i++) {
    await page.getByRole("radio").first().check();
    await page.getByRole("button", { name: "Conferir minha ideia" }).click();
    await page
      .getByRole("button", { name: i === 5 ? "Ver minhas descobertas" : "Continuar", exact: true })
      .click();
  }
  await expect(page.getByRole("heading", { name: "Uma ideia para levar com você." })).toBeVisible();
  await page.goto("/laboratorio");
  const grid = page
    .locator(".lab")
    .filter({ has: page.getByRole("heading", { name: "A área muda. E o contorno?" }) });
  await grid.getByRole("button", { name: "Linha 1, coluna 1", exact: true }).click();
  await grid.getByRole("button", { name: "Salvar experimento para continuar depois" }).click();
  await expect(grid.getByText(/Experimento salvo na sua conta/)).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("laboratorio.png"), fullPage: true });
  await page.goto("/caderno");
  await page
    .getByLabel("Hoje eu descobri que…")
    .fill("Tirar o canto mantém o contorno porque dois lados saem e dois aparecem.");
  await page.getByRole("button", { name: "Guardar descoberta" }).click();
  await expect(page.getByText("Descoberta guardada.", { exact: true })).toBeVisible();
  await page.goto("/laboratorio");
  await expect(
    page.getByRole("button", { name: "Linha 1, coluna 1", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  // "Meu espaço" passou a carregar dados reais e a escolha de tema; ambos
  // eram interface nova sem nenhuma cobertura.
  await page.goto("/meu-espaco");
  await expect(page.getByRole("heading", { name: "Meu espaço" })).toBeVisible();
  await expect(page.getByText("1 descoberta guardada", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Escuro", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  // A escolha sobrevive ao recarregamento sem piscar: o script do layout
  // aplica o tema antes da primeira pintura, com o nonce da CSP.
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Do sistema", exact: true }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", "dark");
  await page.goto("/hoje");
  await page.getByRole("button", { name: "Explorar meu ponto de partida" }).click();
  // O banco do diagnóstico acompanha o catálogo (hoje 12 itens reservados),
  // então o total vem do próprio contador em vez de uma constante no teste.
  const totalDiagnostico = Number(
    (
      await page
        .getByText(/^\d+ de \d+$/)
        .first()
        .innerText()
    ).split(" de ")[1],
  );
  expect(totalDiagnostico).toBeGreaterThan(0);
  for (let i = 0; i < totalDiagnostico; i++)
    await page.getByRole("button", { name: "Ainda não sei", exact: true }).click();
  await expect(page.getByRole("button", { name: "Continuar por esta ideia" })).toBeVisible();
  const exported = await page.request.get("/api/familia/exportar");
  expect(exported.status()).toBe(200);
  const payload = await exported.json();
  // Uma tentativa por item respondido: a missão de 6 mais o diagnóstico inteiro.
  expect(payload.attempts).toHaveLength(6 + totalDiagnostico);
  expect(payload.notes).toHaveLength(1);
  expect(payload.experiments).toHaveLength(1);
  expect(payload.reports).toHaveLength(1);
  await page.goto("/familia");
  await expect(page.getByRole("button", { name: "Escolher mensal" }).first()).toBeDisabled();
  const userId = payload.profiles[0].userId;
  // Fill more than one history page using complete, versioned snapshots. The
  // older pause must still be reachable from Today and the paginated history.
  const [source] = await db
    .select()
    .from(missaoSessions)
    .where(
      eq(
        missaoSessions.id,
        payload.sessions.find((s: { mode: string }) => s.mode === "mission").id,
      ),
    );
  if (!source) throw new Error("Missing source session");
  const sourceAttempts = await db
    .select()
    .from(missaoAttempts)
    .where(eq(missaoAttempts.sessionId, source.id));
  const [oldPause] = await db
    .insert(missaoSessions)
    .values({
      profileId: source.profileId,
      lessonId: source.lessonId,
      version: source.version,
      mode: "mission",
      snapshot: source.snapshot,
      requestKey: randomUUID(),
      createdAt: new Date("2024-01-01Z"),
    })
    .returning();
  if (!oldPause) throw new Error("Missing old pause");
  const copies = await db
    .insert(missaoSessions)
    .values(
      Array.from({ length: 31 }, (_, i) => ({
        profileId: source.profileId,
        lessonId: source.lessonId,
        version: source.version,
        mode: "mission" as const,
        snapshot: source.snapshot,
        requestKey: randomUUID(),
        completedAt: new Date(),
        createdAt: new Date(Date.now() + i),
      })),
    )
    .returning();
  await db
    .insert(missaoAttempts)
    .values(
      copies.flatMap((copy) =>
        sourceAttempts.map((attempt) => ({ ...attempt, id: randomUUID(), sessionId: copy.id })),
      ),
    );
  await page.goto("/hoje");
  await expect(page.getByRole("link", { name: "Retomar missão" })).toHaveAttribute(
    "href",
    `/missao/${oldPause.id}`,
  );
  await page.goto("/historico");
  await expect(page.getByRole("heading", { name: "Meu histórico", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Retomar percurso" })).toHaveCount(0);
  await page.getByRole("link", { name: "Percursos anteriores" }).click();
  await page.getByRole("link", { name: "Retomar percurso" }).click();
  await expect(page).toHaveURL(new RegExp(`/missao/${oldPause.id}$`));
  await expect(page.getByText("1 de 6", { exact: true })).toBeVisible();
  // Resume check finished; remove only this isolated pause so later profile-
  // switch assertions retain their original next-mission starting state.
  await db.delete(missaoSessions).where(eq(missaoSessions.id, oldPause.id));
  await page.goto("/familia");
  const [customer] = await db
    .insert(customers)
    .values({
      provider: "stripe",
      providerCustomerId: `cus_e2e_${randomUUID()}`,
      subjectType: "user",
      subjectId: userId,
      app: "missao-saber",
      email,
    })
    .returning();
  if (!customer) throw new Error("Fixture customer missing");
  await db.insert(subscriptions).values({
    customerId: customer.id,
    productId: "missao_family_monthly",
    provider: "stripe",
    providerSubscriptionId: `sub_e2e_${randomUUID()}`,
    providerPriceId: "price_e2e_fixture",
    status: "active",
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 86_400_000),
  });
  await page.reload();
  await page.goto("/jornada");
  const formatLesson = page
    .getByRole("heading", { name: "Quatro jeitos de mostrar uma ideia" })
    .locator("..");
  await formatLesson.getByRole("button", { name: "Explorar", exact: true }).click();
  await page.getByRole("radio", { name: "4/8", exact: true }).check();
  await page.getByRole("button", { name: "Conferir minha ideia" }).click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByLabel("Seu valor em m").fill("0,5 m");
  await page.getByRole("button", { name: "Conferir minha ideia" }).click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  const moveDivide = page.getByRole("button", {
    name: /Mover “Dividir 20 em 4 partes iguais” para cima/,
  });
  await moveDivide.focus();
  await page.keyboard.press("Enter");
  await page
    .getByRole("button", { name: /Mover “Reconhecer que uma parte vale 5” para cima/ })
    .click();
  await page
    .getByRole("button", { name: /Mover “Reconhecer que uma parte vale 5” para cima/ })
    .click();
  await page.getByRole("button", { name: "Conferir minha ideia" }).click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page
    .getByLabel("Explique seu raciocínio com suas palavras")
    .fill("Usei denominador 40: comparei 25/40 com 24/40 e concluí que 5/8 é maior.");
  await page.getByRole("button", { name: "Conferir minha ideia" }).click();
  await expect(page.getByRole("heading", { name: "Reflexão registrada." })).toBeVisible();
  await page.getByRole("button", { name: "Ver minhas descobertas", exact: true }).click();
  await expect(page.getByText(/3 de 3 questões com correção objetiva/)).toBeVisible();
  await expect(page.getByText(/1 reflexão foi registrada sem nota automática/)).toBeVisible();
  await page.goto("/familia");
  await page.getByLabel("Apelido do estudante").fill("Lua");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Criar perfil e explorar" }).click();
  await expect(page.getByRole("heading", { name: "Olá, Lua." })).toBeVisible();
  await page.goto("/familia");
  await page.getByLabel("Apelido do estudante").fill("Nina");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Criar perfil e explorar" }).click();
  await expect(page.getByRole("heading", { name: "Olá, Nina." })).toBeVisible();
  await page.getByRole("button", { name: /Trocar de estudante/ }).click();
  await page.getByRole("button", { name: /^Sol/ }).click();
  await expect(page.getByRole("heading", { name: "Olá, Sol." })).toBeVisible();
  await page.getByRole("button", { name: "Começar descoberta" }).click();
  await expect(page).toHaveURL(/\/missao\//);

  const familyExport = await (await page.request.get("/api/familia/exportar")).json();
  const lua = familyExport.profiles.find(
    (profile: { nickname: string; id: string }) => profile.nickname === "Lua",
  );
  if (!lua) throw new Error("Missing second-device profile");
  const secondContext = await browser.newContext();
  const origin = new URL(page.url()).origin;
  await secondContext.addCookies(await page.context().cookies());
  await secondContext.addCookies([
    {
      name: "ms-profile",
      value: lua.id,
      url: origin,
      httpOnly: true,
      sameSite: "Lax",
      secure: false,
    },
  ]);
  const secondDevice = await secondContext.newPage();
  await secondDevice.goto("/hoje");
  await expect(secondDevice.getByRole("heading", { name: "Olá, Lua." })).toBeVisible();
  await secondDevice.getByRole("button", { name: "Começar descoberta" }).click();
  await expect(secondDevice).toHaveURL(/\/missao\//);
  expect(new URL(secondDevice.url()).pathname).not.toBe(new URL(page.url()).pathname);

  await page.goto("/hoje");
  await expect(page.getByRole("heading", { name: "Olá, Sol." })).toBeVisible();
  await secondDevice.goto("/hoje");
  await expect(secondDevice.getByRole("heading", { name: "Olá, Lua." })).toBeVisible();
  await secondContext.close();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
  expect(runtimeErrors).toEqual([]);
  await db
    .update(sessions)
    .set({ createdAt: new Date(Date.now() - 11 * 60_000) })
    .where(eq(sessions.userId, userId));
  await page.context().clearCookies({ name: /session_data/ });
  await page.goto("/familia");
  // Sessão antiga: o relatório continua legível, mas assinatura, dados e novos
  // perfis pedem confirmação de acesso, e a exportação recusa no servidor.
  await expect(page.getByRole("heading", { name: "O aprendizado, mais de perto." })).toBeVisible();
  await expect(page.getByText("Um cuidado com o espaço da família.").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Exportar dados em JSON" })).toHaveCount(0);
  expect((await page.request.get("/api/familia/exportar")).status()).toBe(403);
  await page.getByRole("button", { name: "Sair da conta", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/hoje");
  await expect(page).toHaveURL(/\/entrar/);
});
test("changing the track on the journey updates the card and the path without a reload", async ({
  page,
}) => {
  await criarContaComPerfil(page, "Sol");
  // Navegação de cliente, como no uso real: a jornada abre a partir de "Hoje".
  await page.getByRole("link", { name: /Ver minha jornada/ }).click();
  await expect(page).toHaveURL(/\/jornada$/);
  const cartao = page.locator("main section").first();
  await expect(cartao.getByRole("heading", { level: 2 })).toHaveText("Dinheiro com propósito");
  await expect(page.getByRole("heading", { name: "Princípio das gavetas" })).toHaveCount(0);

  await page.getByLabel("Sua trilha").selectOption("obmep-n1");
  // O seletor mostra a escolha na hora e o resto da página acompanha sem recarregar.
  await expect(page.getByLabel("Sua trilha")).toHaveValue("obmep-n1");
  await expect(cartao.getByRole("heading", { level: 2 })).toHaveText("Pensar além da conta");
  await expect(page.getByRole("heading", { name: "Princípio das gavetas" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Comparação de preços" })).toHaveCount(0);

  // Segunda troca em sequência, sem sair da página.
  await page.getByLabel("Sua trilha").selectOption("canguru-e");
  await expect(cartao.getByRole("heading", { level: 2 })).toHaveText("Olhar de explorador");
  await expect(page.getByRole("heading", { name: "Simetria e transformações" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Princípio das gavetas" })).toHaveCount(0);

  // "Hoje" recomenda a partir da trilha nova, e a jornada mantém a escolha ao voltar.
  await page.goto("/hoje");
  await page.getByRole("link", { name: /Ver minha jornada/ }).click();
  await expect(page.getByLabel("Sua trilha")).toHaveValue("canguru-e");
  await expect(cartao.getByRole("heading", { level: 2 })).toHaveText("Olhar de explorador");
});
test("unauthenticated access and operational endpoints fail closed", async ({ page }) => {
  await page.goto("/hoje");
  await expect(page).toHaveURL(/\/entrar/);
  expect((await page.request.post("/api/jobs/billing")).status()).toBe(401);
  expect((await page.request.post("/api/webhooks/stripe", { data: "{}" })).status()).toBe(400);
});
