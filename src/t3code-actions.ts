import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

/** Runtime permission policy used for a T3 Code thread. */
export type T3CodeRuntimeMode =
  "approval-required" | "auto-accept-edits" | "auto" | "full-access";

/** Provider interaction behavior used for a T3 Code thread. */
export type T3CodeInteractionMode = "default" | "plan";

/** A configured provider instance and model. */
export interface T3CodeModelSelection {
  /** Provider-instance identifier configured in T3 Code. */
  readonly instanceId: string;
  /** Provider-specific model identifier. */
  readonly model: string;
  /** Provider-specific options preserved on the wire. */
  readonly options?: readonly T3CodeModelOption[];
}

/** A provider-specific model option. */
export interface T3CodeModelOption {
  /** Option identifier. */
  readonly id: string;
  /** Selected option value. */
  readonly value: string | boolean;
}

/** Stable project summary returned by {@link T3CodeActions.getOverview}. */
export interface T3CodeProject {
  /** Project identifier. */
  readonly id: string;
  /** Display title. */
  readonly title: string;
  /** Absolute workspace path on the T3 Code host. */
  readonly workspaceRoot: string;
  /** Project default, when configured. */
  readonly defaultModel: T3CodeModelSelection | null;
  /** Creation timestamp. */
  readonly createdAt: string;
  /** Last-update timestamp. */
  readonly updatedAt: string;
}

/** State of the latest turn visible in a thread summary. */
export type T3CodeTurnState = "running" | "interrupted" | "completed" | "error";

/** Stable thread summary returned by {@link T3CodeActions.getOverview}. */
export interface T3CodeThread {
  /** Thread identifier. */
  readonly id: string;
  /** Owning project identifier. */
  readonly projectId: string;
  /** Display title. */
  readonly title: string;
  /** Selected provider instance and model. */
  readonly model: T3CodeModelSelection;
  /** Runtime permission policy. */
  readonly runtimeMode: T3CodeRuntimeMode;
  /** Provider interaction behavior. */
  readonly interactionMode: T3CodeInteractionMode;
  /** Latest turn state, or `null` before the first turn. */
  readonly latestTurnState: T3CodeTurnState | null;
  /** Current provider session state, or `null` when no session exists. */
  readonly sessionStatus: string | null;
  /** Archive timestamp, or `null` for an active thread. */
  readonly archivedAt: string | null;
  /** Creation timestamp. */
  readonly createdAt: string;
  /** Last-update timestamp. */
  readonly updatedAt: string;
}

/** A stable chat-message projection. */
export interface T3CodeMessage {
  /** Message identifier. */
  readonly id: string;
  /** Author role. */
  readonly role: "user" | "assistant" | "system";
  /** Message text accumulated so far. */
  readonly text: string;
  /** Whether T3 Code is still streaming this message. */
  readonly streaming: boolean;
  /** Creation timestamp. */
  readonly createdAt: string;
  /** Last-update timestamp. */
  readonly updatedAt: string;
}

/** Thread history and synchronization metadata. */
export interface T3CodeThreadDetails {
  /** Snapshot sequence used for command/read synchronization. */
  readonly sequence: number;
  /** Stable thread summary. */
  readonly thread: T3CodeThread;
  /** Messages included in this history page. */
  readonly messages: readonly T3CodeMessage[];
  /** Opaque cursor for older history, or `null` when fully loaded. */
  readonly beforeCursor: string | null;
  /** Whether older history is available. */
  readonly hasMore: boolean;
}

/** Project/thread overview at a server sequence. */
export interface T3CodeOverview {
  /** Snapshot sequence used for command/read synchronization. */
  readonly sequence: number;
  /** Projects visible to the session. */
  readonly projects: readonly T3CodeProject[];
  /** Threads visible to the session. */
  readonly threads: readonly T3CodeThread[];
  /** Snapshot timestamp. */
  readonly updatedAt: string;
}

/** Result of a dispatched T3 Code action. */
export interface T3CodeActionResult {
  /** Server sequence assigned to the command. */
  readonly sequence: number;
}

/** Result of creating a project or thread. */
export interface T3CodeCreatedResource extends T3CodeActionResult {
  /** Client-generated resource identifier. */
  readonly id: string;
}

/** Input for creating a project. */
export interface T3CodeCreateProjectInput {
  /** Display title. */
  readonly title: string;
  /** Absolute workspace path on the T3 Code host. */
  readonly workspaceRoot: string;
  /** Creates the workspace directory when it does not exist. */
  readonly createWorkspaceRootIfMissing?: boolean;
  /** Default model for new threads. */
  readonly defaultModel?: T3CodeModelSelection | null;
  /** Optional caller-provided project identifier. */
  readonly projectId?: string;
}

