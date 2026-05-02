import { describe, expect, it } from "vitest";
import { getOrCreateCustomer } from "../customers";
import { OrganizationsDisabledError } from "../errors";
import { createFakeDb } from "./_fake-db";
import { createFakeProvider } from "./_fake-provider";

const userSubject = { type: "user" as const, id: "user-1" };
const orgSubject = { type: "organization" as const, id: "org-1" };

describe("getOrCreateCustomer", () => {
  it("returns the existing row when the customer is already present", async () => {
    const { db, calls } = createFakeDb({
      selectResult: [{ id: "row-1", providerCustomerId: "cus_existing" }],
    });
    const { provider } = createFakeProvider();

    const result = await getOrCreateCustomer(
      {
        db: db as never,
        provider: "stripe",
        providerClient: provider,
        organizationsEnabled: true,
      },
      { subject: userSubject, email: "user@example.com" },
    );

    expect(result).toEqual({
      customerId: "row-1",
      providerCustomerId: "cus_existing",
      isNew: false,
    });
    expect(provider.createCustomer).not.toHaveBeenCalled();
    expect(calls.filter((c) => c.mode === "select")).toHaveLength(1);
  });

  it("creates a new provider customer and persists it when missing", async () => {
    const { db, calls } = createFakeDb({
      selectQueue: [[]],
      insertResult: [{ id: "row-new", providerCustomerId: "cus_new_1" }],
    });
    const { provider, createCustomerCalls } = createFakeProvider({
      customerIdSequence: ["cus_new_1"],
    });

    const result = await getOrCreateCustomer(
      {
        db: db as never,
        provider: "stripe",
        providerClient: provider,
        organizationsEnabled: true,
      },
      { subject: userSubject, email: "new@example.com" },
    );

    expect(result).toEqual({
      customerId: "row-new",
      providerCustomerId: "cus_new_1",
      isNew: true,
    });
    expect(createCustomerCalls).toEqual([{ email: "new@example.com", subject: userSubject }]);
    expect(calls.filter((c) => c.mode === "insert")).toHaveLength(1);
  });

  it("rejects organization subject when organizationsEnabled=false", async () => {
    const { db } = createFakeDb();
    const { provider } = createFakeProvider();

    await expect(
      getOrCreateCustomer(
        {
          db: db as never,
          provider: "stripe",
          providerClient: provider,
          organizationsEnabled: false,
        },
        { subject: orgSubject, email: "team@example.com" },
      ),
    ).rejects.toThrow(OrganizationsDisabledError);
    expect(provider.createCustomer).not.toHaveBeenCalled();
  });

  it("re-reads the row when insert hits a unique conflict (race)", async () => {
    const { db, calls } = createFakeDb({
      selectQueue: [[], [{ id: "row-winner", providerCustomerId: "cus_winner" }]],
      insertResult: [],
    });
    const { provider } = createFakeProvider({ customerIdSequence: ["cus_loser"] });

    const result = await getOrCreateCustomer(
      {
        db: db as never,
        provider: "stripe",
        providerClient: provider,
        organizationsEnabled: true,
      },
      { subject: userSubject, email: "user@example.com" },
    );

    expect(result).toEqual({
      customerId: "row-winner",
      providerCustomerId: "cus_winner",
      isNew: false,
    });
    expect(calls.filter((c) => c.mode === "select")).toHaveLength(2);
    expect(provider.createCustomer).toHaveBeenCalledTimes(1);
  });

  it("allows organization subject when organizationsEnabled=true", async () => {
    const { db } = createFakeDb({
      selectQueue: [[]],
      insertResult: [{ id: "row-org", providerCustomerId: "cus_org_1" }],
    });
    const { provider, createCustomerCalls } = createFakeProvider({
      customerIdSequence: ["cus_org_1"],
    });

    const result = await getOrCreateCustomer(
      {
        db: db as never,
        provider: "stripe",
        providerClient: provider,
        organizationsEnabled: true,
      },
      { subject: orgSubject, email: "team@example.com" },
    );

    expect(result.providerCustomerId).toBe("cus_org_1");
    expect(createCustomerCalls[0]?.subject).toEqual(orgSubject);
  });
});
