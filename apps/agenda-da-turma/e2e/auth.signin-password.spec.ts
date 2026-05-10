import { type APIRequestContext, expect, test } from "@playwright/test";
import { extractOtp, waitForEmail } from "./fixtures/email";

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}@e2e.local`;
}

function authHeaders(baseURL: string | undefined, path = "/login") {
  const origin = baseURL ?? process.env.E2E_BASE_URL ?? "http://localhost:3001";
  return {
    Origin: origin,
    Referer: `${origin}${path}`,
  };
}

async function verifyEmail(
  request: APIRequestContext,
  baseURL: string | undefined,
  email: string,
) {
  const verificationEmail = await waitForEmail({
    to: email,
    category: "auth.verify-email-otp",
  });
  const otp = extractOtp(verificationEmail);
  const verifyResponse = await request.post("/api/auth/email-otp/verify-email", {
    data: { email, otp },
    headers: authHeaders(baseURL, "/signup"),
  });
  expect(verifyResponse.ok(), `verify failed: ${await verifyResponse.text()}`).toBeTruthy();
}

test.describe("password sign-in", () => {
  test("rejects credentials before email is verified", async ({ request, baseURL }) => {
    const email = uniqueEmail("agenda-signin-unverified");
    const password = "S3cretP4ss!";
    const headers = authHeaders(baseURL);

    const signupResponse = await request.post("/api/auth/sign-up/email", {
      data: { name: "Unverified", email, password },
      headers: authHeaders(baseURL, "/signup"),
    });
    expect(signupResponse.ok()).toBeTruthy();

    const signinResponse = await request.post("/api/auth/sign-in/email", {
      data: { email, password },
      headers,
    });
    expect(signinResponse.status(), "unverified user should not sign in").toBeGreaterThanOrEqual(
      400,
    );
  });

  test("rejects wrong password after verification", async ({ request, baseURL }) => {
    const email = uniqueEmail("agenda-signin-wrongpw");
    const password = "S3cretP4ss!";
    const headers = authHeaders(baseURL);

    await request.post("/api/auth/sign-up/email", {
      data: { name: "Verified", email, password },
      headers: authHeaders(baseURL, "/signup"),
    });
    await verifyEmail(request, baseURL, email);

    const signinResponse = await request.post("/api/auth/sign-in/email", {
      data: { email, password: "WrongPassword!" },
      headers,
    });
    expect(signinResponse.status()).toBeGreaterThanOrEqual(400);
  });

  test("accepts correct credentials after verification", async ({ request, baseURL }) => {
    const email = uniqueEmail("agenda-signin-ok");
    const password = "S3cretP4ss!";
    const headers = authHeaders(baseURL);

    await request.post("/api/auth/sign-up/email", {
      data: { name: "Verified", email, password },
      headers: authHeaders(baseURL, "/signup"),
    });
    await verifyEmail(request, baseURL, email);

    const signinResponse = await request.post("/api/auth/sign-in/email", {
      data: { email, password },
      headers,
    });
    expect(signinResponse.ok(), `sign-in failed: ${await signinResponse.text()}`).toBeTruthy();

    const sessionResponse = await request.get("/api/auth/get-session");
    const session = await sessionResponse.json();
    expect(session?.user?.email).toBe(email);
  });
});