/** Input for creating a thread. */
export interface T3CodeCreateThreadInput {
  /** Owning project identifier. */
  readonly projectId: string;
  /** Provider instance and model. */
  readonly model: T3CodeModelSelection;
  /** Display title. Defaults to `New thread`. */
  readonly title?: string;
  /** Runtime permission policy. Defaults to `full-access`. */
  readonly runtimeMode?: T3CodeRuntimeMode;
  /** Provider interaction behavior. Defaults to `default`. */
  readonly interactionMode?: T3CodeInteractionMode;
  /** Git branch, when already known. */
  readonly branch?: string | null;
  /** Worktree path, when already prepared. */
  readonly worktreePath?: string | null;
  /** Optional caller-provided thread identifier. */
  readonly threadId?: string;
}

/** Input for sending a user message and starting a turn. */
export interface T3CodeSendMessageInput {
  /** Target thread identifier. */
  readonly threadId: string;
  /** User prompt, up to 120,000 characters. */
  readonly text: string;
  /** Optional model override for this turn. */
  readonly model?: T3CodeModelSelection;
  /** Runtime permission policy. Defaults to `full-access`. */
  readonly runtimeMode?: T3CodeRuntimeMode;
  /** Provider interaction behavior. Defaults to `default`. */
  readonly interactionMode?: T3CodeInteractionMode;
}

/** Input for reading a thread history page. */
export interface T3CodeGetThreadInput {
  /** Thread identifier. */
  readonly threadId: string;
  /** Number of recent user turns to include. */
  readonly turnLimit?: number;
  /** Opaque cursor returned by an earlier page. */
  readonly beforeCursor?: string;
}

/** Input for running a turn and waiting for its terminal projection. */
export interface T3CodeRunTurnInput extends T3CodeSendMessageInput {
  /** Poll interval in milliseconds. Defaults to 500. */
  readonly pollIntervalMs?: number;
  /** Maximum wait in milliseconds. Defaults to five minutes. */
  readonly timeoutMs?: number;
}

/** High-value operations implemented over T3 Code's HTTP orchestration API. */
export interface T3CodeActions {
  /** Archives a thread without deleting its history. */
  archiveThread(threadId: string): Promise<T3CodeActionResult>;
  /** Creates a project. */
  createProject(
    input: T3CodeCreateProjectInput,
  ): Promise<T3CodeCreatedResource>;
  /** Creates a thread. */
  createThread(input: T3CodeCreateThreadInput): Promise<T3CodeCreatedResource>;
  /** Permanently deletes a thread projection. */
  deleteThread(threadId: string): Promise<T3CodeActionResult>;
  /** Reads projects and lightweight thread summaries. */
  getOverview(): Promise<T3CodeOverview>;
  /** Reads a full or windowed thread history. */
  getThread(input: T3CodeGetThreadInput): Promise<T3CodeThreadDetails>;
  /** Interrupts the currently active turn. */
  interruptTurn(threadId: string): Promise<T3CodeActionResult>;
  /** Renames a thread. */
  renameThread(threadId: string, title: string): Promise<T3CodeActionResult>;
  /** Sends a prompt and waits until its projected turn completes or fails. */
  runTurn(input: T3CodeRunTurnInput): Promise<T3CodeThreadDetails>;
  /** Sends a prompt and returns after T3 Code accepts the command. */
  sendMessage(input: T3CodeSendMessageInput): Promise<T3CodeActionResult>;
  /** Restores an archived thread. */
  unarchiveThread(threadId: string): Promise<T3CodeActionResult>;
}

type JsonRecord = Readonly<Record<string, unknown>>;
type JsonRequester = (path: string, init?: RequestInit) => Promise<unknown>;
type InvalidResponse = (message: string) => never;
type InvalidOptions = (message: string) => never;
type ActionTimeout = () => never;

function record(
  value: unknown,
  invalid: InvalidResponse,
  label: string,
): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return invalid(`T3 Code returned invalid ${label}.`);
  }
  return value as JsonRecord;
}

function text(
  recordValue: JsonRecord,
  key: string,
  invalid: InvalidResponse,
): string {
  const value = recordValue[key];
  if (typeof value !== "string") {
    return invalid(`T3 Code returned an invalid ${key} field.`);
  }
  return value;
}

