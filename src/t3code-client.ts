import { createT3CodeActions, type T3CodeActions } from "./t3code-actions.js";
import type { T3CodeCredentialStore } from "./credential-store.js";

const TOKEN_EXCHANGE_GRANT = "urn:ietf:params:oauth:grant-type:token-exchange";
const ACCESS_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:access_token";
const BOOTSTRAP_TOKEN_TYPE =
  "urn:t3:params:oauth:token-type:environment-bootstrap";
const DEFAULT_TIMEOUT_MS = 10_000;
const SUPPORTED_SCOPES = new Set<string>([
  "orchestration:read",
  "orchestration:operate",
  "terminal:operate",
  "review:write",
  "access:read",
  "access:write",
  "relay:read",
  "relay:write",
]);
const SUPPORTED_DEVICE_TYPES = new Set<string>([
  "desktop",
  "mobile",
  "tablet",
  "bot",
  "unknown",
]);

const DEFAULT_SCOPES = [
  "orchestration:read",
  "orchestration:operate",
  "terminal:operate",
  "review:write",
  "relay:read",
] as const satisfies readonly T3CodeScope[];

/** An authorization scope understood by supported T3 Code servers. */
export type T3CodeScope =
  | "orchestration:read"
  | "orchestration:operate"
  | "terminal:operate"
  | "review:write"
  | "access:read"
  | "access:write"
  | "relay:read"
  | "relay:write";

/** A device category included in the T3 Code session audit trail. */
export type T3CodeDeviceType =
  "desktop" | "mobile" | "tablet" | "bot" | "unknown";

/** Optional, non-secret metadata used to identify this client session. */
export interface T3CodeClientMetadata {
  /** Human-readable name shown by T3 Code. */
  readonly label?: string;
  /** Device category. Defaults to `bot`. */
  readonly deviceType?: T3CodeDeviceType;
  /** Operating-system label shown by T3 Code. */
  readonly os?: string;
}

interface PairingUrlTarget {
  /** A T3 Code pairing URL containing its one-time token. */
  readonly pairingUrl: string | URL;
  /** Optional persistent store for the resulting bearer credential. */
  readonly credentialStore?: T3CodeCredentialStore;
  readonly endpoint?: never;
  readonly pairingCode?: never;
}

interface PairingCodeTarget {
  /** Base HTTP(S) or WebSocket URL of the T3 Code server. */
  readonly endpoint: string | URL;
  /** One-time pairing code printed by the T3 Code server. */
  readonly pairingCode: string;
  /** Optional persistent store for the resulting bearer credential. */
  readonly credentialStore?: T3CodeCredentialStore;
  readonly pairingUrl?: never;
}

interface StoredCredentialTarget {
  /** Base HTTP(S) or WebSocket URL of a previously paired server. */
  readonly endpoint: string | URL;
  /** Persistent store populated during an earlier pairing. */
  readonly credentialStore: T3CodeCredentialStore;
  readonly pairingCode?: never;
  readonly pairingUrl?: never;
}

/** Options for pairing with an existing T3 Code server. */
export type ConnectT3CodeOptions = (
  PairingUrlTarget | PairingCodeTarget | StoredCredentialTarget
) & {
  /** Non-secret metadata recorded for the resulting T3 Code session. */
  readonly client?: T3CodeClientMetadata;
  /** Scopes to request. Defaults to T3 Code's standard client scopes. */
  readonly scopes?: readonly T3CodeScope[];
  /** Cancels descriptor discovery and pairing. */
  readonly signal?: AbortSignal;
  /** Per-request timeout in milliseconds. Defaults to 10 seconds. */
  readonly timeoutMs?: number;
};

/** Stable machine-readable categories for {@link T3CodeError}. */
export type T3CodeErrorCode =
  | "ACTION_TIMEOUT"
  | "INVALID_OPTIONS"
  | "SERVER_UNREACHABLE"
  | "PAIRING_REJECTED"
  | "PAIRING_REQUIRED"
  | "CREDENTIAL_STORE_FAILED"
  | "UNAUTHORIZED"
  | "INVALID_RESPONSE"
  | "REQUEST_FAILED"
  | "WEBSOCKET_FAILED";

/** An error produced while pairing or communicating with T3 Code. */
export class T3CodeError extends Error {
  /** Stable error category. */
  readonly code: T3CodeErrorCode;
  /** HTTP status returned by T3 Code, when available. */
  readonly status: number | undefined;

