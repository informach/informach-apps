import { EDI_DESKTOP_APPS } from "@informach/config/edi-tools";
import { EDI_ARTIFACT_APP_IDS } from "@informach/db/schema";
import { describe, expect, it } from "vitest";

describe("release artifact catalog", () => {
  it("lets the database accept exactly the suite's desktop apps", () => {
    // A new tool must also reach edi_artifacts_app_chk through a new migration.
    expect([...EDI_ARTIFACT_APP_IDS]).toEqual(EDI_DESKTOP_APPS.map((app) => app.id));
  });
});
