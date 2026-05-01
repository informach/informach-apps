import { expect, test } from "@playwright/test";
import { extractFirstUrl, waitForEmail } from "./fixtures/email";

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}@e2e.local`;
}

test("magic link signs the user in on first click", async ({ request }) => {
  const email = uniqueEmail("cozya-magic");

  const requestResponse = await request.post("/api/auth/sign-in/magic-link", {
    data: { email, callbackURL: "/" },
  });
  expect(
    requestResponse.ok(),
    `magic-link request failed: ${await requestResponse.text()}`,
  ).toBeTruthy();

  const magicEmail = await waitForEmail({ to: email, category: "auth.magic-link" });
  const url = extractFirstUrl(magicEmail, "/magic-link");

  const verifyResponse = await request.get(url);
  expect(verifyResponse.status()).toBeLessThan(400);

  const sessionResponse = await request.get("/api/auth/get-session");
  const session = await sessionResponse.json();
  expect(session?.user?.email).toBe(email);
});
