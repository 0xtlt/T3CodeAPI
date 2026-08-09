import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import { connectT3Code, createFileCredentialStore } from "../../dist/index.js";

const execute = promisify(execFile);
const image = process.env.T3CODE_TEST_IMAGE ?? "t3code-api:test";
const containerName = `t3code-api-test-${randomUUID()}`;
const temporaryDirectory = await mkdtemp(
  join(tmpdir(), "t3code-api-integration-"),
);
const workspace = join(temporaryDirectory, "workspace");
const credentialStore = createFileCredentialStore({
  directory: join(temporaryDirectory, "credentials"),
});
let containerId;

async function docker(args) {
  return await execute("docker", args, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
}

async function waitForServer(id) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const [{ stdout: state }, { stdout: logs }] = await Promise.all([
      docker([
        "inspect",
        "--format",
        "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}",
        id,
      ]),
      docker(["logs", id]),
    ]);
    const token = /Pairing URL:\s+\S*[?#]token=([^\s&]+)/u.exec(logs)?.[1];
    if (state.trim() === "healthy" && token !== undefined) {
      return decodeURIComponent(token);
    }
    if (["dead", "exited", "unhealthy"].includes(state.trim())) {
      throw new Error(`T3 Code fixture became ${state.trim()}.`);
    }
    await delay(250);
  }
  throw new Error("T3 Code fixture did not become ready within 90 seconds.");
}

try {
  await mkdir(workspace);
  await chmod(workspace, 0o777);
  const { stdout } = await docker([
    "run",
    "--detach",
    "--name",
    containerName,
    "--init",
    "--publish",
    "127.0.0.1::3773",
    "--env",
    "OPENROUTER_API_KEY=integration-test-placeholder",
    "--volume",
    `${workspace}:/workspace`,
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges:true",
    image,
  ]);
  containerId = stdout.trim();
  const pairingCode = await waitForServer(containerId);
  const { stdout: published } = await docker(["port", containerId, "3773/tcp"]);
  const port = /:(\d+)\s*$/u.exec(published)?.[1];
  if (port === undefined) {
    throw new Error("Docker did not report the fixture's published port.");
  }

  const connection = await connectT3Code({
    pairingUrl: `http://127.0.0.1:${port}/pair#token=${encodeURIComponent(pairingCode)}`,
    credentialStore,
    timeoutMs: 15_000,
  });
  if (connection.session.scopes.length === 0) {
    throw new Error("T3 Code established a session without scopes.");
  }
  let overview = await connection.actions.getOverview();
  if (overview.projects.length === 0) {
    const created = await connection.actions.createProject({
      title: "Integration fixture",
      workspaceRoot: "/workspace",
    });
    const deadline = Date.now() + 10_000;
    while (
      Date.now() < deadline &&
      !overview.projects.some(({ id }) => id === created.id)
    ) {
      await delay(100);
      overview = await connection.actions.getOverview();
    }
    if (!overview.projects.some(({ id }) => id === created.id)) {
      throw new Error("T3 Code did not project the created fixture project.");
    }
  }
  const restored = await connectT3Code({
    endpoint: `http://127.0.0.1:${port}`,
    credentialStore,
    timeoutMs: 15_000,
  });
  const socket = await restored.openWebSocket({ timeoutMs: 15_000 });
  socket.close();
  process.stdout.write(
    `Paired with T3 Code ${connection.environment.serverVersion}, restored its credential, read ${String(overview.projects.length)} project(s), and opened its WebSocket.\n`,
  );
} finally {
  if (containerId !== undefined) {
    await docker(["rm", "--force", "--volumes", containerId]).catch(() => {});
  }
  await rm(temporaryDirectory, { recursive: true, force: true });
}
