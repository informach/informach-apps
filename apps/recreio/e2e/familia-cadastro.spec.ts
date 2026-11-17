import { expect, test } from "@playwright/test";
import {
  comecarVigia,
  conceder,
  fecharAparelhos,
  hidratado,
  novaPessoa,
  tela,
  vigia,
} from "./apoio";

test.beforeEach(comecarVigia);
test.afterEach(async () => {
  await fecharAparelhos();
  expect(vigia().violacoes).toEqual([]);
  expect(vigia().errosDePagina).toEqual([]);
});

test("responsável sem jogador cadastra, protege e supervisiona o perfil", async ({ browser }) => {
  const pessoa = await novaPessoa(browser, "Responsável", { semPerfil: true });
  const { page } = pessoa;
  await page.goto("/conta");
  await page.getByRole("link", { name: "Gerenciar perfis", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Perfis sob sua responsabilidade", exact: true }),
  ).toBeVisible();
  const adicionar = page.getByRole("button", { name: "Adicionar perfil", exact: true });
  await hidratado(adicionar);
  await adicionar.click();
  const apelido = page.getByLabel("Apelido", { exact: true });
  await hidratado(apelido);
  await apelido.fill("Lua da casa");
  await page.getByLabel("Mês de nascimento", { exact: true }).selectOption("1");
  await page
    .getByLabel("Ano de nascimento", { exact: true })
    .fill(String(new Date().getUTCFullYear() - 8));
  const declaracao = page.getByRole("checkbox", { name: /Declaro que tenho 18/ });
  await expect(declaracao).not.toBeChecked();
  await declaracao.check();
  await page.getByRole("button", { name: "Confirmar cadastro", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Lua da casa", exact: true })).toBeVisible();
  await expect(page.getByText("Ativo · Conteúdo até 6 anos", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Lua da casa", exact: true })).toBeVisible();
  await hidratado(adicionar);
  await adicionar.click();
  await hidratado(apelido);
  await apelido.fill("Sem confirmar");
  await page.getByRole("button", { name: "Cancelar cadastro", exact: true }).click();
  await expect(apelido).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Lua da casa", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sem confirmar", exact: true })).toHaveCount(0);
  await tela(page, "familia-cadastro-sem-jogador");
  await page.getByRole("link", { name: "Voltar à conta", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Quem está jogando", exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("link", { name: "Criar meu perfil para jogar", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Gerenciar PIN", exact: true }).click();
  const novoPin = page.getByLabel("Novo PIN", { exact: true });
  await hidratado(novoPin);
  await novoPin.fill("593871");
  await page.getByLabel("Confirme o PIN", { exact: true }).fill("593872");
  await page.getByRole("button", { name: "Salvar PIN", exact: true }).click();
  await expect(page.getByText("Os dois PINs precisam ser iguais.", { exact: true })).toBeVisible();
  await page.getByLabel("Confirme o PIN", { exact: true }).fill("593871");
  await page.getByRole("button", { name: "Salvar PIN", exact: true }).click();
  await expect(page.getByText("PIN configurado.", { exact: true })).toBeVisible();
  await tela(page, "pin-nativo-sem-jogador");
  await page.goto("/conta/perfis");
  await page.getByRole("link", { name: "Gerenciar aparelhos de Lua da casa", exact: true }).click();
  await hidratado(page.getByLabel("Novo PIN", { exact: true }));
  await page.getByLabel("Novo PIN", { exact: true }).fill("396175");
  await page.getByLabel("Confirme o PIN", { exact: true }).fill("396175");
  await page.getByRole("button", { name: "Salvar PIN", exact: true }).click();
  await expect(page.getByText("PIN configurado.", { exact: true })).toBeVisible();
  await page.goto("/conta/perfis");
  await page.getByRole("link", { name: "Supervisionar Lua da casa", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Supervisão de Lua da casa", exact: true }),
  ).toBeVisible();
  const limite = page.getByLabel("Limite diário em minutos", { exact: true });
  await hidratado(limite);
  await expect(limite).toHaveValue("");
  await expect(
    page.getByRole("checkbox", {
      name: "Revisei e confirmo estas regras para o perfil.",
      exact: true,
    }),
  ).not.toBeChecked();
  await expect(
    page.getByText("Texto livre fica desativado para crianças de até 12 anos.", { exact: true }),
  ).toBeVisible();
  await limite.fill("30");
  await page.getByLabel("Pausar o acesso aos jogos", { exact: true }).check();
  await page.getByLabel("Limite de conteúdo", { exact: true }).selectOption("L");
  await page
    .getByLabel("Quem pode ver que está jogando", { exact: true })
    .selectOption("invisible");
  await page.getByLabel("Jogar somente nos horários definidos", { exact: true }).check();
  await page.getByRole("button", { name: "Adicionar horário", exact: true }).click();
  await page.getByRole("button", { name: "Adicionar horário", exact: true }).click();
  await page.getByLabel("Revisei e confirmo estas regras para o perfil.", { exact: true }).check();
  await page.getByRole("button", { name: "Salvar supervisão", exact: true }).click();
  await expect(
    page.getByText(/Confira os horários: o fim deve vir depois do início/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Remover horário de Segunda-feira, 16:00 até 18:00", exact: true })
    .last()
    .click();
  await page.getByRole("button", { name: "Salvar supervisão", exact: true }).click();
  await expect(
    page.getByText("Supervisão confirmada. Confira abaixo as regras atuais.", { exact: true }),
  ).toBeVisible();
  await expect(limite).toHaveValue("30");
  await expect(page.getByLabel("Pausar o acesso aos jogos", { exact: true })).toBeChecked();
  await expect(page.getByLabel("Limite de conteúdo", { exact: true })).toHaveValue("L");
  await expect(page.getByLabel("Quem pode ver que está jogando", { exact: true })).toHaveValue(
    "invisible",
  );
  await expect(
    page.getByLabel("Jogar somente nos horários definidos", { exact: true }),
  ).toBeChecked();
  await expect(page.getByLabel("De", { exact: true })).toHaveValue("16:00");
  await expect(page.getByLabel("Até", { exact: true })).toHaveValue("18:00");
  await expect(
    page.getByLabel("Revisei e confirmo estas regras para o perfil.", { exact: true }),
  ).not.toBeChecked();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await tela(page, "supervisao-mobile");
  await page
    .getByRole("heading", { name: "Tempo de brincar", exact: true })
    .scrollIntoViewIfNeeded();
  await tela(page, "supervisao-horarios-mobile");
  await page
    .getByRole("heading", { name: "Confirme as regras", exact: true })
    .scrollIntoViewIfNeeded();
  await tela(page, "supervisao-confirmacao-mobile");
  // A prova usa o título interno L; o Morada continua em análise e recusado.
  await limite.fill("10");
  await page.getByLabel("Pausar o acesso aos jogos", { exact: true }).uncheck();
  await page.getByLabel("Jogar somente nos horários definidos", { exact: true }).uncheck();
  await page.getByLabel("Revisei e confirmo estas regras para o perfil.", { exact: true }).check();
  await page.getByRole("button", { name: "Salvar supervisão", exact: true }).click();
  await expect(
    page.getByText("Supervisão confirmada. Confira abaixo as regras atuais.", { exact: true }),
  ).toBeVisible();
  conceder(pessoa.email);
  await page.goto("/perfis");
  const protegido = page.getByRole("button", { name: "Escolher Lua da casa com PIN", exact: true });
  await hidratado(protegido);
  await protegido.click();
  await page.getByLabel("PIN de seis números", { exact: true }).fill("396175");
  await page.getByRole("button", { name: "Confirmar escolha", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Olá, Lua da casa!", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Conta", exact: true })).toHaveCount(0);
  await tela(page, "perfil-compartilhado-mobile");
  await expect(page.getByRole("link", { name: "Jogar Morada", exact: true })).toHaveCount(0);
  await page.goto("/jogar/morada");
  await expect(page).toHaveURL(/\/aparelho$/);
  const ingressoMorada = await page.evaluate(async () => {
    const resposta = await fetch("/api/sdk/v1/ingresso", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jogo: "morada" }),
    });
    return { status: resposta.status, corpo: await resposta.json() };
  });
  expect(ingressoMorada).toEqual({ status: 403, corpo: { codigo: "POLITICA_INCOMPATIVEL" } });
  await page.getByRole("heading", { name: "Sua estante", exact: true }).scrollIntoViewIfNeeded();
  await tela(page, "estante-protegida-mobile");
  await page
    .getByRole("link", { name: "Jogar Prova de progresso por perfil", exact: true })
    .click();
  await expect(page.getByLabel("Pontos salvos", { exact: true })).toHaveText("0");
  await expect(
    page.getByRole("status").filter({ hasText: "Faltam cerca de 10 minutos para a pausa." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ganhar ponto", exact: true }).click();
  await expect(page.getByLabel("Pontos salvos", { exact: true })).toHaveText("1");
  await expect(page.getByRole("status", { name: "Estado do progresso", exact: true })).toHaveText(
    "Progresso salvo.",
  );
  await page.getByRole("button", { name: "Salvar e sair", exact: true }).click();
  await expect(page).toHaveURL(/\/aparelho$/);
  await page
    .getByRole("link", { name: "Jogar Prova de progresso por perfil", exact: true })
    .click();
  await expect(page.getByLabel("Pontos salvos", { exact: true })).toHaveText("1");
  await page.getByRole("button", { name: "Salvar e sair", exact: true }).click();
  await expect(page).toHaveURL(/\/aparelho$/);
  await page.goto("/conta");
  await expect(page).toHaveURL(/\/entrar\?encerrada=1$/);
  await page.goto("/perfis");
  await expect(page.getByText(/Você entrou como/)).toHaveCount(0);
  const adulto = page.getByRole("button", { name: "Abrir área do adulto", exact: true });
  await hidratado(adulto);
  await adulto.click();
  await tela(page, "retorno-adulto-pin-mobile");
  await page.getByLabel("PIN de seis números", { exact: true }).fill("396175");
  await page.getByRole("button", { name: "Confirmar escolha", exact: true }).click();
  await expect(
    page.getByText("PIN incorreto ou não configurado para este destino.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("PIN de seis números", { exact: true }).fill("593871");
  await page.getByRole("button", { name: "Confirmar escolha", exact: true }).click();
  await expect(page).toHaveURL(/\/conta$/);
  await expect(page.getByRole("heading", { name: "Conta", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Quem está jogando", exact: true })).toHaveCount(
    0,
  );
});
