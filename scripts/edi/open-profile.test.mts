import { describe, expect, it } from "vitest";
import { resolveOpenProfile } from "./open-profile.mts";

const base = {
  appData: "C:\\Users\\ana\\AppData\\Roaming",
  temp: "C:\\Users\\ana\\AppData\\Local\\Temp",
  harnessRoot: "C:\\Users\\ana\\AppData\\Local\\Temp\\edi-open-abc",
};

describe("resolveOpenProfile", () => {
  it("throws the test profile away unless EDI_OPEN_USER_DATA keeps it", () => {
    expect(resolveOpenProfile({ ...base, mode: "test", id: "ediaula", env: {} })).toEqual({
      userData: "C:\\Users\\ana\\AppData\\Local\\Temp\\edi-open-abc\\user-data",
      kept: false,
      environment: {},
    });
    expect(
      resolveOpenProfile({
        ...base,
        mode: "test",
        id: "ediaula",
        env: { EDI_OPEN_USER_DATA: "D:\\teste" },
      }),
    ).toMatchObject({ userData: "D:\\teste", kept: true });
    expect(() =>
      resolveOpenProfile({
        ...base,
        mode: "test",
        id: "ediaula",
        env: { EDI_OPEN_USER_DATA: "x" },
      }),
    ).toThrow(/absolute/);
  });

  it("works on the tool's own profile and EdiAula's real Documents", () => {
    expect(resolveOpenProfile({ ...base, mode: "work", id: "ediaula", env: {} })).toEqual({
      userData: "C:\\Users\\ana\\AppData\\Roaming\\ediaula",
      kept: true,
      environment: { EDI_WORK_PROFILE: "true", EDIAULA_REAL_DOCUMENTS: "true" },
    });
    expect(resolveOpenProfile({ ...base, mode: "work", id: "edisvg", env: {} })).toEqual({
      userData: "C:\\Users\\ana\\AppData\\Roaming\\edisvg",
      kept: true,
      environment: { EDI_WORK_PROFILE: "true" },
    });
  });

  it("moves the work profiles with EDI_WORK_DATA, never into the temp folder", () => {
    expect(
      resolveOpenProfile({
        ...base,
        mode: "work",
        id: "edifoto",
        env: { EDI_WORK_DATA: "D:\\Edi" },
      }).userData,
    ).toBe("D:\\Edi\\edifoto");
    expect(() =>
      resolveOpenProfile({
        ...base,
        mode: "work",
        id: "edifoto",
        env: { EDI_WORK_DATA: "c:\\users\\ana\\appdata\\local\\temp\\x" },
      }),
    ).toThrow(/temp/);
    expect(() =>
      resolveOpenProfile({ ...base, mode: "work", id: "edifoto", env: { EDI_WORK_DATA: "Edi" } }),
    ).toThrow(/absolute/);
  });

  it("refuses EDI_OPEN_USER_DATA in work mode instead of silently ignoring it", () => {
    expect(() =>
      resolveOpenProfile({
        ...base,
        mode: "work",
        id: "edipdf",
        env: { EDI_OPEN_USER_DATA: "D:\\teste" },
      }),
    ).toThrow(/EDI_WORK_DATA/);
  });
});
