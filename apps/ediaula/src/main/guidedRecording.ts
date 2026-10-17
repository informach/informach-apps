import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { windowsPowerShellEnvironment } from "@informach/edi-desktop/windows-powershell";
import { nativeResourcePath } from "./native-resources.ts";

export { executeGuided } from "../shared/guidedRunner.ts";

export class GuidedInput {
  private child: ChildProcessWithoutNullStreams;
  private serial = 0;
  private pending = new Map<
    number,
    {
      resolve: (v: unknown) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private ready: Promise<void>;
  private dead = false;
  constructor() {
    this.child = spawn(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", nativeResourcePath("guided-input.ps1")],
      { windowsHide: true, env: windowsPowerShellEnvironment() },
    );
    let buffer = "";
    this.ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("O controle do mouse não respondeu."));
        this.close();
      }, 15000);
      this.child.stdout.on("data", (data: Buffer) => {
        buffer += data.toString("utf8");
        for (;;) {
          const index = buffer.indexOf("\n");
          if (index < 0) break;
          const line = buffer.slice(0, index).trim();
          buffer = buffer.slice(index + 1);
          try {
            const reply = JSON.parse(line);
            if (reply.ready) {
              clearTimeout(timer);
              resolve();
              continue;
            }
            const p = this.pending.get(reply.id);
            if (p) {
              clearTimeout(p.timer);
              this.pending.delete(reply.id);
              if (reply.ok) p.resolve(reply.result);
              else p.reject(new Error(reply.error));
            }
          } catch {
            /* Ignore PowerShell diagnostics; commands time out. */
          }
        }
      });
      const fail = () => {
        clearTimeout(timer);
        reject(new Error("Controle do mouse encerrado."));
        this.close();
      };
      this.child.on("error", fail);
      this.child.on("exit", fail);
    });
    void this.ready.catch(() => {});
    this.child.stderr.resume();
    this.child.stdin.on("error", () => this.close());
  }
  async command<T = void>(data: Record<string, unknown>): Promise<T> {
    await this.ready;
    if (this.dead) throw new Error("Automação interrompida.");
    const id = ++this.serial;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("O controle do mouse não respondeu."));
        this.close();
      }, 3000);
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject, timer });
      this.child.stdin.write(JSON.stringify({ ...data, id }) + "\n");
    });
  }
  close(): void {
    if (this.dead) return;
    this.dead = true;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error("Automação interrompida."));
    }
    this.pending.clear();
    this.child.kill();
  }
}
