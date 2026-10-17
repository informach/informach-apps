// Test-process support only. Never imported by an app or included in installers.
const { safeStorage, app } = require("electron");
const fs = require("node:fs/promises");
const { join, resolve } = require("node:path");
const { lock } = require("proper-lockfile");
if (process.env.EDI_NATIVE_TEST !== "true" || app.isPackaged || !process.env.EDI_SUITE_TEST_PROFILE)
  throw new Error("Native vault fixture requires an isolated development test process");
const target = join(resolve(process.env.EDI_SUITE_TEST_PROFILE), "session.v1.bin");
async function read() {
  return JSON.parse(safeStorage.decryptString(await fs.readFile(target)));
}
globalThis.ediNativeFixture = {
  async readIdentity() {
    const data = await read();
    return { deviceId: data.deviceId, keyThumbprint: data.keyThumbprint };
  },
  async writeLease(fixture) {
    const release = await lock(target, {
      realpath: false,
      stale: 30000,
      update: 5000,
      retries: { retries: 20, minTimeout: 50, maxTimeout: 200 },
    });
    try {
      const data = await read();
      data.session = fixture.session;
      data.boundUserId = fixture.session.userId;
      data.leases = Object.fromEntries(fixture.tools.map((tool) => [tool, fixture.lease]));
      data.lastTrustedTime = fixture.time;
      const temporary = `${target}.fixture.tmp`;
      await fs.writeFile(temporary, safeStorage.encryptString(JSON.stringify(data)), {
        flag: "wx",
      });
      await fs.rename(temporary, target);
    } finally {
      await release();
    }
  },
};