  /**
   * Creates an error with a stable category and optional HTTP status.
   *
   * Applications normally receive these errors from {@link connectT3Code}.
   */
  constructor(code: T3CodeErrorCode, message: string, status?: number) {
    super(message);
    this.name = "T3CodeError";
    this.code = code;
    this.status = status;
  }
}

/** Normalized server platform information. */
export interface T3CodePlatform {
  /** Operating-system family advertised by the server. */
  readonly os: "darwin" | "linux" | "windows" | "unknown";
  /** CPU architecture advertised by the server. */
  readonly arch: "arm64" | "x64" | "other";
}

/** Stable identity and version details for a paired T3 Code server. */
export interface T3CodeEnvironment {
  /** Persistent T3 Code environment identifier. */
  readonly id: string;
  /** Human-readable environment label. */
  readonly label: string;
  /** Server platform. */
  readonly platform: T3CodePlatform;
  /** T3 Code server version. */
  readonly serverVersion: string;
}

/** Authenticated session details that do not expose its bearer token. */
export interface T3CodeSession {
  /** Expiration timestamp supplied by T3 Code. */
  readonly expiresAt: string;
  /** Scopes granted by T3 Code. */
  readonly scopes: readonly string[];
}

/** Options for opening an authenticated T3 Code WebSocket. */
export interface T3CodeWebSocketOptions {
  /** Cancels the connection attempt. */
  readonly signal?: AbortSignal;
  /** Connection timeout in milliseconds. Defaults to the pairing timeout. */
  readonly timeoutMs?: number;
}

/** An authenticated handle to an existing T3 Code server. */
export interface T3CodeConnection {
  /** Typed high-value T3 Code operations. */
  readonly actions: T3CodeActions;
  /** Normalized HTTP endpoint without pairing credentials. */
  readonly endpoint: string;
  /** Server identity discovered before the pairing code was consumed. */
  readonly environment: T3CodeEnvironment;
  /** Non-secret session metadata. */
  readonly session: T3CodeSession;
  /**
   * Sends an authenticated request to the paired server.
   *
   * The target must be a root-relative path or a same-origin URL. Redirects
   * are disabled so the bearer credential cannot be forwarded elsewhere.
   */
  request(path: string | URL, init?: RequestInit): Promise<Response>;
  /**
   * Opens a WebSocket using a fresh, single-use T3 Code ticket.
   *
   * The caller owns the returned socket and must close it when finished.
   */
  openWebSocket(options?: T3CodeWebSocketOptions): Promise<WebSocket>;
}

interface ResolvedTarget {
  readonly credential?: string;
  readonly httpBaseUrl: string;
  readonly wsBaseUrl: string;
}

interface RuntimePairingInput {
  readonly credentialStore?: unknown;
  readonly endpoint?: unknown;
  readonly pairingCode?: unknown;
  readonly pairingUrl?: unknown;
}

type JsonRecord = Readonly<Record<string, unknown>>;

function invalidOptions(message: string): never {
  throw new T3CodeError("INVALID_OPTIONS", message);
}

function invalidResponse(message: string): never {
  throw new T3CodeError("INVALID_RESPONSE", message);
}

function actionTimeout(): never {
  throw new T3CodeError(
    "ACTION_TIMEOUT",
    "The T3 Code turn did not finish before timeoutMs.",
  );
}

function credentialStore(value: unknown): T3CodeCredentialStore | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== "object" ||
    value === null ||
    !("load" in value) ||
    !("save" in value) ||
    !("delete" in value) ||
    typeof value.load !== "function" ||
    typeof value.save !== "function" ||
    typeof value.delete !== "function"
  ) {
    return invalidOptions(
      "credentialStore must implement load, save, and delete.",
    );
  }
  return value as T3CodeCredentialStore;
}

function credentialKey(endpointUrl: string, environmentId: string): string {
  return `t3code-api:v1:${new URL(endpointUrl).origin}:${environmentId}`;
}

function credentialStoreFailure(): never {
  throw new T3CodeError(
    "CREDENTIAL_STORE_FAILED",
    "The T3 Code credential store operation failed.",
  );
}

async function loadCredential(
  store: T3CodeCredentialStore,
  key: string,
): Promise<string | null> {
  let value: string | null;
  try {
    value = await store.load(key);
  } catch {
    return credentialStoreFailure();
  }
  if (value === null) return null;
  if (typeof value !== "string" || value.trim() === "") {
    return credentialStoreFailure();
  }
  return value;
}

