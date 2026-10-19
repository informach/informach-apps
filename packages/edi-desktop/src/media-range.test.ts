import { expect, it } from "vitest";
import { byteRange, rangeHeaders, rangeNotSatisfiable } from "./media-range.ts";

it("parses whole, open, closed and suffix ranges inside the file", () => {
  expect(byteRange(null, 100)).toEqual({ start: 0, end: 99, partial: false });
  expect(byteRange("bytes=10-", 100)).toEqual({ start: 10, end: 99, partial: true });
  expect(byteRange("bytes=10-19", 100)).toEqual({ start: 10, end: 19, partial: true });
  expect(byteRange("bytes=90-500", 100)).toEqual({ start: 90, end: 99, partial: true });
  expect(byteRange("bytes=-5", 100)).toEqual({ start: 95, end: 99, partial: true });
  expect(byteRange("bytes=-500", 100)).toEqual({ start: 0, end: 99, partial: true });
});

it("refuses multiple, malformed, unsafe and out-of-file ranges", () => {
  for (const value of [
    "bytes=0-1,4-5",
    "bytes=-",
    "items=0-1",
    "bytes=a-b",
    " bytes=0-1",
    "bytes=100-",
    "bytes=20-10",
    "bytes=-0",
    "bytes=99999999999999999999-",
  ])
    expect(() => byteRange(value, 100), value).toThrow();
  expect(() => byteRange("bytes=0-", 0)).toThrow();
});

it("answers with exact lengths and never lets the browser cache or sniff", () => {
  expect(rangeHeaders(byteRange("bytes=10-19", 100), 100, "video/mp4")).toEqual({
    "Content-Type": "video/mp4",
    "Content-Length": "10",
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Range": "bytes 10-19/100",
  });
  expect(rangeHeaders(byteRange(null, 0), 0, "video/mp4")["Content-Length"]).toBe("0");
  const refused = rangeNotSatisfiable(100, { "Access-Control-Allow-Origin": "*" });
  expect(refused.status).toBe(416);
  expect(refused.headers.get("content-range")).toBe("bytes */100");
  expect(refused.headers.get("access-control-allow-origin")).toBe("*");
});
