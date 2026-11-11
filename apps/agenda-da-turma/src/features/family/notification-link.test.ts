import { expect, it } from "vitest";
import { notificationDestination } from "./notification-link";

it("only resumes known local notification screens", () => {
  for (const path of [
    "/dashboard",
    "/calendario?date=2026-11-10",
    "/atividades/12345678-1234-1234-1234-123456789012",
  ])
    expect(notificationDestination(path)).toBe(path);
  for (const path of [
    "//example.test",
    "https://example.test",
    "/dashboard/../api",
    "/dashboard?next=https://example.test",
    "javascript:alert(1)",
    ["/dashboard"],
    undefined,
  ])
    expect(notificationDestination(path)).toBeUndefined();
});