async function saveCredential(
  store: T3CodeCredentialStore,
  key: string,
  value: string,
): Promise<void> {
  try {
    await store.save(key, value);
  } catch {
    return credentialStoreFailure();
  }
}

async function deleteCredential(
  store: T3CodeCredentialStore,
  key: string,
): Promise<void> {
  try {
    await store.delete(key);
  } catch {
    return credentialStoreFailure();
  }
}

function nonEmpty(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed === "") {
    return invalidOptions(`${label} must not be empty.`);
  }
  return trimmed;
}

function normalizeTimeout(value: number | undefined): number {
  const timeoutMs = value ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    return invalidOptions("timeoutMs must be a positive safe integer.");
  }
  return timeoutMs;
}

function parseUrl(value: string | URL, label: string): URL {
  try {
    return new URL(value instanceof URL ? value.href : value);
  } catch {
    return invalidOptions(`${label} must be a valid URL.`);
  }
}

function normalizeBackend(value: string | URL, label: string): URL {
  const raw = value instanceof URL ? value.href : value.trim();
  if (raw === "") {
    return invalidOptions(`${label} must not be empty.`);
  }
  const withoutLeadingSlashes = raw.replace(/^\/+/, "");
  const input = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(withoutLeadingSlashes)
    ? withoutLeadingSlashes
    : `https://${withoutLeadingSlashes}`;
  const url = parseUrl(input, label);
  if (!["http:", "https:", "ws:", "wss:"].includes(url.protocol)) {
    return invalidOptions(`${label} must use HTTP(S) or WebSocket(S).`);
  }
  if (url.username !== "" || url.password !== "") {
    return invalidOptions(`${label} must not contain user credentials.`);
  }
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url;
}

function asHttpUrl(value: URL): string {
  const url = new URL(value);
  if (url.protocol === "ws:") url.protocol = "http:";
  if (url.protocol === "wss:") url.protocol = "https:";
  return url.href;
}

function asWebSocketUrl(value: URL): string {
  const url = new URL(value);
  if (url.protocol === "http:") url.protocol = "ws:";
  if (url.protocol === "https:") url.protocol = "wss:";
  return url.href;
}

function pairingToken(url: URL): string | null {
  const hash = new URLSearchParams(
    url.hash.startsWith("#") ? url.hash.slice(1) : url.hash,
  );
  const fromHash = hash.get("token")?.trim();
  if (fromHash) return fromHash;
  const fromQuery = url.searchParams.get("token")?.trim();
  return fromQuery === undefined || fromQuery === "" ? null : fromQuery;
}

function resolveTarget(options: ConnectT3CodeOptions): ResolvedTarget {
  const input: RuntimePairingInput = options;
  if (input.pairingUrl !== undefined) {
    if (input.endpoint !== undefined || input.pairingCode !== undefined) {
      return invalidOptions(
        "Provide pairingUrl or endpoint with pairingCode, not both.",
      );
    }
    if (
      typeof input.pairingUrl !== "string" &&
      !(input.pairingUrl instanceof URL)
    ) {
      return invalidOptions("pairingUrl must be a string or URL.");
    }
    const pairingUrl = parseUrl(input.pairingUrl, "pairingUrl");
    if (!["http:", "https:", "ws:", "wss:"].includes(pairingUrl.protocol)) {
      return invalidOptions("pairingUrl must use HTTP(S) or WebSocket(S).");
    }
    const credential = pairingToken(pairingUrl);
    if (credential === null) {
      return invalidOptions("pairingUrl is missing its pairing token.");
    }
    const hostedEndpoint = pairingUrl.searchParams.get("host")?.trim();
    const backend = normalizeBackend(
      hostedEndpoint === undefined || hostedEndpoint === ""
        ? pairingUrl
        : hostedEndpoint,
      hostedEndpoint ? "pairingUrl host" : "pairingUrl",
    );
    return {
      credential,
      httpBaseUrl: asHttpUrl(backend),
      wsBaseUrl: asWebSocketUrl(backend),
    };
  }

  if (typeof input.endpoint !== "string" && !(input.endpoint instanceof URL)) {
    return invalidOptions("Provide pairingUrl or an endpoint.");
  }
  if (
    input.pairingCode !== undefined &&
    typeof input.pairingCode !== "string"
  ) {
    return invalidOptions("pairingCode must be a string.");
  }
  if (input.pairingCode === undefined && input.credentialStore === undefined) {
    return invalidOptions(
      "An endpoint requires pairingCode or credentialStore.",
    );
  }
  const backend = normalizeBackend(input.endpoint, "endpoint");
  return {
    ...(input.pairingCode === undefined
      ? {}
      : { credential: nonEmpty(input.pairingCode, "pairingCode") }),
    httpBaseUrl: asHttpUrl(backend),
    wsBaseUrl: asWebSocketUrl(backend),
  };
}