function nullableText(
  recordValue: JsonRecord,
  key: string,
  invalid: InvalidResponse,
): string | null {
  const value = recordValue[key];
  if (value === null) return null;
  if (typeof value !== "string") {
    return invalid(`T3 Code returned an invalid ${key} field.`);
  }
  return value;
}

function number(
  recordValue: JsonRecord,
  key: string,
  invalid: InvalidResponse,
): number {
  const value = recordValue[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    return invalid(`T3 Code returned an invalid ${key} field.`);
  }
  return value;
}

function array(
  recordValue: JsonRecord,
  key: string,
  invalid: InvalidResponse,
): readonly unknown[] {
  const value = recordValue[key];
  if (!Array.isArray(value)) {
    return invalid(`T3 Code returned an invalid ${key} field.`);
  }
  return value;
}

function model(value: unknown, invalid: InvalidResponse): T3CodeModelSelection {
  const source = record(value, invalid, "model selection");
  const options = source["options"];
  const mappedOptions = Array.isArray(options)
    ? options.map((item) => {
        const option = record(item, invalid, "model option");
        const optionValue = option["value"];
        if (
          typeof optionValue !== "string" &&
          typeof optionValue !== "boolean"
        ) {
          return invalid("T3 Code returned an invalid model option value.");
        }
        return Object.freeze({
          id: text(option, "id", invalid),
          value: optionValue,
        });
      })
    : undefined;
  return Object.freeze({
    instanceId: text(source, "instanceId", invalid),
    model: text(source, "model", invalid),
    ...(mappedOptions === undefined
      ? {}
      : { options: Object.freeze(mappedOptions) }),
  });
}

function project(value: unknown, invalid: InvalidResponse): T3CodeProject {
  const source = record(value, invalid, "project");
  const defaultModel = source["defaultModelSelection"];
  return Object.freeze({
    id: text(source, "id", invalid),
    title: text(source, "title", invalid),
    workspaceRoot: text(source, "workspaceRoot", invalid),
    defaultModel: defaultModel === null ? null : model(defaultModel, invalid),
    createdAt: text(source, "createdAt", invalid),
    updatedAt: text(source, "updatedAt", invalid),
  });
}

function thread(value: unknown, invalid: InvalidResponse): T3CodeThread {
  const source = record(value, invalid, "thread");
  const latestTurn = source["latestTurn"];
  const session = source["session"];
  const rawRuntimeMode = text(source, "runtimeMode", invalid);
  const rawInteractionMode = text(source, "interactionMode", invalid);
  if (
    !["approval-required", "auto-accept-edits", "auto", "full-access"].includes(
      rawRuntimeMode,
    )
  ) {
    return invalid("T3 Code returned an invalid runtimeMode field.");
  }
  if (!["default", "plan"].includes(rawInteractionMode)) {
    return invalid("T3 Code returned an invalid interactionMode field.");
  }
  const latestTurnState =
    latestTurn === null
      ? null
      : text(record(latestTurn, invalid, "latest turn"), "state", invalid);
  if (
    latestTurnState !== null &&
    !["running", "interrupted", "completed", "error"].includes(latestTurnState)
  ) {
    return invalid("T3 Code returned an invalid latest turn state.");
  }
  const sessionStatus =
    session === null
      ? null
      : text(record(session, invalid, "session"), "status", invalid);
  return Object.freeze({
    id: text(source, "id", invalid),
    projectId: text(source, "projectId", invalid),
    title: text(source, "title", invalid),
    model: model(source["modelSelection"], invalid),
    runtimeMode: rawRuntimeMode as T3CodeRuntimeMode,
    interactionMode: rawInteractionMode as T3CodeInteractionMode,
    latestTurnState: latestTurnState as T3CodeTurnState | null,
    sessionStatus,
    archivedAt: nullableText(source, "archivedAt", invalid),
    createdAt: text(source, "createdAt", invalid),
    updatedAt: text(source, "updatedAt", invalid),
  });
}

function message(value: unknown, invalid: InvalidResponse): T3CodeMessage {
  const source = record(value, invalid, "message");
  const role = text(source, "role", invalid);
  if (!["user", "assistant", "system"].includes(role)) {
    return invalid("T3 Code returned an invalid message role.");
  }
  if (typeof source["streaming"] !== "boolean") {
    return invalid("T3 Code returned an invalid streaming field.");
  }
  return Object.freeze({
    id: text(source, "id", invalid),
    role: role as T3CodeMessage["role"],
    text: text(source, "text", invalid),
    streaming: source["streaming"],
    createdAt: text(source, "createdAt", invalid),
    updatedAt: text(source, "updatedAt", invalid),
  });
}

