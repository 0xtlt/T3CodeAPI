import { afterEach, describe, expect, it, vi } from "vitest";

import {
  connectT3Code,
  T3CodeError,
  type T3CodeCredentialStore,
} from "../src/index.js";

const descriptor = {
  environmentId: "environment-1",
  label: "Test environment",
  platform: { os: "linux", arch: "x64" },
  serverVersion: "0.0.32",
  capabilities: {},
};

const now = "2026-08-09T00:00:00.000Z";
const selectedModel = {
  instanceId: "opencode",
  model: "openrouter/deepseek/deepseek-v4-flash-0731",
};
const project = {
  id: "project-1",
  title: "Test project",
  workspaceRoot: "/workspace",
  defaultModelSelection: selectedModel,
  scripts: [],
  createdAt: now,
  updatedAt: now,
};
const thread = {
  id: "thread-1",
  projectId: "project-1",
  title: "Test thread",
  modelSelection: selectedModel,
  runtimeMode: "full-access",
  interactionMode: "default",
  branch: null,
  worktreePath: null,
  latestTurn: null,
  session: null,
  archivedAt: null,
  createdAt: now,
  updatedAt: now,
  messages: [
    {
      id: "message-1",
      role: "assistant",
      text: "Ready.",
      streaming: false,
      turnId: null,
      createdAt: now,
      updatedAt: now,
    },
  ],
};

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function formBody(body: RequestInit["body"]): URLSearchParams {
  if (!(body instanceof URLSearchParams)) {
    throw new TypeError("Expected a URLSearchParams request body.");
  }
  return body;
}

function jsonBody(body: RequestInit["body"]): { readonly type: string } {
  if (typeof body !== "string") {
    throw new TypeError("Expected a JSON string request body.");
  }
  return JSON.parse(body) as { readonly type: string };
}

interface TestFetchOptions {
  readonly rejectedBearer?: string;
  readonly sessionFailureStatus?: number;
  readonly threadSnapshots?: readonly {
    readonly sequence: number;
    readonly state: "running" | "interrupted" | "completed" | "error";
  }[];
}

