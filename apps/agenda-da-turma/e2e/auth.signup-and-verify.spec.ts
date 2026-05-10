import { expect, test } from "@playwright/test";
import { extractOtp, waitForEmail } from "./fixtures/email";

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}@e2e.local`;
}

function authHeaders(baseURL: string | undefined) {
  const origin = baseURL ?? process.env.E2E_BASE_URL ?? "http://localhost:3001";
  return {
    Origin: origin,
    Referer: `${origin}/signup`,
  };
}

test("signup -> verify email by OTP -> auto sign-in", async ({ request, baseURL }) => {
  const email = uniqueEmail("agenda-signup");
  const password = "S3cretP4ss!";
  const headers = authHeaders(baseURL);

  const signupResponse = await request.post("/api/auth/sign-up/email", {
    data: { name: "E2E User", email, password },
    headers,
  });
  expect(signupResponse.ok(), `sign-up failed: ${await signupResponse.text()}`).toBeTruthy();

  const verificationEmail = await waitForEmail({ to: email, category: "auth.verify-email-otp" });
  const otp = extractOtp(verificationEmail);

  const verifyResponse = await request.post("/api/auth/email-otp/verify-email", {
    data: { email, otp },
    headers,
  });
  expect(verifyResponse.ok(), `verify failed: ${await verifyResponse.text()}`).toBeTruthy();

  const sessionResponse = await request.get("/api/auth/get-session");
  expect(sessionResponse.ok()).toBeTruthy();
  const session = await sessionResponse.json();
  expect(session?.user?.email).toBe(email);
});
