import { describe, expect, it } from "vitest";
import { CustomerNotFoundError, OrganizationsDisabledError } from "../errors";
import { createPortalSession, type PortalDeps } from "../portal";
import { createFakeDb } from "./_fake-db";
import { createFakeProvider } from "./_fake-provider";

const userSubject = { type: "user" as const, id: "user-1" };
const orgSubject = { type: "organization" as const, id: "org-1" };

function makeDeps(overrides: Partial<PortalDeps> = {}): PortalDeps {
  const { db } = createFakeDb();
  const { provider } = createFakeProvider();
  return {
    db: db as never,
    provider: "stripe",
    providerClient: provider,
    organizationsEnabled: true,
    ...overrides,
  };
}

describe("createPortalSession", () => {
  it("returns the portal url when customer exists", async () => {
    const { db } = createFakeDb({
      selectResult: [{ providerCustomerId: "cus_test_1" }],
    });
    const { provider } = createFakeProvider({
      portalSession: { url: "https://billing.stripe.com/p/session_abc" },
    });
    const deps = makeDeps({ db: db as never, providerClient: provider });
    const result = await createPortalSession(deps, {
      subject: userSubject,
      returnUrl: "https://app.example.com/billing",
    });
    expect(result.url).toBe("https://billing.stripe.com/p/session_abc");
    expect(provider.createPortalSession).toHaveBeenCalledWith({
      customerId: "cus_test_1",
      returnUrl: "https://app.example.com/billing",
    });
  });

  it("throws CustomerNotFoundError when no local customer for subject", async () => {
    const { db } = createFakeDb({ selectResult: [] });
    const deps = makeDeps({ db: db as never });
    await expect(
      createPortalSession(deps, {
        subject: userSubject,
        returnUrl: "https://app.example.com/billing",
      }),
    ).rejects.toThrow(CustomerNotFoundError);
  });

  it("rejects organization subject when organizationsEnabled=false", async () => {
    const deps = makeDeps({ organizationsEnabled: false });
    await expect(
      createPortalSession(deps, {
        subject: orgSubject,
        returnUrl: "https://app.example.com/billing",
      }),
    ).rejects.toThrow(OrganizationsDisabledError);
  });
});
