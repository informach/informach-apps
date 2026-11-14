import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fixtureHeaders, startFixtureIssuer } from "./fixture-issuer.mjs";

test("test clients have independent password budgets but share the server token budget", () => {
  const peer = "127.0.0.1";
  const headers = {
    "x-real-ip": "198.51.100.12",
    "x-forwarded-for": "192.0.2.99",
    "cf-connecting-ip": "192.0.2.44",
  };
  const login = fixtureHeaders(headers, "/api/auth/sign-in/email", peer);
  assert.equal(login["x-real-ip"], "198.51.100.12");
  const token = fixtureHeaders(headers, "/api/auth/oauth2/token", peer);
  assert.equal(token["x-real-ip"], peer);
  assert.equal(token["x-forwarded-for"], undefined);
  assert.equal(token["cf-connecting-ip"], undefined);
  assert.equal(fixtureHeaders(headers, "/api/auth/oauth2/token/", "::1")["x-real-ip"], peer);
  assert.equal(
    fixtureHeaders({ "x-real-ip": "8.8.8.8" }, "/api/auth/sign-in/email", peer)["x-real-ip"],
    peer,
  );
});

test("owned issuer starts, routes traffic and releases its local port", async () => {
  const root = await mkdtemp(join(tmpdir(), "compasso-issuer-test-"));
  const serverPath = join(root, "server.cjs");
  const reservation = createServer();
  await new Promise((resolve) => reservation.listen(0, "127.0.0.1", resolve));
  const address = reservation.address();
  assert.ok(address && typeof address !== "string");
  const port = address.port;
  await new Promise((resolve) => reservation.close(resolve));
  await writeFile(
    serverPath,
    `require('node:http').createServer((req,res)=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(req.headers));}).listen(process.env.PORT,'127.0.0.1')`,
  );
  let issuer;
  try {
    issuer = await startFixtureIssuer(
      serverPath,
      { COMPASSO_ISOLATED_DATABASE: "1" },
      `http://localhost:${port}`,
    );
    const response = await fetch(`http://127.0.0.1:${port}/api/auth/oauth2/token`, {
      headers: { "x-real-ip": "198.51.100.10" },
    });
    assert.equal((await response.json())["x-real-ip"], "127.0.0.1");
  } finally {
    if (issuer) await issuer.dispose();
    await rm(root, { recursive: true, force: true });
  }
  await new Promise((resolve, reject) =>
    reservation.once("error", reject).listen(port, "127.0.0.1", resolve),
  );
  await new Promise((resolve) => reservation.close(resolve));
});

test("an occupied port is rejected without disturbing its owner", async () => {
  const owner = createServer();
  await new Promise((resolve) => owner.listen(0, "127.0.0.1", resolve));
  const address = owner.address();
  assert.ok(address && typeof address !== "string");
  try {
    await assert.rejects(
      startFixtureIssuer(
        "unused",
        { COMPASSO_ISOLATED_DATABASE: "1" },
        `http://localhost:${address.port}`,
      ),
      { code: "EADDRINUSE" },
    );
    assert.equal(owner.listening, true);
  } finally {
    await new Promise((resolve) => owner.close(resolve));
  }
});
