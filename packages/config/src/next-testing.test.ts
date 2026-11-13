import { expect, it } from "vitest";
import { isolatedNextOptions } from "./next-testing";

it("never changes normal builds and rejects unsafe fixture identifiers or databases", () => {
  expect(isolatedNextOptions({})).toEqual({});
  const environment = {
    COMPASSO_TEST_RUN_ID: "1234567890abcdef12345678",
    COMPASSO_ISOLATED_DATABASE: "1",
    DATABASE_URL: "postgres://test@127.0.0.1:5432/postgres",
  };
  expect(isolatedNextOptions(environment)).toEqual({
    distDir: ".next-compasso-1234567890abcdef12345678",
    typescript: { tsconfigPath: ".compasso-tsconfig-1234567890abcdef12345678.json" },
  });
  expect(() =>
    isolatedNextOptions({ ...environment, COMPASSO_TEST_RUN_ID: "../../user-data" }),
  ).toThrow();
  expect(() => isolatedNextOptions({ ...environment, COMPASSO_ISOLATED_DATABASE: "" })).toThrow();
  expect(() =>
    isolatedNextOptions({
      ...environment,
      DATABASE_URL: "postgres://test@remote.invalid/database",
    }),
  ).toThrow();
});
