// A pushable async iterable: allows you to push items and consume them with for-await.

import { Readable, Writable } from "node:stream";
import { WritableStream, ReadableStream } from "node:stream/web";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  createReadStream,
  createWriteStream,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { Logger } from "./acp-agent.js";

// Useful for bridging push-based and async-iterator-based code.
export class Pushable<T> implements AsyncIterable<T> {
  private queue: T[] = [];
  private resolvers: ((value: IteratorResult<T>) => void)[] = [];
  private done = false;

  push(item: T) {
    if (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift()!;
      resolve({ value: item, done: false });
    } else {
      this.queue.push(item);
    }
  }

  end() {
    this.done = true;
    while (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift()!;
      resolve({ value: undefined as any, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        if (this.queue.length > 0) {
          const value = this.queue.shift()!;
          return Promise.resolve({ value, done: false });
        }
        if (this.done) {
          return Promise.resolve({ value: undefined as any, done: true });
        }
        return new Promise<IteratorResult<T>>((resolve) => {
          this.resolvers.push(resolve);
        });
      },
    };
  }
}

// Helper to convert Node.js streams to Web Streams
export function nodeToWebWritable(nodeStream: Writable): WritableStream<Uint8Array> {
  return new WritableStream<Uint8Array>({
    write(chunk) {
      return new Promise<void>((resolve, reject) => {
        nodeStream.write(Buffer.from(chunk), (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    },
  });
}

export function nodeToWebReadable(nodeStream: Readable): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream.on("data", (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });
      nodeStream.on("end", () => controller.close());
      nodeStream.on("error", (err) => controller.error(err));
    },
  });
}

export function unreachable(value: never, logger: Logger = console) {
  let valueAsString;
  try {
    valueAsString = JSON.stringify(value);
  } catch {
    valueAsString = value;
  }
  logger.error(`Unexpected case: ${valueAsString}`);
}

export function sleep(time: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, time));
}

interface ManagedSettings {
  permissions?: {
    allow?: string[];
    deny?: string[];
  };
  env?: Record<string, string>;
  z_ai?: {
    enabled?: boolean;
    api_endpoint?: string;
    model_mapping?: Record<string, string>;
  };
}

// Following the rules in https://docs.anthropic.com/en/docs/claude-code/settings#settings-files
// This can be removed once the SDK supports it natively.
function getManagedSettingsPath(): string {
  // Check for custom path in environment variable first
  const customPath = process.env.CLAUDE_CODE_SETTINGS_PATH;
  if (customPath) {
    return customPath;
  }

  // Default to ~/.config/z-ai-acp/
  const homeDir = homedir();
  const configDir = path.join(homeDir, ".config", "z-ai-acp");
  return path.join(configDir, "managed-settings.json");

  // Original system-wide paths (commented out)
  // const os = platform();
  // switch (os) {
  //   case "darwin":
  //     return "/Library/Application Support/ClaudeCode/managed-settings.json";
  //   case "linux": // including WSL
  //     return "/etc/claude-code/managed-settings.json";
  //   case "win32":
  //     return "C:\\ProgramData\\ClaudeCode\\managed-settings.json";
  //   default:
  //     return "/etc/claude-code/managed-settings.json";
  // }
}

export function loadManagedSettings(): ManagedSettings | null {
  try {
    return JSON.parse(readFileSync(getManagedSettingsPath(), "utf8")) as ManagedSettings;
  } catch {
    return null;
  }
}

export function applyEnvironmentSettings(settings: ManagedSettings): void {
  if (settings.env) {
    for (const [key, value] of Object.entries(settings.env)) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }

  // Apply z_ai specific settings
  if (settings.z_ai) {
    const zAiConfig = settings.z_ai;

    // Override env vars with z_ai config if enabled
    if (zAiConfig.enabled) {
      if (zAiConfig.api_endpoint && process.env.ANTHROPIC_BASE_URL === undefined) {
        process.env.ANTHROPIC_BASE_URL = zAiConfig.api_endpoint;
      }

      // Set model mapping for reference
      if (zAiConfig.model_mapping) {
        process.env.Z_AI_MODEL_MAPPING_CONFIG = JSON.stringify(zAiConfig.model_mapping);
      }

      process.env.Z_AI_ENABLED = "true";
    }
  }
}

export interface ExtractLinesResult {
  content: string;
  wasLimited: boolean;
  linesRead: number;
}

/**
 * Extracts lines from file content with byte limit enforcement.
 *
 * @param fullContent - The complete file content
 * @param maxContentLength - Maximum number of UTF-16 Code Units to return
 * @returns Object containing extracted content and metadata
 */
export function extractLinesWithByteLimit(
  fullContent: string,
  maxContentLength: number,
): ExtractLinesResult {
  if (fullContent === "") {
    return {
      content: "",
      wasLimited: false,
      linesRead: 1,
    };
  }

  let linesSeen = 0;
  let index = 0;
  let contentLength = 0;
  let wasLimited = false;

  while (true) {
    const nextIndex = fullContent.indexOf("\n", index);

    if (nextIndex < 0) {
      // Last line in file (no trailing newline)
      if (linesSeen > 0 && fullContent.length > maxContentLength) {
        wasLimited = true;
        break;
      }
      linesSeen += 1;
      contentLength = fullContent.length;
      break;
    } else {
      // Line with newline - include up to the newline
      const newContentLength = nextIndex + 1;
      if (linesSeen > 0 && newContentLength > maxContentLength) {
        wasLimited = true;
        break;
      }
      linesSeen += 1;
      contentLength = newContentLength;
      index = newContentLength;
    }
  }

  return {
    content: fullContent.slice(0, contentLength),
    wasLimited,
    linesRead: linesSeen,
  };
}

