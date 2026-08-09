# t3code-api

Pair with an existing [T3 Code](https://github.com/pingdotgg/t3code) server from Node.js. The library exchanges a one-time pairing code, keeps the resulting bearer token private, and exposes authenticated HTTP and WebSocket transports.

The package is ESM-only, has no runtime dependencies, and requires Node.js 22.16 or newer.

## Install

```bash
npm install t3code-api
```

## Connect

Use the pairing URL printed by `t3 serve` once, and persist the exchanged
credential:

```ts
import { connectT3Code, createFileCredentialStore } from "t3code-api";

const pairingUrl = process.env.T3CODE_PAIRING_URL;
if (!pairingUrl)
  throw new Error("T3CODE_PAIRING_URL is required for first pairing");

const credentials = createFileCredentialStore();

const t3 = await connectT3Code({
  pairingUrl,
  credentialStore: credentials,
  client: { label: "My integration", deviceType: "bot" },
});

console.log(t3.environment.label, t3.environment.serverVersion);
```

Later processes reconnect with the server endpoint and saved credential. The
consumed pairing URL is no longer needed:

```ts
const t3 = await connectT3Code({
  endpoint: "http://127.0.0.1:3773",
  credentialStore: credentials,
});
```

`createFileCredentialStore()` stores each credential in a separate `0600` file
inside an owner-only `0700` directory. Pass `{ directory }` to control its
location, or implement `T3CodeCredentialStore` with an OS keychain or secret
manager. The built-in store is POSIX-only because filesystem modes do not
provide equivalent protection on Windows. Store callbacks receive bearer
credentials and must treat them as secrets.

## Useful actions

The common orchestration flow is pre-coded and typed:

```ts
const overview = await t3.actions.getOverview();
const project = overview.projects[0];
if (!project?.defaultModel) throw new Error("Project has no default model");

const created = await t3.actions.createThread({
  projectId: project.id,
  model: project.defaultModel,
  title: "Automated task",
});

const finished = await t3.actions.runTurn({
  threadId: created.id,
  text: "Update the README and run its tests.",
});

console.log(finished.messages.at(-1)?.text);
```

`actions` includes:

- `getOverview()` and paginated `getThread()` reads;
- `createProject()` and `createThread()`;
- `sendMessage()` for asynchronous dispatch and `runTurn()` for dispatch plus waiting;
- `interruptTurn()` and `renameThread()`;
- `archiveThread()`, `unarchiveThread()`, and `deleteThread()`.

New threads and turns default to T3 Code's non-interactive `full-access`
runtime mode. Select a narrower mode when your integration also handles the
corresponding interactive approval flow; otherwise `runTurn()` may wait until
its timeout.

The raw authenticated transports remain available for less common operations:

```ts
const response = await t3.request("/api/orchestration/snapshot");
if (!response.ok) throw new Error(`T3 Code returned ${response.status}`);
const snapshot: unknown = await response.json();

const socket = await t3.openWebSocket();
// The socket uses T3 Code's native RPC wire protocol.
socket.close();
```

Pairing codes are one-time credentials. A failed attempt may consume a valid code, so obtain a new code before retrying an authentication failure. The returned object intentionally exposes neither the code nor the bearer token.

## API

### `connectT3Code(options)`

Discovers the server and first tries its saved credential. When none exists, it
exchanges a `pairingUrl` or `endpoint` plus `pairingCode`, verifies the session,
and saves the new credential when `credentialStore` is present. An endpoint plus
store is sufficient for later connections.

By default, the client requests T3 Code's standard scopes: orchestration read/operate, terminal operate, review write, and relay read. Pass `scopes` to request a narrower or administrative set permitted by the pairing credential.

The returned connection contains:

- `endpoint`: normalized server HTTP URL without credentials;
- `environment`: stable server identity, platform, and version fields;
- `session`: non-secret expiration and granted scopes;
- `actions`: typed project, thread, and turn operations;
- `request(path, init?)`: authenticated same-origin fetch with redirects disabled;
- `openWebSocket(options?)`: an opened standard WebSocket using a fresh one-time ticket.

`openWebSocket()` deliberately returns a platform `WebSocket` instead of exporting T3 Code's private Effect RPC contracts. This keeps this package's API small and prevents upstream implementation types from becoming part of its SemVer contract.

## Docker integration fixture

Docker is test infrastructure only; it is not exported or included in the npm package. It provides a disposable T3 Code/OpenCode environment for compatibility testing.

```bash
npm run build
docker build -t t3code-api:test -f docker/Dockerfile .
T3CODE_TEST_IMAGE=t3code-api:test npm run test:integration:docker
```

The integration script uses a dummy OpenRouter key because pairing and opening the authenticated socket do not invoke a model. It starts a loopback-only container and always removes the container and temporary workspace.

For a manual model-backed smoke test, create `.secrets/openrouter_api_key`, then run `docker compose up --build`. The fixture pins T3 Code, OpenCode, and `openrouter/deepseek/deepseek-v4-flash-0731`. Destroy it afterward with:

```bash
docker compose down --volumes --remove-orphans
```

## Versioning

This project follows [Semantic Versioning](https://semver.org/). Public exports and their TypeScript declarations are the compatibility boundary. T3 Code's HTTP and WebSocket protocols evolve independently; compatibility fixture updates are recorded in the changelog.

## Security

- Pairing codes and bearer credentials never appear on returned objects or in library errors.
- The POSIX-only built-in file store applies owner-only permissions; use a keychain-backed custom store on Windows or when encryption at rest is required.
- Authenticated requests are restricted to the paired server's origin.
- Redirects are disabled to prevent credential forwarding.
- WebSocket tickets are requested only when opening a socket and are single-use.
- Treat a returned socket's `url` as sensitive until its ticket expires.
