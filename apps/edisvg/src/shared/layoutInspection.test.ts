import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultLayoutContainer, defaultLayoutItem } from "@informach/edi-motion/layout";
import { inspectLayout, inspectLayoutValue } from "./layoutInspection";

test("layout inspection exposes root/items/containers with explicit pagination and strict reads", () => {
  const layout = {
    version: 1 as const,
    root: defaultLayoutContainer(),
    containers: [],
    items: Array.from({ length: 21 }, (_, index) => defaultLayoutItem(`node-${index}`)),
  };
  assert.equal(inspectLayout(layout, { collection: "items" }).nextOffset, 20);
  assert.equal(inspectLayout(layout, { collection: "items", offset: 20 }).items.length, 1);
  assert.deepEqual(
    JSON.parse(inspectLayoutValue(layout, { collection: "root", id: "layout-root" }).value),
    layout.root,
  );
  assert.equal(inspectLayout(undefined, { collection: "root" }).enabled, false);
  assert.throws(() => inspectLayout(layout, { collection: "items", limit: 21 }));
});