/**
 * Prompts user for API key via terminal input
 * Uses /dev/tty to avoid interfering with stdio-based ACP protocol
 */
async function promptForApiKey(): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      // Use /dev/tty for direct terminal access to avoid ACP protocol interference
      const input = createReadStream("/dev/tty");
      const output = createWriteStream("/dev/tty");

      const rl = createInterface({
        input,
        output,
      });

      console.error("\n=== Z.AI ACP 초기 설정 ===");
      console.error("API 키가 설정되지 않았습니다.");
      console.error("\nZ.AI API 키를 입력하세요:\n");

      rl.question("API Key: ", (answer) => {
        rl.close();
        input.destroy();
        output.end();

        const apiKey = answer.trim();
        if (!apiKey) {
          reject(new Error("API 키가 입력되지 않았습니다."));
        } else {
          resolve(apiKey);
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Saves API key to managed settings file
 */
export function saveApiKey(apiKey: string): void {
  const settingsPath = getManagedSettingsPath();
  const settingsDir = path.dirname(settingsPath);

  // Create config directory if it doesn't exist
  if (!existsSync(settingsDir)) {
    mkdirSync(settingsDir, { recursive: true });
  }

  // Load existing settings or create default
  let settings: ManagedSettings;
  try {
    settings = JSON.parse(readFileSync(settingsPath, "utf8")) as ManagedSettings;
  } catch {
    // If file doesn't exist or is invalid, create default settings
    settings = {
      permissions: {
        allow: ["*"],
        deny: [],
      },
      env: {
        ANTHROPIC_BASE_URL: "https://api.z.ai/api/anthropic",
        API_TIMEOUT_MS: "3000000",
        Z_AI_MODEL_MAPPING: "true",
      },
      z_ai: {
        enabled: true,
        api_endpoint: "https://api.z.ai/api/anthropic",
        model_mapping: {
          "claude-3-5-sonnet-20241022": "glm-4.6",
          "claude-3-5-haiku-20241022": "glm-4.5-air",
          "claude-3-opus-20240229": "glm-4.6",
        },
      },
    };
  }

  // Update API key
  if (!settings.env) {
    settings.env = {};
  }
  settings.env.ANTHROPIC_AUTH_TOKEN = apiKey;

  // Save to file
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8");
  console.error(`\n✓ API 키가 저장되었습니다: ${settingsPath}\n`);
}

/**
 * Checks if API key is configured, prompts user if not
 */
export async function ensureApiKey(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_AUTH_TOKEN;

  if (!apiKey || apiKey.trim() === "") {
    try {
      const newApiKey = await promptForApiKey();
      saveApiKey(newApiKey);
      process.env.ANTHROPIC_AUTH_TOKEN = newApiKey;
    } catch (error) {
      console.error("\n에러:", error instanceof Error ? error.message : String(error));
      console.error("\nAPI 키 설정을 위해 다음 방법 중 하나를 선택하세요:");
      console.error("1. 환경 변수 설정: export ANTHROPIC_AUTH_TOKEN=your-api-key");
      console.error(
        `2. 설정 파일 편집: ${getManagedSettingsPath()}`,
      );
      console.error("   (env.ANTHROPIC_AUTH_TOKEN 필드에 API 키 입력)\n");
      process.exit(1);
    }
  }
}

/**
 * Validates API key by making a test request to Z.AI API
 * @param apiKey - The API key to validate
 * @returns Object with isValid flag and optional error message
 */
export async function validateApiKey(apiKey: string): Promise<{ isValid: boolean; error?: string }> {
  const baseUrl = process.env.ANTHROPIC_BASE_URL || "https://api.z.ai/api/anthropic";

  try {
    const response = await fetch(`${baseUrl}/v1/models`, {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
    });

    if (response.ok) {
      return { isValid: true };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        isValid: false,
        error: "API 키가 유효하지 않습니다. 올바른 키를 입력해주세요."
      };
    }

    if (response.status === 404) {
      // /v1/models endpoint might not exist, try a minimal messages request
      return await validateApiKeyWithMessagesEndpoint(apiKey, baseUrl);
    }

    return {
      isValid: false,
      error: `API 요청 실패 (상태 코드: ${response.status})`
    };
  } catch {
    // Network error or other issues - try alternative validation
    return await validateApiKeyWithMessagesEndpoint(apiKey, baseUrl);
  }
}

/**
 * Alternative validation using messages endpoint with minimal request
 */
async function validateApiKeyWithMessagesEndpoint(
  apiKey: string,
  baseUrl: string
): Promise<{ isValid: boolean; error?: string }> {
  try {
    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    // 200 or 400 (bad request but authenticated) means key is valid
    if (response.ok || response.status === 400) {
      return { isValid: true };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        isValid: false,
        error: "API 키가 유효하지 않습니다. 올바른 키를 입력해주세요."
      };
    }

    // For other errors, assume key might be valid (don't block user)
    return { isValid: true };
  } catch (error) {
    // Network errors - don't block, assume valid and let actual usage determine
    console.error("API 키 검증 중 네트워크 오류:", error);
    return { isValid: true };
  }
}

/**
 * Clears the stored API key from settings (used when key is invalid)
 */
export function clearApiKey(): void {
  const settingsPath = getManagedSettingsPath();

  try {
    const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as ManagedSettings;
    if (settings.env) {
      delete settings.env.ANTHROPIC_AUTH_TOKEN;
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8");
    }
  } catch {
    // Ignore errors if file doesn't exist
  }

  // Also clear from environment
  delete process.env.ANTHROPIC_AUTH_TOKEN;
}
