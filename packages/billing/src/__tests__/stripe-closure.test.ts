import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { createStripeProvider } from "../providers/stripe";

// Real pinned SDK and pagination/form encoding; only HTTP is synthetic.
function setup(failure?: "checkout" | "schedule") {
  const requests: { method: string; path: string }[] = [];
  const sessions = Array.from({ length: 107 }, (_, i) => ({ id: `cs_${i}`, status: "open" }));
  const subscriptions = [
    { id: "sub_scheduled", status: "active" },
    { id: "sub_unprojected", status: "active" },
    { id: "sub_pending", status: "incomplete" },
    { id: "sub_old", status: "canceled" },
  ];
  const schedules: { id: string; status: string; subscription: string | null }[] = [
    ...Array.from({ length: 101 }, (_, i) => ({
      id: `sub_sched_future_${i}`,
      status: "not_started",
      subscription: null,
    })),
    { id: "sub_sched_active", status: "active", subscription: "sub_scheduled" },
    { id: "sub_sched_old", status: "released", subscription: null },
  ];
  const page = <T extends { id: string }>(rows: T[], url: URL) => {
    expect(url.searchParams.get("customer")).toBe("cus_app_only");
    const after = url.searchParams.get("starting_after");
    const start = after ? rows.findIndex((row) => row.id === after) + 1 : 0;
    const limit = Number(url.searchParams.get("limit"));
    expect(limit).toBe(100);
    return Response.json({
      object: "list",
      url: url.pathname,
      data: rows.slice(start, start + limit),
      has_more: start + limit < rows.length,
    });
  };
  const fetcher: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url),
      body = new URLSearchParams(await request.text());
    requests.push({ method: request.method, path: url.pathname });
    if (request.method === "GET") {
      if (url.pathname === "/v1/checkout/sessions")
        return page(
          sessions.filter((s) => s.status === "open"),
          url,
        );
      if (url.pathname === "/v1/subscription_schedules") return page(schedules, url);
      if (url.pathname === "/v1/subscriptions") return page(subscriptions, url);
    }
    const resource = url.pathname.split("/").at(request.method === "DELETE" ? -1 : -2);
    if (url.pathname.endsWith("/expire")) {
      if (failure === "checkout")
        return Response.json(
          { error: { type: "invalid_request_error", message: "checkout already complete" } },
          { status: 400 },
        );
      const row = sessions.find((item) => item.id === resource);
      if (!row) throw new Error("Unexpected checkout");
      row.status = "expired";
      return Response.json(row);
    }
    if (url.pathname.endsWith("/cancel")) {
      if (failure === "schedule")
        return Response.json(
          { error: { type: "invalid_request_error", message: "schedule changed" } },
          { status: 400 },
        );
      const row = schedules.find((item) => item.id === resource);
      if (!row) throw new Error("Unexpected schedule");
      expect(body.get("invoice_now")).toBe("false");
      expect(body.get("prorate")).toBe("false");
      row.status = "canceled";
      const subscription = subscriptions.find((item) => item.id === row.subscription);
      if (subscription) subscription.status = "canceled";
      return Response.json(row);
    }
    if (request.method === "DELETE" && url.pathname.startsWith("/v1/subscriptions/")) {
      const row = subscriptions.find((item) => item.id === resource);
      if (!row) throw new Error("Unexpected subscription");
      expect(url.searchParams.get("invoice_now")).toBe("false");
      expect(url.searchParams.get("prorate")).toBe("false");
      row.status = "canceled";
      return Response.json(row);
    }
    throw new Error(`Unexpected Stripe fixture request: ${request.method} ${url.pathname}`);
  };
  const client = new Stripe("sk_test_synthetic_closure", {
    apiVersion: "2026-04-22.dahlia",
    maxNetworkRetries: 0,
    httpClient: Stripe.createFetchHttpClient(fetcher),
  });
  const provider = createStripeProvider({
    secretKey: "unused",
    webhookSecret: "unused",
    appName: "test",
    client,
  });
  return { provider, requests, sessions, schedules, subscriptions };
}
describe("provider closure", () => {
  it("closes every page, including schedules without subscriptions, without final invoices or prorations", async () => {
    const f = setup();
    const result = await f.provider.closeCustomerSubscriptions?.("cus_app_only");
    expect(f.sessions.every((row) => row.status === "expired")).toBe(true);
    expect(f.schedules.every((row) => ["canceled", "released"].includes(row.status))).toBe(true);
    expect(f.subscriptions.every((row) => row.status === "canceled")).toBe(true);
    expect(result).toEqual({
      expired: 107,
      canceled: 3,
      subscriptionIds: ["sub_scheduled", "sub_unprojected", "sub_pending", "sub_old"],
    });
    expect(f.requests.filter((r) => r.path === "/v1/subscription_schedules")).toHaveLength(2);
    expect(f.requests.filter((r) => r.path === "/v1/checkout/sessions")).toHaveLength(2);
    const mutations = f.requests.filter((r) => r.method !== "GET").length;
    const replay = await f.provider.closeCustomerSubscriptions?.("cus_app_only");
    expect(replay).toMatchObject({ expired: 0, canceled: 0 });
    expect(f.requests.filter((r) => r.method !== "GET")).toHaveLength(mutations);
  });
  it.each(["checkout", "schedule"] as const)(
    "stops on a raced %s instead of certifying closure",
    async (failure) => {
      const f = setup(failure);
      await expect(f.provider.closeCustomerSubscriptions?.("cus_app_only")).rejects.toThrow(
        failure === "checkout" ? "checkout already complete" : "schedule changed",
      );
      expect(f.requests.some((r) => r.path === "/v1/subscriptions")).toBe(false);
    },
  );
});
