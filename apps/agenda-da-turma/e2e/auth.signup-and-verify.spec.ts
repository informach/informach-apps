import { expect, test } from "@playwright/test";
import { extractFirstUrl, waitForEmail } from "./fixtures/email";

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}@e2e.local`;
}

test("signup → verify email → auto sign-in", async ({ request }) => {
  const email = uniqueEmail("agenda-signup");
  const password = "S3cretP4ss!";

  const signupResponse = await request.post("/api/auth/sign-up/email", {
    data: { name: "E2E User", email, password },
  });
  expect(signupResponse.ok(), `sign-up failed: ${await signupResponse.text()}`).toBeTruthy();

  const verificationEmail = await waitForEmail({ to: email, category: "auth.verify-email" });
  const verifyUrl = extractFirstUrl(verificationEmail, "/verify-email");

  const verifyResponse = await request.get(verifyUrl);
  expect(verifyResponse.status(), "verify endpoint should redirect or 200").toBeLessThan(400);

  const sessionResponse = await request.get("/api/auth/get-session");
  expect(sessionResponse.ok()).toBeTruthy();
  const session = await sessionResponse.json();
  expect(session?.user?.email).toBe(email);
});
