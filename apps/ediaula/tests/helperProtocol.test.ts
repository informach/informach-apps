import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type DisplayList,
  duplicationOutput,
  glideResultSchema,
  haltResultSchema,
  inputReplySchema,
  listSchema,
  parseHookLine,
} from "../src/shared/helperProtocol.ts";

test("every hook line the helper writes parses into its event", () => {
  const lines = [
    '{"e":"ready","t":1234.5,"pid":42,"v":"0.1.0","keys":true}',
    '{"e":"hb","t":1500,"q":0,"drop":0,"hook":"ok","re":0,"out":3,"jq":1}',
    '{"e":"pause","t":1500.5}',
    '{"e":"resume","t":1500.75}',
    '{"e":"front","t":1500.8,"hwnd":"6883070","on":true}',
    '{"e":"health","t":1500.9,"hook":"keys"}',
    '{"e":"m","t":1501.25,"x":-1920,"y":40}',
    '{"e":"m","t":1502,"x":10,"y":40,"src":"p","ui":true,"inj":true}',
    '{"e":"d","t":1503,"x":10,"y":40,"b":"left"}',
    '{"e":"u","t":1504,"x":10,"y":40,"b":"x2","inj":true}',
    '{"e":"w","t":1505,"x":10,"y":40,"d":-120,"h":true}',
    '{"e":"k","t":1506,"vk":67,"m":"1000"}',
    '{"e":"c","t":1507,"id":"0123456789abcdef"}',
    '{"e":"img","id":"hand","hash":"0123456789abcdef","w":32,"h":32,"hx":8,"hy":0,"file":"cursors/0123456789abcdef.png","std":"hand","inv":0}',
    '{"e":"img","id":"0123456789abcdef","hash":"0123456789abcdef","w":32,"h":32,"hx":3,"hy":5,"file":null,"std":null,"inv":64}',
    '{"e":"health","t":1508,"hook":"dead"}',
    '{"e":"win","t":1509,"hwnd":"6883070","rect":{"x":0,"y":0,"w":1280,"h":720},"min":false,"fg":true}',
    '{"e":"win","t":1510,"hwnd":"6883070","gone":true}',
    '{"e":"caret","t":1511,"x":100,"y":200,"w":1,"h":18}',
    '{"e":"ack","t":1512,"cmd":"keys"}',
    '{"e":"error","t":1513,"cmd":"?","msg":"JSON primitivo inválido"}',
    '{"e":"bye","t":1514,"drop":0}',
  ];
  for (const line of lines) {
    const event = parseHookLine(line);
    assert.ok(event, line);
    assert.equal(event.e, JSON.parse(line).e);
  }
});

test("lines outside the protocol are rejected instead of guessed", () => {
  for (const line of [
    "",
    "READY 1234.5",
    "M 1 2 3 arrow",
    "{not json}",
    '{"e":"m","t":1,"x":1}',
    '{"e":"m","t":1,"x":1.5,"y":2}',
    '{"e":"m","t":-1,"x":1,"y":2}',
    '{"e":"m","t":1,"x":1,"y":2,"extra":true}',
    '{"e":"d","t":1,"x":1,"y":2,"b":"wheel"}',
    '{"e":"k","t":1,"vk":67,"m":"10"}',
    '{"e":"k","t":1,"vk":0,"m":"1000"}',
    '{"e":"img","id":"x","hash":"short","w":32,"h":32,"hx":0,"hy":0,"file":null,"std":null,"inv":0}',
    '{"e":"img","id":"x","hash":"0123456789abcdef","w":32,"h":32,"hx":0,"hy":0,"file":"../../evil.png","std":null,"inv":0}',
    '{"e":"win","t":1,"hwnd":"0x1F"}',
    '{"e":"hb","t":1,"q":0,"drop":0,"hook":"maybe","re":0,"out":0,"jq":0}',
    '{"e":"hb","t":1,"q":0,"drop":0,"hook":"ok","re":0,"out":0}',
    '{"e":"front","t":1,"hwnd":"12","on":"yes"}',
    '{"e":"nope","t":1}',
    "[1,2,3]",
  ])
    assert.equal(parseHookLine(line), undefined, line);
});

const list: DisplayList = listSchema.parse({
  e: "list",
  v: "0.1.0",
  monitors: [
    {
      index: 0,
      device: "\\\\.\\DISPLAY1",
      x: 2560,
      y: 0,
      w: 1920,
      h: 1080,
      work: { x: 2560, y: 0, w: 1920, h: 1040 },
      primary: false,
      dpi: 96,
    },
    {
      index: 1,
      device: "\\\\.\\DISPLAY2",
      x: 0,
      y: 0,
      w: 2560,
      h: 1080,
      work: { x: 0, y: 0, w: 2560, h: 1040 },
      primary: true,
      dpi: 120,
    },
    {
      index: 2,
      device: "\\\\.\\DISPLAY3",
      x: -1920,
      y: 0,
      w: 1920,
      h: 1080,
      work: { x: -1920, y: 0, w: 1920, h: 1080 },
      primary: false,
      dpi: 96,
    },
  ],
  outputs: [
    {
      adapter: 0,
      index: 0,
      device: "\\\\.\\DISPLAY2",
      x: 0,
      y: 0,
      w: 2560,
      h: 1080,
      attached: true,
      rotation: 1,
      gpu: "GPU A",
    },
    {
      adapter: 0,
      index: 1,
      device: "\\\\.\\DISPLAY1",
      x: 2560,
      y: 0,
      w: 1920,
      h: 1080,
      attached: true,
      rotation: 1,
      gpu: "GPU A",
    },
    {
      adapter: 1,
      index: 0,
      device: "\\\\.\\DISPLAY3",
      x: -1920,
      y: 0,
      w: 1920,
      h: 1080,
      attached: true,
      rotation: 1,
      gpu: "GPU B",
    },
  ],
  windows: [],
});

test("monitors map to ddagrab outputs by device name, whatever order Windows lists them", () => {
  assert.equal(duplicationOutput(list, list.monitors[0]), 1);
  assert.equal(duplicationOutput(list, list.monitors[1]), 0);
  // ddagrab opens the default adapter: a monitor on the second GPU cannot be recorded.
  assert.equal(duplicationOutput(list, list.monitors[2]), -1);
});

test("input replies and glide results follow the guided protocol", () => {
  assert.deepEqual(inputReplySchema.parse({ ready: true }), { ready: true });
  assert.ok(inputReplySchema.safeParse({ id: 3, ok: true, result: null }).success);
  assert.ok(
    inputReplySchema.safeParse({ id: null, ok: false, error: "Comando inválido." }).success,
  );
  assert.equal(inputReplySchema.safeParse({ id: 1, ok: false }).success, false);
  assert.equal(
    inputReplySchema.safeParse({ id: 1, ok: true, result: 1, error: "x" }).success,
    false,
  );
  assert.deepEqual(glideResultSchema.parse({ x: 1, y: 2, at: 1 }), { x: 1, y: 2, at: 1 });
  assert.ok(glideResultSchema.safeParse({ x: 1, y: 2, at: 0.4, late: 0.25 }).success);
  assert.ok(glideResultSchema.safeParse({ x: 1, y: 2, at: 0.4, halted: true }).success);
  assert.equal(glideResultSchema.safeParse({ x: 1, y: 2, at: 1.2 }).success, false);
  assert.deepEqual(haltResultSchema.parse({ halted: false }), { halted: false });
  assert.equal(haltResultSchema.safeParse(null).success, false);
});