function endpoint(baseUrl: string, pathname: string): string {
  const url = new URL(baseUrl);
  url.pathname = pathname;
  url.search = "";
  url.hash = "";
  return url.href;
}

function signalFor(
  timeoutMs: number,
  signal: AbortSignal | null | undefined,
): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal === null || signal === undefined
    ? timeout
    : AbortSignal.any([signal, timeout]);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: JsonRecord, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new T3CodeError(
      "INVALID_RESPONSE",
      `T3 Code returned an invalid ${key} field.`,
    );
  }
  return value;
}

async function readJson(response: Response): Promise<JsonRecord> {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new T3CodeError(
      "INVALID_RESPONSE",
      "T3 Code returned invalid JSON.",
      response.status,
    );
  }
  if (!isRecord(value)) {
    throw new T3CodeError(
      "INVALID_RESPONSE",
      "T3 Code returned an invalid JSON object.",
      response.status,
    );
  }
  return value;
}

async function send(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  signal: AbortSignal | null | undefined,
  failureCode: T3CodeErrorCode,
): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      redirect: "error",
      signal: signalFor(timeoutMs, signal),
    });
  } catch {
    throw new T3CodeError(
      failureCode,
      "T3 Code could not be reached or the request was cancelled.",
    );
  }
}

function mapEnvironment(value: JsonRecord): T3CodeEnvironment {
  const platform = value["platform"];
  if (!isRecord(platform)) {
    throw new T3CodeError(
      "INVALID_RESPONSE",
      "T3 Code returned invalid platform details.",
    );
  }
  const rawOs = stringField(platform, "os");
  const rawArch = stringField(platform, "arch");
  const os: T3CodePlatform["os"] = ["darwin", "linux", "windows"].includes(
    rawOs,
  )
    ? (rawOs as "darwin" | "linux" | "windows")
    : "unknown";
  const arch: T3CodePlatform["arch"] = ["arm64", "x64"].includes(rawArch)
    ? (rawArch as "arm64" | "x64")
    : "other";
  return Object.freeze({
    id: stringField(value, "environmentId"),
    label: stringField(value, "label"),
    platform: Object.freeze({ os, arch }),
    serverVersion: stringField(value, "serverVersion"),
  });
}

function mapSession(value: JsonRecord): T3CodeSession {
  if (value["authenticated"] !== true) {
    throw new T3CodeError(
      "UNAUTHORIZED",
      "T3 Code did not establish an authenticated session.",
    );
  }
  const scopes = value["scopes"];
  if (
    !Array.isArray(scopes) ||
    !scopes.every((scope) => typeof scope === "string")
  ) {
    throw new T3CodeError(
      "INVALID_RESPONSE",
      "T3 Code returned invalid session scopes.",
    );
  }
  return Object.freeze({
    expiresAt: stringField(value, "expiresAt"),
    scopes: Object.freeze([...scopes]),
  });
}

function clientFields(
  metadata: T3CodeClientMetadata | undefined,
): Readonly<Record<string, string>> {
  const label = optionalText(metadata?.label, "client.label");
  const os = optionalText(metadata?.os, "client.os");
  const deviceType = metadata?.deviceType ?? "bot";
  if (!SUPPORTED_DEVICE_TYPES.has(deviceType)) {
    return invalidOptions("client.deviceType is not supported.");
  }
  const fields: Record<string, string> = {
    client_label: label === undefined || label === "" ? "t3code-api" : label,
    client_device_type: deviceType,
    client_os:
      os === undefined || os === "" ? `Node.js ${process.version}` : os,
  };
  return fields;
}

function optionalText(
  value: string | undefined,
  label: string,
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    return invalidOptions(`${label} must be a string.`);
  }
  return value.trim();
}

