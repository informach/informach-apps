import { spawn } from "node:child_process";
import { createServer, request } from "node:http";
import { createServer as createNetServer, isIP } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

function listen(server, options) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
}

/** Test-only edge: simulated browser IPs never reach the server token endpoint. */
export function fixtureHeaders(headers, path, peer) {
  if (!peer || !isIP(peer)) throw new Error("Fixture connection has no valid peer");
  const result = { ...headers };
  const simulated = result["x-real-ip"];
  delete result["x-real-ip"];
  delete result["x-forwarded-for"];
  delete result["cf-connecting-ip"];
  delete result.forwarded;
  const isToken =
    new URL(path, "http://localhost").pathname.replace(/\/+$/, "") === "/api/auth/oauth2/token";
  // These test-network addresses model separate visitors only inside this
  // disposable environment. Server-to-server exchanges use their socket peer.
  const synthetic =
    typeof simulated === "string" &&
    isIP(simulated) &&
    /^(198\.(18|19|20|22|51)\.|192\.0\.2\.)/.test(simulated);
  result["x-real-ip"] = !isToken && synthetic ? simulated : peer === "::1" ? "127.0.0.1" : peer;
  return result;
}

export async function startFixtureIssuer(serverPath, env, origin) {
  const url = new URL(origin);
  if (
    url.protocol !== "http:" ||
    url.hostname !== "localhost" ||
    !url.port ||
    env.COMPASSO_ISOLATED_DATABASE !== "1"
  )
    throw new Error("Invalid fixture issuer");
  const reservation = createNetServer();
  await listen(reservation, { host: "127.0.0.1", port: 0, exclusive: true });
  const address = reservation.address();
  if (!address || typeof address === "string") throw new Error("Missing backend address");
  const port = address.port;
  await new Promise((resolve, reject) =>
    reservation.close((error) => (error ? reject(error) : resolve())),
  );
  const proxies = [];
  let child;
  let exited = false;
  let closed;
  const dispose = async () => {
    const failures = [];
    for (const proxy of proxies) {
      try {
        proxy.closeAllConnections();
        await new Promise((resolve, reject) =>
          proxy.close((error) => (error ? reject(error) : resolve())),
        );
      } catch (error) {
        failures.push(error);
      }
    }
    if (child && closed) {
      if (!exited) child.kill();
      let timer;
      try {
        await Promise.race([
          closed,
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error("Fixture issuer did not stop")), 10_000);
          }),
        ]);
      } catch (error) {
        failures.push(error);
      } finally {
        clearTimeout(timer);
      }
    }
    if (failures.length) throw new AggregateError(failures, "Fixture issuer cleanup failed");
  };
  try {
    for (const host of ["127.0.0.1", "::1"]) {
      const proxy = createServer((incoming, outgoing) => {
        const peer = incoming.socket.remoteAddress?.replace(/^::ffff:/, "");
        let headers;
        try {
          headers = fixtureHeaders(incoming.headers, incoming.url ?? "/", peer);
        } catch {
          outgoing.writeHead(503).end();
          return;
        }
        const upstream = request(
          { host: "127.0.0.1", port, method: incoming.method, path: incoming.url, headers },
          (response) => {
            outgoing.writeHead(response.statusCode ?? 502, response.headers);
            response.pipe(outgoing);
          },
        );
        upstream.on("error", () => {
          if (!outgoing.headersSent) outgoing.writeHead(502);
          outgoing.end();
        });
        incoming.on("aborted", () => upstream.destroy());
        incoming.pipe(upstream);
      });
      try {
        await listen(proxy, { host, port: Number(url.port), exclusive: true });
        proxies.push(proxy);
      } catch (error) {
        if (host !== "::1" || !["EAFNOSUPPORT", "EADDRNOTAVAIL"].includes(error.code)) throw error;
      }
    }
    child = spawn(process.execPath, [serverPath], {
      env: { ...env, HOSTNAME: "127.0.0.1", PORT: String(port) },
      stdio: "inherit",
      windowsHide: true,
    });
    let spawnError;
    closed = new Promise((resolve) => {
      child.once("error", (error) => {
        spawnError = error;
      });
      child.once("close", () => {
        exited = true;
        resolve();
      });
    });
    const deadline = Date.now() + 180_000;
    let lastFailure;
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError;
      if (exited) throw new Error("Fixture issuer exited");
      try {
        const response = await fetch(`http://127.0.0.1:${url.port}/api/ready`, {
          signal: AbortSignal.timeout(1_000),
        });
        if (response.ok) return { dispose };
        lastFailure = new Error(`Fixture issuer readiness returned ${response.status}`);
      } catch (error) {
        lastFailure = error;
      }
      await delay(200);
    }
    throw new Error("Fixture issuer did not become ready", { cause: lastFailure });
  } catch (error) {
    try {
      await dispose();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Fixture issuer startup and cleanup failed");
    }
    throw error;
  }
}
