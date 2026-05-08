import { describe, expect, it, vi } from "vitest";

const createAnthropicSDKMock = vi.hoisted(() => vi.fn());
const createOpenAISDKMock = vi.hoisted(() => vi.fn());
const createOpenRouterSDKMock = vi.hoisted(() => vi.fn());

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: createAnthropicSDKMock,
}));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: createOpenAISDKMock,
}));

vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: createOpenRouterSDKMock,
}));

import { createAnthropic, createOpenAI, createOpenRouter } from "../providers";

describe("createOpenRouter", () => {
  it("forwards apiKey to the underlying SDK", () => {
    createOpenRouter({ apiKey: "sk-or-test" });
    expect(createOpenRouterSDKMock).toHaveBeenCalledWith({ apiKey: "sk-or-test" });
  });

  it("forwards optional baseURL when provided", () => {
    createOpenRouter({ apiKey: "sk-or-test", baseURL: "https://example.com/api/v1" });
    expect(createOpenRouterSDKMock).toHaveBeenCalledWith({
      apiKey: "sk-or-test",
      baseURL: "https://example.com/api/v1",
    });
  });

  it("forwards attribution headers when provided", () => {
    createOpenRouter({
      apiKey: "sk-or-test",
      headers: { "HTTP-Referer": "https://cozya.app", "X-OpenRouter-Title": "Cozya" },
    });
    expect(createOpenRouterSDKMock).toHaveBeenCalledWith({
      apiKey: "sk-or-test",
      headers: { "HTTP-Referer": "https://cozya.app", "X-OpenRouter-Title": "Cozya" },
    });
  });

  it("forwards official app attribution fields, extraBody and compatibility", () => {
    createOpenRouterSDKMock.mockClear();
    createOpenRouter({
      apiKey: "sk-or-test",
      appName: "Cozya",
      appUrl: "https://cozya.app",
      compatibility: "strict",
      extraBody: { transforms: ["middle-out"] },
    });
    expect(createOpenRouterSDKMock).toHaveBeenCalledWith({
      apiKey: "sk-or-test",
      appName: "Cozya",
      appUrl: "https://cozya.app",
      compatibility: "strict",
      extraBody: { transforms: ["middle-out"] },
    });
  });

  it("omits optional fields when not provided", () => {
    createOpenRouterSDKMock.mockClear();
    createOpenRouter({ apiKey: "sk-or-test" });
    const call = createOpenRouterSDKMock.mock.calls[0]?.[0];
    expect(call).toEqual({ apiKey: "sk-or-test" });
    expect(call).not.toHaveProperty("baseURL");
    expect(call).not.toHaveProperty("headers");
  });
});

describe("createOpenAI / createAnthropic basic forwarding", () => {
  it("createOpenAI forwards apiKey + optional baseURL", () => {
    createOpenAISDKMock.mockClear();
    createOpenAI({ apiKey: "sk-test", baseURL: "https://openrouter.ai/api/v1" });
    expect(createOpenAISDKMock).toHaveBeenCalledWith({
      apiKey: "sk-test",
      baseURL: "https://openrouter.ai/api/v1",
    });
  });

  it("createAnthropic forwards apiKey", () => {
    createAnthropicSDKMock.mockClear();
    createAnthropic({ apiKey: "sk-ant-test" });
    expect(createAnthropicSDKMock).toHaveBeenCalledWith({ apiKey: "sk-ant-test" });
  });
});
