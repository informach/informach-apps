import { expect, test } from "@playwright/test";
import { comecarVigia, fecharAparelhos, hidratado, novaPessoa, tela, vigia } from "./apoio";

test.beforeEach(comecarVigia);
test.afterEach(async () => {
  await fecharAparelhos();
  expect(vigia().violacoes).toEqual([]);
  expect(vigia().errosDePagina).toEqual([]);
});

test("editar o perfil próprio, cancelar e conferir o salvamento após recarregar", async ({
  browser,
}) => {
  const { page } = await novaPessoa(browser, "Lia", { comAcesso: false });
  await page.goto("/conta");
  const perfil = page.getByRole("region", { name: "Quem está jogando" });
  await expect(perfil).toContainText("Lia");
  await perfil.getByRole("link", { name: "Editar perfil" }).click();
  const apelido = page.getByLabel("Apelido", { exact: true });
  await hidratado(apelido);
  await apelido.fill("Não salvar");
  await page.getByRole("link", { name: "Voltar sem salvar" }).click();
  await expect(perfil).toContainText("Lia");
  await perfil.getByRole("link", { name: "Editar perfil" }).click();
  await hidratado(apelido);
  await expect(apelido).toHaveValue("Lia");
  await apelido.fill("Lia do Sol");
  await page.getByText("Sol", { exact: true }).click();
  const sol = page.getByRole("radio", { name: "Sol", exact: true });
  await expect(sol).toBeChecked();
  await sol.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "Coral", exact: true })).toBeChecked();
  await page.getByRole("radio", { name: "Coral", exact: true }).press("ArrowLeft");
  await expect(sol).toBeChecked();
  await page.getByRole("button", { name: "Salvar perfil" }).click();
  await expect(page).toHaveURL(/\/conta$/);
  await expect(perfil).toContainText("Lia do Sol");
  await page.reload();
  await expect(perfil).toContainText("Lia do Sol");
  await perfil.getByRole("link", { name: "Editar perfil" }).click();
  await expect(page.getByRole("radio", { name: "Sol", exact: true })).toBeChecked();
  await tela(page, "perfil-proprio-editado");
});
