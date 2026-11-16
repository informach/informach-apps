import { expect, test } from "@playwright/test";
import {
  comecarVigia,
  convidar,
  criarMundo,
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

test("responsável cancela a confirmação ou remove o convidado; reentrada é recusada e o mundo permanece", async ({
  browser,
}) => {
  const lia = await novaPessoa(browser, "Lia responsável");
  const bruno = await novaPessoa(browser, "Bruno convidado");
  const id = await criarMundo(lia.page, "Morada", "Mundo preservado na remoção");
  await convidar(lia.page, bruno.page, id);
  const destino = `/conta/mundos/${id}/membros`;
  await lia.page.goto("/conta/mundos");
  await lia.page.getByRole("link", { name: "Gerenciar membros", exact: true }).click();
  await expect(lia.page).toHaveURL(new RegExp(`${destino}$`));
  const abrir = lia.page.getByText("Remover participação", { exact: true });
  await hidratado(abrir);
  await abrir.click();
  await expect(
    lia.page.getByText(/Os moradores, o progresso e a autoria permanecem/),
  ).toBeVisible();
  await lia.page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(abrir).toBeFocused();
  await expect(
    lia.page.getByRole("button", { name: "Confirmar remoção", exact: true }),
  ).toBeHidden();
  await abrir.press("Enter");
  await lia.page.setViewportSize({ width: 390, height: 844 });
  expect(
    await lia.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
  await lia.page
    .getByRole("button", { name: "Confirmar remoção", exact: true })
    .scrollIntoViewIfNeeded();
  await tela(lia.page, "remocao-membro-mobile");
  await lia.page.getByRole("button", { name: "Confirmar remoção", exact: true }).click();
  await expect(lia.page.getByRole("status")).toContainText(
    "Participação removida. O mundo e o progresso foram preservados.",
  );
  await expect(
    lia.page.getByText("Nenhuma outra participação nesta página.", { exact: true }),
  ).toBeVisible();
  await bruno.page.goto("/conta/mundos");
  await expect(
    bruno.page.getByRole("heading", { name: "Mundo preservado na remoção", exact: true }),
  ).toHaveCount(0);
  const negada = await bruno.page.goto(`/mundos/${id}`);
  expect(negada?.status()).toBe(404);
  const painelNegado = await bruno.page.goto(destino);
  expect(painelNegado?.status()).toBe(404);
  await lia.page.goto(`/mundos/${id}`);
  await expect(
    lia.page.getByRole("heading", { name: "Mundo preservado na remoção", exact: true }),
  ).toBeVisible();
});
