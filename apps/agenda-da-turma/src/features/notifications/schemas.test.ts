import { describe, expect, it } from "vitest";
import { suggestReminder } from "./reminder-suggestion";
import { isAllowedPushEndpoint, isQuietHour, notificationPreferencesSchema } from "./schemas";

describe("notification consent and timing", () => {
  it("handles quiet hours across midnight with an exclusive end", () => {
    expect([20, 21, 0, 6, 7].map((hour) => isQuietHour(hour, 21, 7))).toEqual([
      false,
      true,
      true,
      true,
      false,
    ]);
    expect(isQuietHour(12, 9, 17)).toBe(true);
    expect(isQuietHour(12, 9, 9)).toBe(false);
  });
  it("rejects a digest scheduled inside quiet hours", () => {
    expect(
      notificationPreferencesSchema.safeParse({
        emailEnabled: true,
        pushEnabled: false,
        digestHour: 23,
        quietStart: 21,
        quietEnd: 7,
      }).success,
    ).toBe(false);
  });
  it("suggests preparation without creating a school deadline", () => {
    expect(suggestReminder({ type: "material", dueAt: null })).toBeNull();
    expect(suggestReminder({ type: "material", dueAt: "2026-09-18" })).toBe(
      "2026-09-16T22:00:00.000Z",
    );
    expect(suggestReminder({ type: "event", dueAt: "2026-09-18" })).toBe(
      "2026-09-17T22:00:00.000Z",
    );
  });
  it.each([
    "http://127.0.0.1/push",
    "https://localhost/push",
    "https://fcm.googleapis.com.attacker.test/push",
    "https://fcm.googleapis.com:8443/push",
    "https://me:secret@fcm.googleapis.com/push",
    "https://169.254.169.254/latest/meta-data",
    "https://attacker.test/push",
  ])("rejects arbitrary outbound endpoint %s", (url) =>
    expect(isAllowedPushEndpoint(url)).toBe(false),
  );
  it.each([
    "https://fcm.googleapis.com/fcm/send/test",
    "https://web.push.apple.com/test",
    "https://updates.push.services.mozilla.com/wpush/test",
    "https://wns.notify.windows.com/test",
  ])("accepts browser provider %s", (url) => expect(isAllowedPushEndpoint(url)).toBe(true));
});
