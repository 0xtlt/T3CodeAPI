import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createFileCredentialStore } from "../src/index.js";

const directories: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("createFileCredentialStore", () => {
  it("persists, reloads, and deletes an owner-only credential", async () => {
    if (process.platform === "win32") {
      expect(() => createFileCredentialStore()).toThrow(
        "createFileCredentialStore is unavailable on Windows",
      );
      return;
    }
    const directory = await mkdtemp(join(tmpdir(), "t3code-api-store-"));
    directories.push(directory);
    const first = createFileCredentialStore({ directory });

    await first.save("environment-key", "private-bearer");

    const second = createFileCredentialStore({ directory });
    await expect(second.load("environment-key")).resolves.toBe(
      "private-bearer",
    );
    const files = await readdir(directory);
    expect(files).toHaveLength(1);
    expect((await stat(join(directory, files[0] ?? ""))).mode & 0o777).toBe(
      0o600,
    );
    expect((await stat(directory)).mode & 0o777).toBe(0o700);

    await second.delete("environment-key");
    await expect(first.load("environment-key")).resolves.toBeNull();
  });

  it("ignores a relative XDG_CONFIG_HOME for the default directory", async () => {
    if (process.platform === "win32") return;
    const home = await mkdtemp(join(tmpdir(), "t3code-api-home-"));
    directories.push(home);
    vi.stubEnv("HOME", home);
    vi.stubEnv("XDG_CONFIG_HOME", "relative-config");

    const store = createFileCredentialStore();
    await store.save("environment-key", "private-bearer");

    const files = await readdir(
      join(home, ".config", "t3code-api", "credentials"),
    );
    expect(files).toHaveLength(1);
  });
});
