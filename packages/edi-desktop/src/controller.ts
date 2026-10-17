import { Buffer } from "node:buffer";
import { hostname } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import {
  type accessDenialSchema,
  activationResponseSchema,
  compareReleaseVersions,
  DEVICE_CODE_GRANT,
  type DesktopAppId,
  licenseResponseSchema,
  releaseVersionSchema,
} from "@informach/edi-contracts";
import { readBoundedJson } from "@informach/edi-contracts/json-response";
import { type RequestProof, signRequestProof } from "@informach/edi-contracts/proof";
import { verifyLicense } from "@informach/edi-contracts/verify";
import { z } from "zod";
import type { DesktopConfig, DesktopStatus } from "./contracts";
import type { Vault, VaultData } from "./vault";
import { createDeviceIdentity } from "./vault";

const tokenSchema = z.object({
  access_token: z.string().min(1).max(16384),
  refresh_token: z.string().min(1).max(16384),
  expires_in: z.number().int().positive().max(300),
});
const codeSchema = z.object({
  device_code: z.string().min(1).max(8192),
  user_code: z.string().min(1).max(64),
  verification_uri: z.url().max(2048),
  expires_in: z.number().int().positive().max(600),
  interval: z.number().int().positive().max(30),
});
const oauthErrorSchema = z.object({ error: z.string().min(1).max(200) });
const updateRequiredReason =
  "Atualize este aplicativo para continuar. Seu trabalho pode ser recuperado.";
