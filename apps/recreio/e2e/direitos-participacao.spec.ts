import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { hidratado, novaPessoa, tela } from "./apoio";
import { prepararParticipacaoParaTela } from "./direitos-participacao-apoio";

for (const estado of ["closing", "closed"] as const) {
  test(`participação ${estado}: interface preserva dados e consulta financeira em 390 px`, async ({
    browser,
  }) => {
    const a = await novaPessoa(browser, "Conta em encerramento", { semPerfil: true });
    try {
      await prepararParticipacaoParaTela(a.email, estado);
      await a.page.setViewportSize({ width: 390, height: 844 });
      await a.page.goto("/conta");
      await expect(
        a.page.getByRole("heading", {
          name: estado === "closing" ? "Encerramento em andamento" : "Participação encerrada",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        a.page.getByRole("link", { name: "Criar meu perfil para jogar", exact: true }),
      ).toHaveCount(0);
      await expect(
        a.page.getByRole("link", { name: "Escolher quem joga", exact: true }),
      ).toHaveCount(0);
      await expect(a.page.getByRole("link", { name: "Estante", exact: true })).toHaveCount(0);
      expect(
        await a.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await tela(a.page, `direitos-participacao-${estado}-390`, { paginaInteira: true });
      for (const destino of ["/estante", "/comecar", "/perfis"]) {
        await a.page.goto(destino);
        await expect(a.page).toHaveURL(/\/conta$/);
      }
      await a.page.getByRole("link", { name: "Minha assinatura", exact: true }).click();
      await expect(a.page.getByRole("heading", { name: "Assinatura", exact: true })).toBeVisible();
      await expect(
        a.page.getByRole("button", {
          name: /Continuar para o pagamento|Autorizar compra|Conferir oferta/,
        }),
      ).toHaveCount(0);
      await a.page.goto("/conta/dados");
      await expect(
        a.page.getByRole("button", { name: "Preparar prévia", exact: true }),
      ).toHaveCount(0);
      const regiao = a.page.getByRole("region", { name: "Uma cópia dos seus dados", exact: true });
      const preparar = regiao.getByRole("button", { name: "Preparar cópia", exact: true });
      await hidratado(preparar);
      await regiao.getByLabel("Dados da cópia", { exact: true }).selectOption("account");
      await preparar.click();
      await expect(regiao.getByText("Cópia preparada", { exact: true })).toBeVisible();
      const descarga = a.page.waitForEvent("download");
      await regiao.getByRole("button", { name: "Baixar cópia da conta", exact: true }).click();
      const caminho = await (await descarga).path();
      if (!caminho) throw new Error("Download absent");
      const texto = await readFile(caminho, "utf8");
      expect(texto).toContain(a.email);
      expect(texto).toContain(`"estado":"${estado}"`);
      expect(texto).toContain('"tipo":"participacao_recreio"');
    } finally {
      await a.contexto.close();
    }
  });
}