function actionResult(
  value: unknown,
  invalid: InvalidResponse,
): T3CodeActionResult {
  return Object.freeze({
    sequence: number(
      record(value, invalid, "dispatch result"),
      "sequence",
      invalid,
    ),
  });
}

function required(
  value: string,
  label: string,
  invalid: InvalidOptions,
): string {
  if (typeof value !== "string" || value.trim() === "") {
    return invalid(`${label} must not be empty.`);
  }
  return value.trim();
}

function prompt(value: string, invalid: InvalidOptions): string {
  if (typeof value !== "string" || value.trim() === "") {
    return invalid("text must not be empty.");
  }
  return value;
}

function runtimeMode(
  value: T3CodeRuntimeMode | undefined,
  invalid: InvalidOptions,
): T3CodeRuntimeMode {
  const selected = value ?? "full-access";
  if (
    !["approval-required", "auto-accept-edits", "auto", "full-access"].includes(
      selected,
    )
  ) {
    return invalid("runtimeMode is not supported.");
  }
  return selected;
}

function interactionMode(
  value: T3CodeInteractionMode | undefined,
  invalid: InvalidOptions,
): T3CodeInteractionMode {
  const selected = value ?? "default";
  if (!["default", "plan"].includes(selected)) {
    return invalid("interactionMode is not supported.");
  }
  return selected;
}

function validateModel(
  selection: T3CodeModelSelection,
  invalid: InvalidOptions,
): T3CodeModelSelection {
  return {
    ...selection,
    instanceId: required(selection.instanceId, "model.instanceId", invalid),
    model: required(selection.model, "model.model", invalid),
  };
}

