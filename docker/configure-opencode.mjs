import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const prefix = "openrouter/";
const configuredModel =
  process.env.T3CODE_OPENROUTER_MODEL ??
  "openrouter/deepseek/deepseek-v4-flash-0731";
const canonicalModel = configuredModel.startsWith(prefix)
  ? configuredModel
  : `${prefix}${configuredModel}`;
const modelId = canonicalModel.slice(prefix.length);

if (modelId.split("/").filter(Boolean).length < 2) {
  throw new TypeError(
    "T3CODE_OPENROUTER_MODEL must identify an OpenRouter provider/model.",
  );
}

const runtimeHome = process.env.HOME;
if (runtimeHome === undefined || !runtimeHome.startsWith("/")) {
  throw new TypeError("HOME must be an absolute path.");
}

const configDirectory = join(runtimeHome, ".config", "opencode");
const configPath = join(configDirectory, "opencode.json");
const config = {
  $schema: "https://opencode.ai/config.json",
  model: canonicalModel,
  small_model: canonicalModel,
  provider: {
    openrouter: {
      models: {
        [modelId]: {},
      },
    },
  },
};

await mkdir(configDirectory, { recursive: true });
await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, {
  encoding: "utf8",
  mode: 0o600,
});
