import { beforeEach, describe, expect, it, vi } from "vitest";
import { RateLimitedError } from "@/lib/rate-limit";
import { POST } from "./route";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  legacy: vi.fn(),
  landing: vi.fn(),
  limit: vi.fn(),
  warn: vi.fn(),
}));
vi.mock("@/features/metrics/events", () => ({ recordProductEvent: mocks.legacy }));
vi.mock("@/features/metrics/landing-events", () => ({ recordLandingEvent: mocks.landing }));
vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "https://agenda.test" } }));
vi.mock("@/lib/logger", () => ({ logger: { warn: mocks.warn } }));
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return { ...actual, enforceRateLimit: mocks.limit };
});
vi.mock("@/lib/redis", () => ({ redis: null }));

const view = { event: "landing_view", variant: "pagina-do-dia-v1" };
function request(body?: unknown, headers: Record<string, string> = {}) {
  return new Request("https://agenda.test/api/product-event", {
    method: "POST",
    headers: { origin: "https://agenda.test", "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}
describe("public landing events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.limit.mockResolvedValue(undefined);
    mocks.landing.mockResolvedValue(undefined);
  });
  it("preserves empty-body signup clicks without turning them into page views", async () => {
    expect((await POST(request())).status).toBe(204);
    expect(mocks.legacy).toHaveBeenCalledWith(null, { event: "qualified_visit" });
    expect(mocks.landing).not.toHaveBeenCalled();
    expect(mocks.limit).toHaveBeenCalledWith(expect.objectContaining({ limit: 30 }));
  });
  it.each([
    view,
    {
      event: "landing_cta",
      variant: view.variant,
      placement: "pricing",
      selection: { plan: "pro", cycle: "annual" },
      firstCta: true,
    },
    { event: "landing_demo", variant: view.variant, scenario: "passeio", action: "plan" },
  ])("accepts the bounded public event %o", async (body) => {
    expect((await POST(request(body))).status).toBe(204);
    expect(mocks.landing).toHaveBeenCalledWith(body);
    expect(mocks.legacy).not.toHaveBeenCalled();
  });
  it.each([
    { ...view, name: "Child name" },
    { ...view, event: "signup" },
    { ...view, variant: "anything" },
    {
      event: "landing_cta",
      variant: view.variant,
      placement: "pricing",
      selection: { plan: "pro" },
      firstCta: true,
    },
    {
      event: "landing_cta",
      variant: view.variant,
      placement: "hero",
      selection: { plan: "free", cycle: "annual" },
      firstCta: true,
    },
    { event: "landing_demo", variant: view.variant, scenario: "private text", action: "plan" },
    "{invalid json",
  ])("rejects arbitrary or malformed content %o", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(mocks.landing).not.toHaveBeenCalled();
    expect(mocks.legacy).not.toHaveBeenCalled();
  });
  it("rejects cross-origin requests before reading or recording", async () => {
    expect((await POST(request(view, { origin: "https://other.test" }))).status).toBe(403);
    expect(mocks.limit).not.toHaveBeenCalled();
  });
  it("requires JSON for the new contract", async () => {
    expect((await POST(request(view, { "content-type": "text/plain" }))).status).toBe(415);
    expect(mocks.landing).not.toHaveBeenCalled();
  });
  it("enforces byte limits even without Content-Length", async () => {
    expect((await POST(request("x".repeat(1025)))).status).toBe(413);
    expect(mocks.landing).not.toHaveBeenCalled();
  });
  it("returns rate-limit retry information without inserting", async () => {
    mocks.limit.mockRejectedValue(new RateLimitedError("test", 120, 3600, 20));
    const response = await POST(request(view));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("20");
    expect(mocks.landing).not.toHaveBeenCalled();
  });
  it("does not claim a successful record when storage fails", async () => {
    mocks.landing.mockRejectedValue(new Error("private storage detail"));
    expect((await POST(request(view))).status).toBe(503);
    expect(mocks.warn).toHaveBeenCalledWith("agenda.landing.write_failed");
  });
});
