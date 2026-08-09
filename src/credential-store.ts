import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

import { T3CodeError } from "./t3code-client.js";

/**
 * Persistent storage for T3 Code bearer credentials.
 *
 * Values passed to this interface are secrets. Implementations must avoid
 * logging them and should use encryption or restrictive filesystem permissions.
 */
export interface T3CodeCredentialStore {
  /** Removes a saved credential. */
  delete(key: string): Promise<void>;
  /** Loads a saved credential, or `null` when none exists. */
  load(key: string): Promise<string | null>;
  /** Saves or replaces a credential. */
  save(key: string, credential: string): Promise<void>;
}

/** Options for {@link createFileCredentialStore}. */
export interface T3CodeFileCredentialStoreOptions {
  /**
   * Directory containing credential files.
   *
   * Defaults to `$XDG_CONFIG_HOME/t3code-api/credentials`, or
   * `~/.config/t3code-api/credentials` when XDG is unavailable.
   */
  readonly directory?: string;
}

interface StoredCredential {
  readonly credential: string;
  readonly key: string;
  readonly version: 1;
}

function defaultDirectory(): string {
  const configured = process.env["XDG_CONFIG_HOME"]?.trim();
  const base =
    configured !== undefined && configured !== "" && isAbsolute(configured)
      ? configured
      : join(homedir(), ".config");
  return join(base, "t3code-api", "credentials");
}

function storeFailure(): T3CodeError {
  return new T3CodeError(
    "CREDENTIAL_STORE_FAILED",
    "The T3 Code credential store operation failed.",
  );
}

function fileName(key: string): string {
  return `${createHash("sha256").update(key).digest("hex")}.json`;
}

function decodeStoredCredential(raw: string, key: string): string {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw storeFailure();
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw storeFailure();
  }
  const stored = value as Readonly<Record<string, unknown>>;
  const credential = stored["credential"];
  if (
    stored["version"] !== 1 ||
    stored["key"] !== key ||
    typeof credential !== "string" ||
    credential.trim() === ""
  ) {
    throw storeFailure();
  }
  return credential;
}

/**
 * Creates a dependency-free credential store backed by owner-only files.
 *
 * Each server credential is stored in a separate `0600` JSON file inside a
 * `0700` directory on POSIX systems. Windows applications and applications
 * requiring OS-keychain encryption must provide their own
 * {@link T3CodeCredentialStore} implementation instead.
 *
 * @param options - Optional storage directory override.
 */
export function createFileCredentialStore(
  options: T3CodeFileCredentialStoreOptions = {},
): T3CodeCredentialStore {
  if (process.platform === "win32") {
    throw new T3CodeError(
      "INVALID_OPTIONS",
      "createFileCredentialStore is unavailable on Windows; provide a credential store backed by Windows Credential Manager or another secret manager.",
    );
  }
  const rawDirectory = options.directory ?? defaultDirectory();
  const directory = rawDirectory.trim();
  if (directory === "") {
    throw new T3CodeError(
      "INVALID_OPTIONS",
      "credential store directory must not be empty.",
    );
  }

  const pathFor = (key: string): string => join(directory, fileName(key));
  return Object.freeze({
    delete: async (key: string): Promise<void> => {
      try {
        await rm(pathFor(key), { force: true });
      } catch {
        throw storeFailure();
      }
    },
    load: async (key: string): Promise<string | null> => {
      let raw: string;
      try {
        raw = await readFile(pathFor(key), "utf8");
      } catch (cause: unknown) {
        if (
          typeof cause === "object" &&
          cause !== null &&
          "code" in cause &&
          cause.code === "ENOENT"
        ) {
          return null;
        }
        throw storeFailure();
      }
      return decodeStoredCredential(raw, key);
    },
    save: async (key: string, credential: string): Promise<void> => {
      const temporary = join(
        directory,
        `.${fileName(key)}.${randomUUID()}.tmp`,
      );
      const value: StoredCredential = { version: 1, key, credential };
      try {
        await mkdir(directory, { recursive: true, mode: 0o700 });
        await chmod(directory, 0o700);
        await writeFile(temporary, `${JSON.stringify(value)}\n`, {
          encoding: "utf8",
          flag: "wx",
          mode: 0o600,
        });
        await rename(temporary, pathFor(key));
        await chmod(pathFor(key), 0o600);
      } catch {
        throw storeFailure();
      } finally {
        await rm(temporary, { force: true }).catch(() => undefined);
      }
    },
  });
}
