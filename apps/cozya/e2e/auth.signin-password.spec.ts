import { expect, test } from "@playwright/test";
import { extractFirstUrl, waitForEmail } from "./fixtures/email";

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}@e2e.local`;
}

test.describe("password sign-in", () => {
  test("rejects credentials before email is verified", async ({ request }) => {
    const email = uniqueEmail("cozya-signin-unverified");
    const password = "S3cretP4ss!";

    const signupResponse = await request.post("/api/auth/sign-up/email", {
      data: { name: "Unverified", email, password },
    });
    expect(signupResponse.ok()).toBeTruthy();

    const signinResponse = await request.post("/api/auth/sign-in/email", {
      data: { email, password },
    });
    expect(signinResponse.status(), "unverified user should not sign in").toBeGreaterThanOrEqual(
      400,
    );
  });

  test("rejects wrong password after verification", async ({ request }) => {
    const email = uniqueEmail("cozya-signin-wrongpw");
    const password = "S3cretP4ss!";

    await request.post("/api/auth/sign-up/email", {
      data: { name: "Verified", email, password },
    });
    const verificationEmail = await waitForEmail({
      to: email,
      category: "auth.verify-email",
    });
    await request.get(extractFirstUrl(verificationEmail, "/verify-email"));

    const signinResponse = await request.post("/api/auth/sign-in/email", {
      data: { email, password: "WrongPassword!" },
    });
    expect(signinResponse.status()).toBeGreaterThanOrEqual(400);
  });

  test("accepts correct credentials after verification", async ({ request }) => {
    const email = uniqueEmail("cozya-signin-ok");
    const password = "S3cretP4ss!";

    await request.post("/api/auth/sign-up/email", {
      data: { name: "Verified", email, password },
    });
    const verificationEmail = await waitForEmail({
      to: email,
      category: "auth.verify-email",
    });
    await request.get(extractFirstUrl(verificationEmail, "/verify-email"));

    const signinResponse = await request.post("/api/auth/sign-in/email", {
      data: { email, password },
    });
    expect(signinResponse.ok(), `sign-in failed: ${await signinResponse.text()}`).toBeTruthy();

    const sessionResponse = await request.get("/api/auth/get-session");
    const session = await sessionResponse.json();
    expect(session?.user?.email).toBe(email);
  });
});
