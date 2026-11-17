import { afterEach, expect, it, vi } from "vitest";
import { createInformachAuthClient } from "./client";

afterEach(() => vi.unstubAllGlobals());

it.each(["manual", "automatic"] as const)(
  "%s navigation uses the installed client without consuming an OAuth callback twice",
  async (redirectMode) => {
    const navigations: string[] = [];
    const callback =
      "http://localhost:3001/api/auth/callback/informach-agenda-da-turma?code=synthetic&state=synthetic";
    const location = {
      origin: "http://localhost:3011",
      search: "?client_id=fixture&ba_param=client_id&sig=synthetic",
      get href() {
        return "http://localhost:3011/entrar";
      },
      set href(value: string) {
        navigations.push(value);
      },
    };
    vi.stubGlobal("window", { location });
    const fetch = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ url: callback, redirect: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetch);
    const client = createInformachAuthClient({
      baseURL: location.origin,
      webSsoProvider: true,
      redirectMode,
      email: { signIn: { magicLink: false } },
    });
    const result = await client.signIn.email({
      email: "synthetic@example.test",
      password: "synthetic-password",
    });
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({ url: callback, redirect: true });
    expect(navigations).toEqual(redirectMode === "manual" ? [] : [callback]);
    expect(fetch).toHaveBeenCalledTimes(1);
    // Disabling automatic navigation retains the provider's signed login continuation.
    const request = fetch.mock.calls[0];
    expect(JSON.parse(String(request?.[1]?.body))).toMatchObject({
      oauth_query: expect.any(String),
    });
  },
);
