import { readFile, realpath } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, isAbsolute, relative, resolve } from "node:path";

export async function rendererServer(
  fixtureAssets: ReadonlyMap<string, { content: string; mime: string }> = new Map(),
) {
  const root = await realpath(resolve("out/renderer")),
    mime: Record<string, string> = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".svg": "image/svg+xml",
    };
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1"),
        fixture = fixtureAssets.get(url.pathname);
      if (fixture) {
        response.writeHead(200, { "Content-Type": `${fixture.mime}; charset=utf-8` });
        response.end(fixture.content);
        return;
      }
      const file = await realpath(
          resolve(
            root,
            `.${decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname)}`,
          ),
        ),
        child = relative(root, file);
      if (child.startsWith("..") || isAbsolute(child)) {
        response.writeHead(403).end();
        return;
      }
      response.writeHead(200, {
        "Content-Type": `${mime[extname(file)] ?? "application/octet-stream"}; charset=utf-8`,
      });
      response.end(await readFile(file));
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((done, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", done);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