function installPairingFetch(
  options: TestFetchOptions = {},
): ReturnType<typeof vi.fn<typeof fetch>> {
  let threadReadIndex = 0;
  const fetchMock = vi.fn<typeof fetch>((input, init) => {
    const url = requestUrl(input);
    if (url.endsWith("/.well-known/t3/environment")) {
      return Promise.resolve(json(descriptor));
    }
    if (url.endsWith("/oauth/token")) {
      expect(init?.method).toBe("POST");
      expect(formBody(init?.body).get("subject_token")).toBe("pairing-secret");
      return Promise.resolve(
        json({
          access_token: "private-bearer",
          issued_token_type: "urn:ietf:params:oauth:token-type:access_token",
          token_type: "Bearer",
          expires_in: 3_600,
          scope: "orchestration:read orchestration:operate",
        }),
      );
    }
    if (url.endsWith("/api/auth/session")) {
      const authorization = new Headers(init?.headers).get("authorization");
      if (
        options.rejectedBearer !== undefined &&
        authorization === `Bearer ${options.rejectedBearer}`
      ) {
        return Promise.resolve(json({ authenticated: false }, 401));
      }
      expect(authorization).toBe("Bearer private-bearer");
      if (options.sessionFailureStatus !== undefined) {
        return Promise.resolve(
          json(
            { reason: "temporarily unavailable" },
            options.sessionFailureStatus,
          ),
        );
      }
      return Promise.resolve(
        json({
          authenticated: true,
          auth: {},
          scopes: ["orchestration:read", "orchestration:operate"],
          sessionMethod: "bearer-access-token",
          expiresAt: "2026-08-10T00:00:00.000Z",
        }),
      );
    }
    if (url.endsWith("/api/auth/websocket-ticket")) {
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer private-bearer",
      );
      return Promise.resolve(
        json({
          ticket: "single-use-ticket",
          expiresAt: "2026-08-09T00:01:00.000Z",
        }),
      );
    }
    if (url.endsWith("/api/orchestration/shell")) {
      return Promise.resolve(
        json({
          snapshotSequence: 20,
          projects: [project],
          threads: [thread],
          updatedAt: now,
        }),
      );
    }
    if (url.includes("/api/orchestration/threads/thread-1")) {
      const snapshots = options.threadSnapshots;
      const snapshot =
        snapshots === undefined || snapshots.length === 0
          ? undefined
          : snapshots[
              Math.min(threadReadIndex++, Math.max(snapshots.length - 1, 0))
            ];
      return Promise.resolve(
        json({
          snapshotSequence: snapshot?.sequence ?? 20,
          thread:
            snapshot === undefined
              ? thread
              : { ...thread, latestTurn: { state: snapshot.state } },
          page: undefined,
        }),
      );
    }
    if (url.endsWith("/api/orchestration/dispatch")) {
      return Promise.resolve(json({ sequence: 21 }));
    }
    return Promise.resolve(json({ ok: true }));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("connectT3Code", () => {
  it("exchanges a pairing URL and keeps the bearer token private", async () => {
    const fetchMock = installPairingFetch();

    const connection = await connectT3Code({
      pairingUrl: "http://127.0.0.1:3773/pair#token=pairing-secret",
    });

    expect(connection).toMatchObject({
      endpoint: "http://127.0.0.1:3773/",
      environment: {
        id: "environment-1",
        label: "Test environment",
        platform: { os: "linux", arch: "x64" },
        serverVersion: "0.0.32",
      },
      session: {
        expiresAt: "2026-08-10T00:00:00.000Z",
        scopes: ["orchestration:read", "orchestration:operate"],
      },
    });
    expect(Object.values(connection)).not.toContain("private-bearer");

    const tokenRequest = fetchMock.mock.calls[1];
    const body = formBody(tokenRequest?.[1]?.body);
    expect(body.get("grant_type")).toBe(
      "urn:ietf:params:oauth:grant-type:token-exchange",
    );
    expect(body.get("scope")).toBe(
      "orchestration:read orchestration:operate terminal:operate review:write relay:read",
    );
  });

  it("accepts a hosted pairing link", async () => {
    const fetchMock = installPairingFetch();

    const connection = await connectT3Code({
      pairingUrl:
        "https://app.t3.codes/pair?host=http%3A%2F%2F127.0.0.1%3A3773#token=pairing-secret",
    });

    expect(connection.endpoint).toBe("http://127.0.0.1:3773/");
    const discoveryInput = fetchMock.mock.calls[0]?.[0];
    expect(
      discoveryInput === undefined ? undefined : requestUrl(discoveryInput),
    ).toBe("http://127.0.0.1:3773/.well-known/t3/environment");
  });

  it("authenticates same-origin requests and rejects other origins", async () => {
    const fetchMock = installPairingFetch();
    const connection = await connectT3Code({
      endpoint: "http://127.0.0.1:3773",
      pairingCode: "pairing-secret",
    });

    await connection.request("/api/orchestration/snapshot");
    const request = fetchMock.mock.calls.at(-1);
    expect(new Headers(request?.[1]?.headers).get("authorization")).toBe(
      "Bearer private-bearer",
    );
    expect(request?.[1]?.redirect).toBe("error");

    await expect(
      connection.request("https://attacker.example/api"),
    ).rejects.toMatchObject({ code: "INVALID_OPTIONS" });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("opens a socket with a fresh one-time ticket", async () => {
    installPairingFetch();
    let openedUrl = "";
    class FakeWebSocket extends EventTarget {
      close(): void {
        this.dispatchEvent(new Event("close"));
      }

      constructor(url: string | URL) {
        super();
        openedUrl = String(url);
        queueMicrotask(() => this.dispatchEvent(new Event("open")));
      }
    }
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const connection = await connectT3Code({
      endpoint: "http://127.0.0.1:3773",
      pairingCode: "pairing-secret",
    });

    const socket = await connection.openWebSocket();

    expect(socket).toBeInstanceOf(FakeWebSocket);
    expect(openedUrl).toBe("ws://127.0.0.1:3773/ws?wsTicket=single-use-ticket");
  });

  it("saves the exchanged token and reconnects without the pairing code", async () => {
    const fetchMock = installPairingFetch();
    const credentials = new Map<string, string>();
    const store: T3CodeCredentialStore = {
      delete: (key) => {
        credentials.delete(key);
        return Promise.resolve();
      },
      load: (key) => Promise.resolve(credentials.get(key) ?? null),
      save: (key, credential) => {
        credentials.set(key, credential);
        return Promise.resolve();
      },
    };

    await connectT3Code({
      pairingUrl: "http://127.0.0.1:3773/pair#token=pairing-secret",
      credentialStore: store,
    });
    const restored = await connectT3Code({
      endpoint: "http://127.0.0.1:3773",
      credentialStore: store,
    });

    expect(restored.environment.id).toBe("environment-1");
    expect([...credentials.values()]).toEqual(["private-bearer"]);
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        requestUrl(input).endsWith("/oauth/token"),
      ),
    ).toHaveLength(1);
  });

  it("replaces a rejected saved credential by pairing again", async () => {
    const fetchMock = installPairingFetch({
      rejectedBearer: "expired-bearer",
    });
    let credential = "expired-bearer";
    const store: T3CodeCredentialStore = {
      delete: () => {
        credential = "";
        return Promise.resolve();
      },
      load: () => Promise.resolve(credential || null),
      save: (_key, value) => {
        credential = value;
        return Promise.resolve();
      },
    };

    await connectT3Code({
      endpoint: "http://127.0.0.1:3773",
      pairingCode: "pairing-secret",
      credentialStore: store,
    });

    expect(credential).toBe("private-bearer");
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        requestUrl(input).endsWith("/oauth/token"),
      ),
    ).toHaveLength(1);
  });

  it("keeps a newly issued credential when session verification temporarily fails", async () => {
    installPairingFetch({ sessionFailureStatus: 503 });
    let credential: string | null = null;
    const store: T3CodeCredentialStore = {
      delete: () => {
        credential = null;
        return Promise.resolve();
      },
      load: () => Promise.resolve(credential),
      save: (_key, value) => {
        credential = value;
        return Promise.resolve();
      },
    };

    await expect(
      connectT3Code({
        endpoint: "http://127.0.0.1:3773",
        pairingCode: "pairing-secret",
        credentialStore: store,
      }),
    ).rejects.toMatchObject({ code: "REQUEST_FAILED", status: 503 });
    expect(credential).toBe("private-bearer");
  });

  it("provides typed overview, history, and command actions", async () => {
    const fetchMock = installPairingFetch();
    const connection = await connectT3Code({
      endpoint: "http://127.0.0.1:3773",
      pairingCode: "pairing-secret",
    });

    await expect(connection.actions.getOverview()).resolves.toMatchObject({
      sequence: 20,
      projects: [{ id: "project-1", workspaceRoot: "/workspace" }],
      threads: [{ id: "thread-1", latestTurnState: null }],
    });
    await expect(
      connection.actions.getThread({ threadId: "thread-1", turnLimit: 5 }),
    ).resolves.toMatchObject({
      sequence: 20,
      messages: [{ role: "assistant", text: "Ready." }],
    });
    await connection.actions.createProject({
      projectId: "project-2",
      title: "Second project",
      workspaceRoot: "/workspace/second",
    });
    await connection.actions.createThread({
      threadId: "thread-2",
      projectId: "project-1",
      model: selectedModel,
    });
    await connection.actions.sendMessage({
      threadId: "thread-1",
      text: "Do the task",
    });
    await connection.actions.interruptTurn("thread-1");
    await connection.actions.renameThread("thread-1", "Renamed");
    await connection.actions.archiveThread("thread-1");
    await connection.actions.unarchiveThread("thread-1");
    await connection.actions.deleteThread("thread-1");

    const dispatched = fetchMock.mock.calls
      .filter(([input]) =>
        requestUrl(input).endsWith("/api/orchestration/dispatch"),
      )
      .map(([, init]) => jsonBody(init?.body));
    expect(dispatched.map(({ type }) => type)).toEqual([
      "project.create",
      "thread.create",
      "thread.turn.start",
      "thread.turn.interrupt",
      "thread.meta.update",
      "thread.archive",
      "thread.unarchive",
      "thread.delete",
    ]);
    expect(dispatched[2]).toMatchObject({
      threadId: "thread-1",
      message: { role: "user", text: "Do the task", attachments: [] },
    });
  });

  it("runs a turn until the accepted command reaches a terminal state", async () => {
    installPairingFetch({
      threadSnapshots: [
        { sequence: 21, state: "running" },
        { sequence: 22, state: "completed" },
      ],
    });
    const connection = await connectT3Code({
      endpoint: "http://127.0.0.1:3773",
      pairingCode: "pairing-secret",
    });

    const result = await connection.actions.runTurn({
      threadId: "thread-1",
      text: "Finish the task",
      pollIntervalMs: 1,
      timeoutMs: 100,
    });

    expect(result.sequence).toBe(22);
    expect(result.thread.latestTurnState).toBe("completed");
  });

  it("validates runTurn polling options before dispatching", async () => {
    const fetchMock = installPairingFetch();
    const connection = await connectT3Code({
      endpoint: "http://127.0.0.1:3773",
      pairingCode: "pairing-secret",
    });

    await expect(
      connection.actions.runTurn({
        threadId: "thread-1",
        text: "Must not be dispatched",
        timeoutMs: 0,
      }),
    ).rejects.toMatchObject({ code: "INVALID_OPTIONS" });
    expect(
      fetchMock.mock.calls.some(([input]) =>
        requestUrl(input).endsWith("/api/orchestration/dispatch"),
      ),
    ).toBe(false);
  });

  it("rejects an invalid code without exposing it in the error", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(json(descriptor))
        .mockResolvedValueOnce(json({ reason: "invalid" }, 401)),
    );

    const result = connectT3Code({
      endpoint: "http://127.0.0.1:3773",
      pairingCode: "do-not-leak-this-code",
    });

    await expect(result).rejects.toMatchObject({
      code: "PAIRING_REJECTED",
      status: 401,
    });
    await expect(result).rejects.not.toThrow("do-not-leak-this-code");
  });

  it("uses stable errors for invalid pairing inputs", async () => {
    const result = connectT3Code({
      pairingUrl: "https://example.com/pair",
    });

    await expect(result).rejects.toBeInstanceOf(T3CodeError);
    await expect(result).rejects.toMatchObject({ code: "INVALID_OPTIONS" });
  });
});
