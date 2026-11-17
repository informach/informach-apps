import { randomUUID } from "node:crypto";
import { getAppUrl } from "@informach/config/domains";
import { expect, test } from "@playwright/test";
import { registerParent } from "./family-helpers";

test("billing stays in the central account and a forged return parameter grants no coverage", async ({
  page,
}) => {
  const owner = await registerParent(page, `payment-${randomUUID()}@example.test`);
  await page.goto("/familia/conta?pagamento=recebido");
  await expect(
    page.getByRole("link", { name: /Compasso.*Minha conta|Minha conta.*Compasso/ }),
  ).toHaveAttribute(
    "href",
    `${getAppUrl("conta", "development")}/?familia=${owner.familyGroupId}#compasso`,
  );
  await expect(page.getByText("Confirmando o pagamento com a operadora…")).toHaveCount(0);
  await expect(
    page.getByText("Você pode explorar as atividades gratuitas com um estudante.", { exact: true }),
  ).toBeVisible();
});
