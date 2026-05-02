import { type APIRequestContext, expect, test } from "@playwright/test";
import { extractOtp, waitForEmail } from "./fixtures/email";

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}@e2e.local`;
}

function authHeaders(baseURL: string | undefined) {
  const origin = baseURL ?? process.env.E2E_BASE_URL ?? "http://localhost:3102";
  return {
    Origin: origin,
    Referer: `${origin}/login`,
  };
}

async function createVerifiedUser(
  request: APIRequestContext,
  baseURL: string | undefined,
): Promise<string> {
  const email = uniqueEmail("cozya-signin-otp");
  const password = "S3cretP4ss!";
  const headers = authHeaders(baseURL);

  const signupResponse = await request.post("/api/auth/sign-up/email", {
    data: { name: "OTP User", email, password },
    headers,
  });
  expect(signupResponse.ok(), `sign-up failed: ${await signupResponse.text()}`).toBeTruthy();

  const verificationEmail = await waitForEmail({ to: email, category: "auth.verify-email-otp" });
  const verificationOtp = extractOtp(verificationEmail);
  const verifyResponse = await request.post("/api/auth/email-otp/verify-email", {
    data: { email, otp: verificationOtp },
    headers,
  });
  expect(verifyResponse.ok(), `verify failed: ${await verifyResponse.text()}`).toBeTruthy();

  await request.post("/api/auth/sign-out", { headers });
  return email;
}

test("existing user signs in with email OTP", async ({ request, baseURL }) => {
  const headers = authHeaders(baseURL);
  const email = await createVerifiedUser(request, baseURL);

  const otpRequest = await request.post("/api/auth/email-otp/send-verification-otp", {
    data: { email, type: "sign-in" },
    headers,
  });
  expect(otpRequest.ok(), `OTP request failed: ${await otpRequest.text()}`).toBeTruthy();

  const signInEmail = await waitForEmail({ to: email, category: "auth.sign-in-otp" });
  const otp = extractOtp(signInEmail);
  const signInResponse = await request.post("/api/auth/sign-in/email-otp", {
    data: { email, otp },
    headers,
  });
  expect(signInResponse.ok(), `sign-in failed: ${await signInResponse.text()}`).toBeTruthy();

  const sessionResponse = await request.get("/api/auth/get-session");
  const session = await sessionResponse.json();
  expect(session?.user?.email).toBe(email);
});