/** @internal */
export function createT3CodeActions(
  requestJson: JsonRequester,
  invalidResponse: InvalidResponse,
  invalidOptions: InvalidOptions,
  actionTimeout: ActionTimeout,
): T3CodeActions {
  const dispatch = async (command: JsonRecord): Promise<T3CodeActionResult> =>
    actionResult(
      await requestJson("/api/orchestration/dispatch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(command),
      }),
      invalidResponse,
    );

  const getOverview = async (): Promise<T3CodeOverview> => {
    const source = record(
      await requestJson("/api/orchestration/shell"),
      invalidResponse,
      "overview",
    );
    return Object.freeze({
      sequence: number(source, "snapshotSequence", invalidResponse),
      projects: Object.freeze(
        array(source, "projects", invalidResponse).map((item) =>
          project(item, invalidResponse),
        ),
      ),
      threads: Object.freeze(
        array(source, "threads", invalidResponse).map((item) =>
          thread(item, invalidResponse),
        ),
      ),
      updatedAt: text(source, "updatedAt", invalidResponse),
    });
  };

  const getThread = async (
    input: T3CodeGetThreadInput,
  ): Promise<T3CodeThreadDetails> => {
    const threadId = required(input.threadId, "threadId", invalidOptions);
    const query = new URLSearchParams();
    if (input.turnLimit !== undefined) {
      if (!Number.isSafeInteger(input.turnLimit) || input.turnLimit < 1) {
        return invalidOptions("turnLimit must be a positive safe integer.");
      }
      query.set("turnLimit", String(input.turnLimit));
    }
    if (input.beforeCursor !== undefined) {
      query.set(
        "beforeCursor",
        required(input.beforeCursor, "beforeCursor", invalidOptions),
      );
    }
    const suffix = query.size === 0 ? "" : `?${query.toString()}`;
    const source = record(
      await requestJson(
        `/api/orchestration/threads/${encodeURIComponent(threadId)}${suffix}`,
      ),
      invalidResponse,
      "thread details",
    );
    const rawThread = record(source["thread"], invalidResponse, "thread");
    const pageValue = source["page"];
    const page =
      pageValue === undefined
        ? null
        : record(pageValue, invalidResponse, "thread page");
    return Object.freeze({
      sequence: number(source, "snapshotSequence", invalidResponse),
      thread: thread(rawThread, invalidResponse),
      messages: Object.freeze(
        array(rawThread, "messages", invalidResponse).map((item) =>
          message(item, invalidResponse),
        ),
      ),
      beforeCursor:
        page === null
          ? null
          : nullableText(page, "beforeCursor", invalidResponse),
      hasMore:
        page === null
          ? false
          : page["hasMore"] === true
            ? true
            : page["hasMore"] === false
              ? false
              : invalidResponse("T3 Code returned an invalid hasMore field."),
    });
  };

  const sendMessage = async (
    input: T3CodeSendMessageInput,
  ): Promise<T3CodeActionResult> => {
    const promptText = prompt(input.text, invalidOptions);
    if (promptText.length > 120_000) {
      return invalidOptions("text must not exceed 120,000 characters.");
    }
    return await dispatch({
      type: "thread.turn.start",
      commandId: randomUUID(),
      threadId: required(input.threadId, "threadId", invalidOptions),
      message: {
        messageId: randomUUID(),
        role: "user",
        text: promptText,
        attachments: [],
      },
      ...(input.model === undefined
        ? {}
        : { modelSelection: validateModel(input.model, invalidOptions) }),
      runtimeMode: runtimeMode(input.runtimeMode, invalidOptions),
      interactionMode: interactionMode(input.interactionMode, invalidOptions),
      createdAt: new Date().toISOString(),
    });
  };

  const simpleThreadAction = async (
    type: "thread.archive" | "thread.delete" | "thread.unarchive",
    threadId: string,
  ): Promise<T3CodeActionResult> =>
    await dispatch({
      type,
      commandId: randomUUID(),
      threadId: required(threadId, "threadId", invalidOptions),
    });

  const actions: T3CodeActions = {
    archiveThread: async (threadId) =>
      await simpleThreadAction("thread.archive", threadId),
    createProject: async (input) => {
      const id =
        input.projectId === undefined
          ? randomUUID()
          : required(input.projectId, "projectId", invalidOptions);
      const result = await dispatch({
        type: "project.create",
        commandId: randomUUID(),
        projectId: id,
        title: required(input.title, "title", invalidOptions),
        workspaceRoot: required(
          input.workspaceRoot,
          "workspaceRoot",
          invalidOptions,
        ),
        ...(input.createWorkspaceRootIfMissing === undefined
          ? {}
          : {
              createWorkspaceRootIfMissing: input.createWorkspaceRootIfMissing,
            }),
        ...(input.defaultModel === undefined
          ? {}
          : {
              defaultModelSelection:
                input.defaultModel === null
                  ? null
                  : validateModel(input.defaultModel, invalidOptions),
            }),
        createdAt: new Date().toISOString(),
      });
      return Object.freeze({ id, sequence: result.sequence });
    },
    createThread: async (input) => {
      const id =
        input.threadId === undefined
          ? randomUUID()
          : required(input.threadId, "threadId", invalidOptions);
      const result = await dispatch({
        type: "thread.create",
        commandId: randomUUID(),
        threadId: id,
        projectId: required(input.projectId, "projectId", invalidOptions),
        title:
          input.title === undefined
            ? "New thread"
            : required(input.title, "title", invalidOptions),
        modelSelection: validateModel(input.model, invalidOptions),
        runtimeMode: runtimeMode(input.runtimeMode, invalidOptions),
        interactionMode: interactionMode(input.interactionMode, invalidOptions),
        branch: input.branch ?? null,
        worktreePath: input.worktreePath ?? null,
        createdAt: new Date().toISOString(),
      });
      return Object.freeze({ id, sequence: result.sequence });
    },
    deleteThread: async (threadId) =>
      await simpleThreadAction("thread.delete", threadId),
    getOverview,
    getThread,
    interruptTurn: async (threadId) =>
      await dispatch({
        type: "thread.turn.interrupt",
        commandId: randomUUID(),
        threadId: required(threadId, "threadId", invalidOptions),
        createdAt: new Date().toISOString(),
      }),
    renameThread: async (threadId, title) =>
      await dispatch({
        type: "thread.meta.update",
        commandId: randomUUID(),
        threadId: required(threadId, "threadId", invalidOptions),
        title: required(title, "title", invalidOptions),
      }),
    runTurn: async (input) => {
      const timeoutMs = input.timeoutMs ?? 300_000;
      const pollIntervalMs = input.pollIntervalMs ?? 500;
      if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
        return invalidOptions("timeoutMs must be a positive safe integer.");
      }
      if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 1) {
        return invalidOptions(
          "pollIntervalMs must be a positive safe integer.",
        );
      }
      const accepted = await sendMessage(input);
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const details = await getThread({ threadId: input.threadId });
        if (
          details.sequence >= accepted.sequence &&
          details.thread.latestTurnState !== null &&
          details.thread.latestTurnState !== "running"
        ) {
          return details;
        }
        await delay(pollIntervalMs);
      }
      return actionTimeout();
    },
    sendMessage,
    unarchiveThread: async (threadId) =>
      await simpleThreadAction("thread.unarchive", threadId),
  };
  return Object.freeze(actions);
}
