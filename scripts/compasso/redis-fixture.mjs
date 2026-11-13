import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmod, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Official Redis 7 Alpine image already used by the local environment, pinned by digest.
const IMAGE = "redis@sha256:7aec734b2bb298a1d769fd8729f13b8514a41bf90fcdd1f38ec52267fbaa8ee6";
const LABEL = "org.informach.compasso-test";
export async function createRedisFixture(directory) {
  const id = randomBytes(12).toString("hex");
  const name = `compasso-redis-${id}`;
  const password = randomBytes(32).toString("hex");
  const path = join(directory, "redis.conf");
  await writeFile(
    path,
    `bind 0.0.0.0\nprotected-mode yes\nrequirepass ${password}\nsave ""\nappendonly no\n`,
    // The image's redis user must read its copy. The source stays inside the
    // private mkdtemp directory; no daemon access to that directory is needed.
    { flag: "wx", mode: 0o644 },
  );
  // writeFile's mode is filtered by the process umask (often 0077 in cloud
  // workspaces). Set the final copy mode explicitly inside the private folder.
  await chmod(path, 0o644);
  function docker(args, input) {
    const result = spawnSync("docker", args, {
      windowsHide: true,
      encoding: "utf8",
      input,
      timeout: 60_000,
    });
    if (result.error || result.status !== 0) {
      // The password only travels through stdin and the bind-mounted file,
      // never through arguments, so Docker's stderr can be reported.
      const detail = String(result.stderr || result.error || "").trim();
      throw new Error(
        `Disposable Redis command failed (docker ${args[0]}): ${detail.slice(-300) || "Docker must be available"}`,
      );
    }
    return result.stdout.trim();
  }
  let containerId;
  async function dispose() {
    if (!containerId) return;
    const owner = docker([
      "inspect",
      "--format",
      `{{ index .Config.Labels "${LABEL}" }}`,
      containerId,
    ]);
    if (owner !== id) throw new Error("Refusing to remove an unowned Redis container");
    docker(["rm", "--force", containerId]);
    containerId = undefined;
  }
  try {
    containerId = docker([
      "create",
      "--name",
      name,
      "--label",
      `${LABEL}=${id}`,
      "--publish",
      "127.0.0.1::6379",
      IMAGE,
      "redis-server",
      "/tmp/compasso-redis.conf",
    ]);
    if (!/^[a-f0-9]{64}$/.test(containerId)) throw new Error("Unexpected Redis container identity");
    // Stream through the client instead of bind mounting a host-private file:
    // rootless or remote daemons cannot traverse the caller's 0700 directory.
    docker(["cp", path, `${containerId}:/tmp/compasso-redis.conf`]);
    docker(["start", containerId]);
    const published = docker(["port", containerId, "6379"]);
    const match = /^127\.0\.0\.1:(\d+)$/.exec(published);
    if (!match) throw new Error("Redis must be published only on a disposable loopback port");
    // redis-cli handles RESP; the ephemeral password is stdin, never an argument or log.
    const reply = docker(
      ["exec", "--interactive", containerId, "redis-cli", "--pipe", "--pipe-timeout", "5"],
      `*2\r\n$4\r\nAUTH\r\n$${password.length}\r\n${password}\r\n*1\r\n$4\r\nPING\r\n`,
    );
    if (!reply.includes("errors: 0, replies: 2"))
      throw new Error("Disposable Redis authentication did not pass");
    console.log(`Isolated Redis: ${docker(["exec", containerId, "redis-server", "--version"])}`);
    return { url: `redis://:${password}@127.0.0.1:${match[1]}`, dispose };
  } catch (error) {
    if (containerId) {
      // Redis logs carry startup errors (an unreadable config, for one), never the password.
      const logs = spawnSync("docker", ["logs", "--tail", "20", containerId], {
        windowsHide: true,
        encoding: "utf8",
        timeout: 30_000,
      });
      const tail = `${logs.stdout ?? ""}${logs.stderr ?? ""}`.trim();
      if (tail) console.error(`Disposable Redis container log:\n${tail}`);
    }
    try {
      await dispose();
    } catch (cleanup) {
      throw new AggregateError([error, cleanup], "Redis fixture preparation failed");
    }
    throw error;
  }
}