function encodeScopes(scopes: readonly T3CodeScope[] | undefined): string {
  const values: readonly unknown[] = scopes ?? DEFAULT_SCOPES;
  if (values.length === 0) {
    return invalidOptions("scopes must contain at least one scope.");
  }
  const unique = new Set<string>();
  for (const scope of values) {
    if (typeof scope !== "string" || !SUPPORTED_SCOPES.has(scope)) {
      return invalidOptions("scopes contains an unsupported scope.");
    }
    if (unique.has(scope)) {
      return invalidOptions("scopes must not contain duplicates.");
    }
    unique.add(scope);
  }
  return [...unique].join(" ");
}

function authenticatedHeaders(
  token: string,
  headers: RequestInit["headers"],
): Headers {
  const next = new Headers(headers);
  next.set("authorization", `Bearer ${token}`);
  return next;
}

async function openSocket(
  url: string,
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<WebSocket> {
  if (typeof WebSocket === "undefined") {
    throw new T3CodeError(
      "WEBSOCKET_FAILED",
      "This Node.js runtime does not provide WebSocket.",
    );
  }
  let socket: WebSocket;
  try {
    socket = new WebSocket(url);
  } catch {
    throw new T3CodeError(
      "WEBSOCKET_FAILED",
      "The T3 Code WebSocket could not be created.",
    );
  }
  const combinedSignal = signalFor(timeoutMs, signal);
  return await new Promise<WebSocket>((resolve, reject) => {
    const cleanup = (): void => {
      combinedSignal.removeEventListener("abort", onAbort);
      socket.removeEventListener("open", onOpen);
      socket.removeEventListener("error", onError);
    };
    const fail = (message: string): void => {
      cleanup();
      socket.close();
      reject(new T3CodeError("WEBSOCKET_FAILED", message));
    };
    const onAbort = (): void => {
      fail("The T3 Code WebSocket connection was cancelled or timed out.");
    };
    const onError = (): void => {
      fail("The T3 Code WebSocket connection failed.");
    };
    const onOpen = (): void => {
      cleanup();
      resolve(socket);
    };
    combinedSignal.addEventListener("abort", onAbort, { once: true });
    socket.addEventListener("open", onOpen, { once: true });
    socket.addEventListener("error", onError, { once: true });
    if (combinedSignal.aborted) onAbort();
  });
}

/**
 * Connects to an existing T3 Code server and returns an authenticated handle.
 *
 * A saved credential is tried first. Otherwise, the one-time pairing code is
 * exchanged and saved when a credential store is configured. The bearer
 * credential remains private inside the returned connection.
 *
 * @param options - Pairing URL or endpoint/code plus connection settings.
 */
export async function connectT3Code(
  options: ConnectT3CodeOptions,
): Promise<T3CodeConnection> {
  const target = resolveTarget(options);
  const timeoutMs = normalizeTimeout(options.timeoutMs);
  const store = credentialStore(options.credentialStore);
  const descriptorResponse = await send(
    endpoint(target.httpBaseUrl, "/.well-known/t3/environment"),
    { method: "GET" },
    timeoutMs,
    options.signal,
    "SERVER_UNREACHABLE",
  );
  if (!descriptorResponse.ok) {
    throw new T3CodeError(
      "SERVER_UNREACHABLE",
      "T3 Code environment discovery failed.",
      descriptorResponse.status,
    );
  }
  const environment = mapEnvironment(await readJson(descriptorResponse));
  const storeKey = credentialKey(target.httpBaseUrl, environment.id);

  const requestWith =
    (token: string): T3CodeConnection["request"] =>
    async (path: string | URL, init: RequestInit = {}): Promise<Response> => {
      let url: URL;
      try {
        url = new URL(
          path instanceof URL ? path.href : path,
          target.httpBaseUrl,
        );
      } catch {
        return invalidOptions("request path must be a valid URL or path.");
      }
      if (url.origin !== new URL(target.httpBaseUrl).origin) {
        return invalidOptions("request URL must use the paired server origin.");
      }
      if (url.username !== "" || url.password !== "") {
        return invalidOptions("request URL must not contain user credentials.");
      }
      url.hash = "";
      const response = await send(
        url.href,
        {
          ...init,
          headers: authenticatedHeaders(token, init.headers),
        },
        timeoutMs,
        init.signal,
        "REQUEST_FAILED",
      );
      if (response.status === 401 || response.status === 403) {
        throw new T3CodeError(
          "UNAUTHORIZED",
          "T3 Code rejected the authenticated request.",
          response.status,
        );
      }
      return response;
    };

  const verifySession = async (
    request: T3CodeConnection["request"],
  ): Promise<T3CodeSession> => {
    const response = await request("/api/auth/session");
    if (!response.ok) {
      throw new T3CodeError(
        "REQUEST_FAILED",
        "T3 Code session verification failed.",
        response.status,
      );
    }
    return mapSession(await readJson(response));
  };

  let token =
    store === undefined ? null : await loadCredential(store, storeKey);
  let rawRequest: T3CodeConnection["request"] | undefined;
  let session: T3CodeSession | undefined;
  if (token !== null) {
    rawRequest = requestWith(token);
    try {
      session = await verifySession(rawRequest);
    } catch (cause: unknown) {
      if (cause instanceof T3CodeError && cause.code === "UNAUTHORIZED") {
        if (store === undefined) return credentialStoreFailure();
        await deleteCredential(store, storeKey);
        token = null;
        rawRequest = undefined;
      } else {
        throw cause;
      }
    }
  }

  if (token === null) {
    if (target.credential === undefined) {
      throw new T3CodeError(
        "PAIRING_REQUIRED",
        "No valid saved credential exists; provide a new pairing URL or pairing code.",
      );
    }
    const form = new URLSearchParams({
      grant_type: TOKEN_EXCHANGE_GRANT,
      subject_token: target.credential,
      subject_token_type: BOOTSTRAP_TOKEN_TYPE,
      requested_token_type: ACCESS_TOKEN_TYPE,
      scope: encodeScopes(options.scopes),
      ...clientFields(options.client),
    });
    const tokenResponse = await send(
      endpoint(target.httpBaseUrl, "/oauth/token"),
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: form,
      },
      timeoutMs,
      options.signal,
      "PAIRING_REJECTED",
    );
    if (!tokenResponse.ok) {
      throw new T3CodeError(
        "PAIRING_REJECTED",
        "T3 Code rejected the pairing code or requested scopes.",
        tokenResponse.status,
      );
    }
    const tokenBody = await readJson(tokenResponse);
    token = stringField(tokenBody, "access_token");
    if (
      tokenBody["token_type"] !== "Bearer" ||
      tokenBody["issued_token_type"] !== ACCESS_TOKEN_TYPE
    ) {
      throw new T3CodeError(
        "INVALID_RESPONSE",
        "T3 Code did not issue a bearer access token.",
      );
    }
    rawRequest = requestWith(token);
    if (store !== undefined) {
      await saveCredential(store, storeKey, token);
    }
    try {
      session = await verifySession(rawRequest);
    } catch (cause: unknown) {
      if (
        store !== undefined &&
        cause instanceof T3CodeError &&
        cause.code === "UNAUTHORIZED"
      ) {
        await deleteCredential(store, storeKey);
      }
      throw cause;
    }
  }

  if (rawRequest === undefined || session === undefined) {
    throw new T3CodeError(
      "INVALID_RESPONSE",
      "T3 Code connection initialization did not complete.",
    );
  }

  const requestJson = async (
    path: string,
    init?: RequestInit,
  ): Promise<unknown> => {
    const response = await rawRequest(path, init);
    if (!response.ok) {
      throw new T3CodeError(
        "REQUEST_FAILED",
        "The T3 Code action request failed.",
        response.status,
      );
    }
    return await readJson(response);
  };

  return Object.freeze({
    actions: createT3CodeActions(
      requestJson,
      invalidResponse,
      invalidOptions,
      actionTimeout,
    ),
    endpoint: target.httpBaseUrl,
    environment,
    session,
    request: rawRequest,
    openWebSocket: async (
      socketOptions: T3CodeWebSocketOptions = {},
    ): Promise<WebSocket> => {
      const response = await rawRequest("/api/auth/websocket-ticket", {
        method: "POST",
        ...(socketOptions.signal === undefined
          ? {}
          : { signal: socketOptions.signal }),
      });
      if (!response.ok) {
        throw new T3CodeError(
          "REQUEST_FAILED",
          "T3 Code did not issue a WebSocket ticket.",
          response.status,
        );
      }
      const ticket = stringField(await readJson(response), "ticket");
      const socketUrl = new URL(target.wsBaseUrl);
      socketUrl.pathname = "/ws";
      socketUrl.searchParams.set("wsTicket", ticket);
      return await openSocket(
        socketUrl.href,
        normalizeTimeout(socketOptions.timeoutMs ?? timeoutMs),
        socketOptions.signal,
      );
    },
  });
}
