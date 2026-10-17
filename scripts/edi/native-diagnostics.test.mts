import { describe, expect, it } from "vitest";
import { sanitizeNativeDiagnostic } from "./native-diagnostics.mts";

describe("native startup diagnostics", () => {
  it("removes test paths, credentials and URL data while retaining error codes", () => {
    const diagnostic = sanitizeNativeDiagnostic(
      "EACCES C:\\test\\profile\\session.bin https://example.test/path?token=sensitive " +
        'Authorization: Bearer credential {"access_token":"access","refresh_token":"refresh"} ' +
        "password=private secret=value privateKey=encoded",
      ["C:\\test", "C:\\test\\profile"],
    );
    expect(diagnostic).toContain("EACCES <test-path>\\session.bin");
    expect(diagnostic).not.toMatch(
      /sensitive|credential|"access"|"refresh"|private\b|value|encoded/,
    );
    expect(diagnostic).toContain("<url>");
  });

  it("removes multiline private keys from stderr", () => {
    expect(
      sanitizeNativeDiagnostic(
        "failure\n-----BEGIN PRIVATE KEY-----\nprivate-content\n-----END PRIVATE KEY-----\nend",
        [],
      ),
    ).toBe("failure\n<private-key>\nend");
  });
});
