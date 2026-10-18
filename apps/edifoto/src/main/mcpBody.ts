import type { IncomingMessage } from "node:http";

export class McpBodyError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Bound bytes before parsing; stop retaining chunks immediately on rejection. */
export function readMcpBody(req: IncomingMessage, limit = 5_000_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let bytes = 0;
    const chunks: Buffer[] = [];
    const cleanup = () => {
      req.off("data", data);
      req.off("end", end);
      req.off("aborted", aborted);
      req.off("error", failure);
      chunks.length = 0;
    };
    const failure = (error: Error) => {
      cleanup();
      req.resume();
      reject(error);
    };
    const aborted = () => failure(new McpBodyError("Request interrupted", 400));
    const data = (chunk: Buffer) => {
      bytes += chunk.byteLength;
      if (bytes > limit) failure(new McpBodyError("Request body too large", 413));
      else chunks.push(chunk);
    };
    const end = () => {
      try {
        const text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
        const parsed: unknown = text ? JSON.parse(text) : undefined;
        cleanup();
        resolve(parsed);
      } catch {
        failure(new McpBodyError("Invalid JSON request", 400));
      }
    };
    req.on("data", data);
    req.once("end", end);
    req.once("aborted", aborted);
    req.once("error", failure);
    if (Number(req.headers["content-length"]) > limit)
      failure(new McpBodyError("Request body too large", 413));
  });
}