/** People read the status reason in the Hub and in each tool; never show a raw denial code. */
const denialReasons: Record<z.infer<typeof accessDenialSchema>, string> = {
  subscription_required:
    "Esta conta não tem uma assinatura ativa. Assine em Minha assinatura para abrir as ferramentas.",
  payment_required: "O último pagamento não foi confirmado. Atualize o cartão em Minha assinatura.",
  suspended: "O acesso desta conta está suspenso. Seus arquivos continuam neste computador.",
  device_revoked: "Este computador foi desconectado da conta. Conecte de novo para continuar.",
  device_limit: "Limite de computadores atingido. Desconecte um deles em Minha conta.",
  session_revoked: "A sessão foi encerrada. Conecte sua conta de novo.",
  update_required: updateRequiredReason,
  invalid_proof: "Não foi possível confirmar este computador. Conecte sua conta de novo.",
};
class RemoteError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = "RemoteError";
  }
}
export function createDesktopController(
  config: Pick<
    DesktopConfig,
    "portalUrl" | "clientId" | "environment" | "trustedKeys" | "publisher" | "downloadHost"
  > & {
    appId: DesktopAppId;
    clientVersion: string;
    vault: Vault;
    changed: (status: DesktopStatus) => void;
    openExternal: (url: string) => Promise<void>;
    fetch?: typeof fetch;
    now?: () => number;
  },
) {
  const base = new URL(config.portalUrl).origin;
  const clientVersion = releaseVersionSchema.parse(config.clientVersion);
  const audience = `${base}/api/desktop`;
  const toolId = config.appId === "edi-hub" ? "ediaula" : config.appId;
  const clock = config.now ?? Date.now;
  const transport = config.fetch ?? fetch;
  let status: DesktopStatus = {
    state: "restricted",
    reason: "Conecte sua conta para validar a assinatura.",
    userId: null,
    expiresAt: null,
    offline: false,
    userCode: null,
    verificationUri: null,
    update: "development",
  };
  let login: AbortController | undefined;
  let pending: Promise<void> | undefined;
  let lastObservedClock = clock();
  const emit = (patch: Partial<DesktopStatus>) => {
    status = { ...status, ...patch };
    config.changed(status);
  };
  async function request(
    path: string,
    body: Record<string, string>,
    token?: string,
    proof?: string,
    form = false,
    signal?: AbortSignal,
  ) {
    const response = await transport(`${base}${path}`, {
      method: "POST",
      redirect: "error",
      headers: {
        "Content-Type": form ? "application/x-www-form-urlencoded" : "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(proof ? { "X-Edi-Proof": proof } : {}),
      },
      body: form ? new URLSearchParams(body).toString() : JSON.stringify(body),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(30000)])
        : AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      // Proxies commonly return HTML during outages. HTTP status, not an error
      // body's JSON format, determines whether an existing lease may be used.
      if ([502, 503, 504].includes(response.status)) {
        await response.body?.cancel();
        throw new RemoteError(response.status, "temporarily_unavailable");
      }
      let raw: unknown;
      try {
        raw = await readBoundedJson(response, 64 * 1024);
      } catch (cause) {
        throw new RemoteError(response.status, "invalid_error_response", { cause });
      }
      const parsed = oauthErrorSchema.safeParse(raw);
      throw new RemoteError(
        response.status,
        parsed.success ? parsed.data.error : "request_rejected",
      );
    }
    if (response.status === 204) return null;
    return readBoundedJson(response, 64 * 1024);
  }
  function signedRequest(
    data: VaultData,
    path: RequestProof["path"],
    body: Record<string, string>,
  ) {
    const session = data.session;
    if (!session) throw new Error("No desktop session");
    const proof = signRequestProof(
      {
        audience,
        method: "POST",
        path,
        userId: session.userId,
        deviceId: data.deviceId,
        sessionId: path === "/api/desktop/activate" ? null : session.sessionId,
        iat: Math.floor(clock() / 1000),
      },
      JSON.stringify(body),
      data.privateKey,
    );
    return request(path, body, session.accessToken, proof);
  }
  function cachedAccess(data: VaultData) {
    const session = data.session;
    const lease = data.leases[toolId];
    if (!session || !lease) return null;
    const result = verifyLicense(lease, {
      trustedKeys: config.trustedKeys,
      issuer: base,
      environment: config.environment,
      userId: session.userId,
      deviceId: data.deviceId,
      keyThumbprint: data.keyThumbprint,
      activationId: session.activationId,
      minimumRevision: 0,
      clientVersion,
      toolId,
      now: new Date(clock()),
      lastTrustedTime: new Date(data.lastTrustedTime),
    });
    if (
      result.valid &&
      data.licenseVersionDeniedThrough &&
      compareReleaseVersions(clientVersion, data.licenseVersionDeniedThrough) <= 0
    )
      return { valid: false, reason: "update_required" } as const;
    return result;
  }
  async function validate() {
    await config.vault.use(async (data) => {
      try {
        const session = data.session;
        if (!session || Date.parse(session.sessionExpiresAt) <= clock()) {
          data.leases = {};
          data.session = null;
          emit({
            state: "restricted",
            userId: null,
            expiresAt: null,
            offline: false,
            reason: "Conecte sua conta para validar a assinatura.",
          });
          return;
        }
        if (session.accessExpiresAt <= clock() + 30000) {
          const tokens = tokenSchema.parse(
            await request(
              "/api/auth/oauth2/token",
              {
                client_id: config.clientId,
                grant_type: "refresh_token",
                refresh_token: session.refreshToken,
                resource: audience,
              },
              undefined,
              undefined,
              true,
            ),
          );
          session.accessToken = tokens.access_token;
          session.refreshToken = tokens.refresh_token;
          session.accessExpiresAt = clock() + tokens.expires_in * 1000;
        }
        const response = licenseResponseSchema.parse(
          await signedRequest(data, "/api/desktop/license", {
            deviceId: data.deviceId,
            sessionId: session.sessionId,
            toolId,
            clientVersion,
          }),
        );
        if (response.status === "denied") {
          if (response.reason === "update_required") {
            // A version refusal is not a device/account revocation. Persist it
            // without deleting grants used by newer apps in this shared vault.
            if (
              !data.licenseVersionDeniedThrough ||
              compareReleaseVersions(clientVersion, data.licenseVersionDeniedThrough) > 0
            )
              data.licenseVersionDeniedThrough = clientVersion;
          } else data.leases = {};
          if (["device_revoked", "session_revoked", "suspended"].includes(response.reason))
            data.session = null;
          emit({
            state: "restricted",
            reason: denialReasons[response.reason],
            userId: session.userId,
            expiresAt: null,
            offline: false,
          });
          return;
        }
        // Verify signature/bindings before trusting the server time or caching the lease.
        const result = verifyLicense(response.lease, {
          trustedKeys: config.trustedKeys,
          issuer: base,
          environment: config.environment,
          userId: session.userId,
          deviceId: data.deviceId,
          keyThumbprint: data.keyThumbprint,
          activationId: session.activationId,
          minimumRevision: 0,
          clientVersion,
          toolId,
          now: new Date(clock()),
          lastTrustedTime: new Date(data.lastTrustedTime),
        });
        if (!result.valid || Math.abs(response.serverTime - result.claims.iat * 1000) > 2000)
          throw new RemoteError(403, "invalid_license");
        for (const entitledTool of result.claims.tools) data.leases[entitledTool] = response.lease;
        if (
          data.licenseVersionDeniedThrough &&
          (compareReleaseVersions(
            result.claims.minimumClientVersion,
            data.licenseVersionDeniedThrough,
          ) > 0 ||
            compareReleaseVersions(clientVersion, data.licenseVersionDeniedThrough) <= 0)
        )
          delete data.licenseVersionDeniedThrough;
        data.lastTrustedTime = Math.max(data.lastTrustedTime, response.serverTime, clock());
        emit({
          state: "licensed",
          reason: "Assinatura validada",
          userId: session.userId,
          expiresAt: new Date(result.claims.exp * 1000).toISOString(),
          offline: false,
        });
      } catch (error) {
        const temporary = !(error instanceof RemoteError)
          ? error instanceof TypeError ||
            (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name))
          : [502, 503, 504].includes(error.status);
        const cached = temporary ? cachedAccess(data) : null;
        const claims = cached?.valid ? cached.claims : null;
        if (claims) {
          data.lastTrustedTime = Math.max(data.lastTrustedTime, clock());
          emit({
            state: "licensed",
            reason: "Acesso offline temporário",
            userId: claims.sub,
            expiresAt: new Date(claims.exp * 1000).toISOString(),
            offline: true,
          });
        } else {
          const updateRequired = cached?.valid === false && cached.reason === "update_required";
          if (!updateRequired) data.leases = {};
          if (error instanceof RemoteError && [400, 401, 403].includes(error.status))
            data.session = null;
          emit({
            state: "restricted",
            reason: updateRequired
              ? updateRequiredReason
              : temporary
                ? "Não foi possível validar o acesso. Conecte-se à internet."
                : "A sessão precisa ser validada novamente.",
            expiresAt: null,
            offline: false,
          });
        }
      }
    });
  }
  const refresh = () => {
    pending ??= validate()
      .catch((error: unknown) => {
        emit({
          state: "restricted",
          reason: "A sessão protegida está indisponível.",
          expiresAt: null,
          offline: false,
        });
        throw error;
      })
      .finally(() => {
        pending = undefined;
      });
    return pending;
  };
  return {
    status: () => status,
    refresh,
    expire() {
      if (
        status.state === "licensed" &&
        (!status.expiresAt || Date.parse(status.expiresAt) <= clock())
      )
        emit({
          state: "restricted",
          reason: "A validação expirou. Conecte-se para renovar o acesso.",
          expiresAt: null,
          offline: false,
        });
    },
    async synchronize() {
      await config.vault.use(async (data) => {
        const cached = cachedAccess(data);
        const claims = cached?.valid ? cached.claims : null;
        if (!claims) {
          if (status.state === "licensed" || (!data.session && status.userId))
            emit({
              state: "restricted",
              reason:
                cached?.valid === false && cached.reason === "update_required"
                  ? updateRequiredReason
                  : "O acesso foi encerrado neste computador. Valide sua conta novamente.",
              userId: data.session?.userId ?? null,
              expiresAt: null,
              offline: false,
            });
          return;
        }
        if (
          status.state !== "licensed" ||
          status.userId !== claims.sub ||
          status.expiresAt !== new Date(claims.exp * 1000).toISOString()
        )
          emit({
            state: "licensed",
            userId: claims.sub,
            expiresAt: new Date(claims.exp * 1000).toISOString(),
            reason: "Assinatura validada",
            offline: status.offline,
          });
      });
    },
    setUpdate: (update: DesktopStatus["update"]) => emit({ update }),
    assertAccess() {
      if (clock() + 60000 < lastObservedClock) throw new Error("edi_clock_rollback");
      lastObservedClock = Math.max(lastObservedClock, clock());
      if (
        status.state !== "licensed" ||
        !status.expiresAt ||
        Date.parse(status.expiresAt) <= clock()
      )
        throw new Error("edi_access_restricted");
    },
    async connect() {
      if (login) return;
      login = new AbortController();
      const { signal } = login;
      emit({ state: "connecting", reason: "Autorize este computador no navegador." });
      try {
        const code = codeSchema.parse(
          await request(
            "/api/auth/device/code",
            {
              client_id: config.clientId,
              scope: "edi:license edi:devices offline_access",
              resource: audience,
            },
            undefined,
            undefined,
            false,
            signal,
          ),
        );
        if (code.verification_uri !== `${base}/conectar`)
          throw new Error("Invalid device verification origin");
        emit({ userCode: code.user_code, verificationUri: code.verification_uri });
        await config.openExternal(code.verification_uri);
        const deadline = clock() + code.expires_in * 1000;
        let interval = code.interval * 1000;
        while (!signal.aborted && clock() < deadline) {
          // RFC 8628 requires this polling interval; slow_down increases it by five seconds.
          await delay(interval, undefined, { signal });
          let raw: unknown;
          try {
            raw = await request(
              "/api/auth/oauth2/token",
              {
                client_id: config.clientId,
                device_code: code.device_code,
                grant_type: DEVICE_CODE_GRANT,
                resource: audience,
              },
              undefined,
              undefined,
              true,
              signal,
            );
          } catch (error) {
            if (error instanceof RemoteError && error.code === "authorization_pending") continue;
            if (error instanceof RemoteError && error.code === "slow_down") {
              interval += 5000;
              continue;
            }
            throw error;
          }
          const tokens = tokenSchema.parse(raw);
          const userId = z
            .object({ sub: z.string().min(1).max(200) })
            .parse(
              JSON.parse(
                Buffer.from(tokens.access_token.split(".")[1] ?? "", "base64url").toString("utf8"),
              ),
            ).sub;
          await config.vault.use(async (data) => {
            if (
              (data.boundUserId ?? data.session?.userId) &&
              (data.boundUserId ?? data.session?.userId) !== userId
            ) {
              Object.assign(data, createDeviceIdentity());
              data.session = null;
              data.leases = {};
            }
            const body = {
              deviceId: data.deviceId,
              name: hostname().slice(0, 80),
              publicKeySpki: data.publicKeySpki,
            };
            const proof = signRequestProof(
              {
                audience,
                method: "POST",
                path: "/api/desktop/activate",
                userId,
                deviceId: data.deviceId,
                sessionId: null,
                iat: Math.floor(clock() / 1000),
              },
              JSON.stringify(body),
              data.privateKey,
            );
            const activation = activationResponseSchema.parse(
              await request("/api/desktop/activate", body, tokens.access_token, proof),
            );
            if (
              activation.userId !== userId ||
              activation.deviceId !== data.deviceId ||
              activation.keyThumbprint !== data.keyThumbprint
            )
              throw new Error("Activation binding mismatch");
            data.session = {
              userId,
              activationId: activation.activationId,
              sessionId: activation.sessionId,
              keyThumbprint: activation.keyThumbprint,
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token,
              accessExpiresAt: clock() + tokens.expires_in * 1000,
              sessionExpiresAt: activation.expiresAt,
            };
            data.boundUserId = userId;
            data.leases = {};
          });
          await refresh();
          return;
        }
        throw new Error("Device authorization expired");
      } catch (error) {
        emit({
          state: "restricted",
          reason:
            error instanceof RemoteError && error.code === "device_limit"
              ? denialReasons.device_limit
              : "A conexão não foi concluída. Tente novamente.",
          expiresAt: null,
        });
        if (!signal.aborted) throw error;
      } finally {
        login = undefined;
        emit({ userCode: null, verificationUri: null });
      }
    },
    cancelConnect: () => login?.abort(),
    async logout() {
      login?.abort();
      let remoteFailure: unknown;
      await config.vault.use(async (data) => {
        if (data.session) {
          try {
            await signedRequest(data, "/api/desktop/logout", {
              deviceId: data.deviceId,
              sessionId: data.session.sessionId,
            });
          } catch (error) {
            remoteFailure = error;
          }
        }
        data.session = null;
        data.leases = {};
      });
      emit({
        state: "restricted",
        userId: null,
        expiresAt: null,
        offline: false,
        reason: remoteFailure
          ? "Sessão local encerrada. Desative este computador na conta para confirmar a revogação remota."
          : "Sessão encerrada neste computador.",
      });
    },
  };
}
