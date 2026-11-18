import { type Browser, expect } from "@playwright/test";
import { conceder, hidratado, novaPessoa, novoAparelho } from "./apoio";

/** Cadastro, supervisão e pareamento reais; adulto permanece sem perfil de jogador. */
export async function familiaComAparelho(browser: Browser, apelido: string) {
  const adulto = await novaPessoa(browser, `Responsável de ${apelido}`, { semPerfil: true });
  conceder(adulto.email, "family");
  const page = adulto.page;
  await page.goto("/conta/perfis");
  const adicionar = page.getByRole("button", { name: "Adicionar perfil", exact: true });
  await hidratado(adicionar);
  await adicionar.click();
  const nome = page.getByLabel("Apelido", { exact: true });
  await hidratado(nome);
  await nome.fill(apelido);
  await page.getByLabel("Mês de nascimento", { exact: true }).selectOption("1");
  await page
    .getByLabel("Ano de nascimento", { exact: true })
    .fill(String(new Date().getUTCFullYear() - 8));
  await page.getByRole("checkbox", { name: /Declaro que tenho 18/ }).check();
  await page.getByRole("button", { name: "Confirmar cadastro", exact: true }).click();
  await page.getByRole("link", { name: `Supervisionar ${apelido}`, exact: true }).click();
  const contatos = page.getByRole("checkbox", { name: /Permitir pedidos de contato/ });
  await hidratado(contatos);
  await contatos.check();
  await page.getByLabel("Revisei e confirmo estas regras para o perfil.", { exact: true }).check();
  await Promise.all([
    page.waitForEvent("load"),
    page.getByRole("button", { name: "Salvar supervisão", exact: true }).click(),
  ]);
  await page.goto("/conta/perfis");
  const contato = await page
    .getByRole("link", { name: `Contatos e pedidos de ${apelido}`, exact: true })
    .getAttribute("href");
  const aparelhos = page.getByRole("link", {
    name: `Gerenciar aparelhos de ${apelido}`,
    exact: true,
  });
  const destino = await aparelhos.getAttribute("href"),
    id = destino?.match(/^\/conta\/perfis\/([0-9a-f-]{36})\/aparelhos$/)?.[1];
  if (!contato || !destino || !id) throw new Error("Gestão do perfil ausente");
  await aparelhos.click();
  const contexto = await novoAparelho(browser),
    infantil = await contexto.newPage();
  await infantil.goto("/parear");
  const mostrar = infantil.getByRole("button", {
    name: "Mostrar código deste aparelho",
    exact: true,
  });
  await hidratado(mostrar);
  await mostrar.click();
  const codigo = infantil.getByLabel("Código de pareamento", { exact: true });
  await expect(codigo).toBeVisible();
  const campo = page.getByLabel("Código mostrado no outro aparelho", { exact: true });
  await hidratado(campo);
  await campo.fill((await codigo.innerText()).replace(/\s/g, ""));
  await page.getByRole("button", { name: `Confirmar aparelho de ${apelido}`, exact: true }).click();
  await expect(infantil).toHaveURL(/\/aparelho$/);
  return {
    adulto,
    infantil,
    perfilId: id,
    contatos: contato,
    convites: `/conta/perfis/${id}/convites`,
  };
}

export async function mundoNoAparelho(
  familia: Awaited<ReturnType<typeof familiaComAparelho>>,
  nome: string,
) {
  const page = familia.infantil;
  await page.goto("/aparelho");
  const regiao = page.getByRole("region", { name: "Seus mundos no Jogo de teste", exact: true }),
    campo = regiao.getByLabel("Nome do mundo", { exact: true });
  await hidratado(campo);
  await campo.fill(nome);
  await regiao.getByRole("button", { name: "Criar mundo", exact: true }).click();
  await expect(page).toHaveURL(/\/aparelho\?mundoCriado=[0-9a-f-]{36}$/);
  const id = new URL(page.url()).searchParams.get("mundoCriado");
  if (!id) throw new Error("Mundo não confirmado");
  return id;
}
