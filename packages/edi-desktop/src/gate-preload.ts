import { exposeEdiBridge } from "./preload";

const api = exposeEdiBridge();
window.addEventListener(
  "DOMContentLoaded",
  () => {
    const message = document.getElementById("status");
    const code = document.getElementById("code");
    const render = (status: Awaited<ReturnType<typeof api.status>>) => {
      if (message) message.textContent = status.reason;
      if (code) code.textContent = status.userCode ?? "";
      const connect = document.getElementById("connect");
      if (connect instanceof HTMLButtonElement) connect.disabled = status.state === "connecting";
    };
    const actions = {
      connect: api.connect,
      refresh: api.refresh,
      account: api.account,
      logout: api.logout,
      update: api.checkUpdate,
      recover: api.recover,
    };
    for (const [id, action] of Object.entries(actions))
      document.getElementById(id)?.addEventListener("click", () => {
        action().catch((error: unknown) => {
          if (message)
            message.textContent = error instanceof Error ? error.message : "Operação indisponível";
        });
      });
    api.onStatus(render);
    api
      .status()
      .then(render)
      .catch(() => {
        if (message) message.textContent = "Serviço indisponível. Tente novamente.";
      });
  },
  { once: true },
);
