import {
  Agent,
  AgentSideConnection,
  AuthenticateRequest,
  AvailableCommand,
  CancelNotification,
  ClientCapabilities,
  ForkSessionRequest,
  ForkSessionResponse,
  InitializeRequest,
  InitializeResponse,
  ndJsonStream,
  NewSessionRequest,
  NewSessionResponse,
  PromptRequest,
  PromptResponse,
  ReadTextFileRequest,
  ReadTextFileResponse,
  RequestError,
  ResumeSessionRequest,
  ResumeSessionResponse,
  SessionModelState,
  SessionNotification,
  SetSessionModelRequest,
  SetSessionModelResponse,
  SetSessionModeRequest,
  SetSessionModeResponse,
  TerminalHandle,
  TerminalOutputResponse,
  WriteTextFileRequest,
  WriteTextFileResponse,
} from "@agentclientprotocol/sdk";
import {
  CanUseTool,
  McpServerConfig,
  Options,
  PermissionMode,
  Query,
  query,
  SDKPartialAssistantMessage,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  nodeToWebReadable,
  nodeToWebWritable,
  Pushable,
  unreachable,
  saveApiKey,
  validateApiKey,
  clearApiKey,
} from "./utils.js";
import { createMcpServer, EDIT_TOOL_NAMES, toolNames } from "./mcp-server.js";
import {
  toolInfoFromToolUse,
  planEntries,
  toolUpdateFromToolResult,
  ClaudePlanEntry,
  registerHookCallback,
  createPostToolUseHook,
  createPreToolUseHook,
} from "./tools.js";
import { SettingsManager } from "./settings.js";
import { ContentBlockParam } from "@anthropic-ai/sdk/resources";
import { BetaContentBlock, BetaRawContentBlockDelta } from "@anthropic-ai/sdk/resources/beta.mjs";
import packageJson from "../package.json" with { type: "json" };
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";

export const CLAUDE_CONFIG_DIR = process.env.CLAUDE ?? path.join(os.homedir(), ".claude");

/**
 * Logger interface for customizing logging output
 */
export interface Logger {
  log: (...args: any[]) => void;
  error: (...args: any[]) => void;
}

type Session = {
  query: Query | null;
  input: Pushable<SDKUserMessage>;
  cancelled: boolean;
  permissionMode: PermissionMode;
  isAuthRequired: boolean;
  settingsManager: SettingsManager;
  sessionParams?: NewSessionRequest; // Store params for later query creation
};

type BackgroundTerminal =
  | {
      handle: TerminalHandle;
      status: "started";
      lastOutput: TerminalOutputResponse | null;
    }
  | {
      status: "aborted" | "exited" | "killed" | "timedOut";
      pendingOutput: TerminalOutputResponse;
    };

/**
 * Extra metadata that can be given to Claude Code when creating a new session.
 */
export type NewSessionMeta = {
  claudeCode?: {
    /**
     * Options forwarded to Claude Code when starting a new session.
     * Those parameters will be ignored and managed by ACP:
     *   - cwd
     *   - includePartialMessages
     *   - allowDangerouslySkipPermissions
     *   - permissionMode
     *   - canUseTool
     *   - executable
     * Those parameters will be used and updated to work with ACP:
     *   - hooks (merged with ACP's hooks)
     *   - mcpServers (merged with ACP's mcpServers)
     */
    options?: Options;
  };
};

/**
 * Extra metadata that the agent provides for each tool_call / tool_update update.
 */
export type ToolUpdateMeta = {
  claudeCode?: {
    /* The name of the tool that was used in Claude Code. */
    toolName: string;
    /* The structured output provided by Claude Code. */
    toolResponse?: unknown;
  };
};

type ToolUseCache = {
  [key: string]: {
    type: "tool_use" | "server_tool_use" | "mcp_tool_use";
    id: string;
    name: string;
    input: any;
  };
};

// Bypass Permissions doesn't work if we are a root/sudo user
const IS_ROOT = (process.geteuid?.() ?? process.getuid?.()) === 0;

// Cache for node executable path
let cachedNodePath: string | null = null;

// Find the system node executable
function findNodeExecutable(): string {
  if (cachedNodePath) return cachedNodePath;

  try {
    // Try to use 'which node' to find node in PATH
    const nodePath = execSync("which node", { encoding: "utf8" }).trim();
    if (nodePath) {
      cachedNodePath = nodePath;
      return nodePath;
    }
  } catch {
    // If which fails, try common locations
  }

  // Try common node locations
  const commonPaths = [
    "/usr/local/bin/node",
    "/usr/bin/node",
    "/opt/homebrew/bin/node", // macOS M1
    process.execPath, // fallback to current executable
  ];

  for (const p of commonPaths) {
    if (fs.existsSync(p)) {
      cachedNodePath = p;
      return p;
    }
  }

  cachedNodePath = process.execPath;
  return process.execPath; // final fallback
}

// Implement the ACP Agent interface
export class ClaudeAcpAgent implements Agent {
  sessions: {
    [key: string]: Session;
  };
  client: AgentSideConnection;
  toolUseCache: ToolUseCache;
  fileContentCache: { [key: string]: string };
  backgroundTerminals: { [key: string]: BackgroundTerminal } = {};
  clientCapabilities?: ClientCapabilities;
  logger: Logger;

  constructor(client: AgentSideConnection, logger?: Logger) {
    this.sessions = {};
    this.client = client;
    this.toolUseCache = {};
    this.fileContentCache = {};
    this.logger = logger ?? console;
  }

  async initialize(request: InitializeRequest): Promise<InitializeResponse> {
    this.clientCapabilities = request.clientCapabilities;

    this.logger.log("Client capabilities:", JSON.stringify(request.clientCapabilities));

    // Get the path to current script for terminal-auth
    const scriptPath = process.argv[1] || process.execPath;
    this.logger.log("Script path for terminal-auth:", scriptPath);

    // Z.AI API Key authentication method
    // Check if client supports terminal-auth
    const supportsTerminalAuth = request.clientCapabilities?._meta?.["terminal-auth"] === true;
    this.logger.log("Client supports terminal-auth:", supportsTerminalAuth);

    const authMethod: any = {
      name: "Setup Z.AI API Key",
      id: "z-ai-api-key",
      description: supportsTerminalAuth
        ? null
        : "Run setup command in terminal to configure API key",
    };

    // Only add terminal-auth metadata if client supports it
    // Use 'node' as command since dist/index.js is not directly executable
    if (supportsTerminalAuth) {
      authMethod._meta = {
        "terminal-auth": {
          command: "node",
          args: [scriptPath, "--setup"],
          label: "Setup Z.AI API Key",
        },
      };
    }

    this.logger.log("Returning authMethod:", JSON.stringify(authMethod));

    return {
      protocolVersion: 1,
      agentCapabilities: {
        promptCapabilities: {
          image: true,
          embeddedContext: true,
        },
        mcpCapabilities: {
          http: true,
          sse: true,
        },
      },
      agentInfo: {
        name: packageJson.name,
        title: "Claude Code",
        version: packageJson.version,
      },
      authMethods: [authMethod],
    };
  }
  async newSession(params: NewSessionRequest): Promise<NewSessionResponse> {
    this.logger.log(
      "newSession called with params:",
      JSON.stringify({
        cwd: params.cwd,
        hasMcpServers: !!params.mcpServers,
        hasMeta: !!params._meta,
      }),
    );

    // Check if API key is configured
    let isAuthRequired = false;
    if (!process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_AUTH_TOKEN.trim() === "") {
      isAuthRequired = true;
    }

    if (
      fs.existsSync(path.resolve(os.homedir(), ".claude.json.backup")) &&
      !fs.existsSync(path.resolve(os.homedir(), ".claude.json"))
    ) {
      isAuthRequired = true;
    }

    // If auth is required, throw authRequired error so Zed shows the auth button
    if (isAuthRequired) {
      this.logger.log("Auth required - throwing authRequired error");
      throw RequestError.authRequired();
    }

    const sessionId = randomUUID();
    const input = new Pushable<SDKUserMessage>();

    const settingsManager = new SettingsManager(params.cwd, {
      logger: this.logger,
    });
    await settingsManager.initialize();

    const mcpServers: Record<string, McpServerConfig> = {};
    if (Array.isArray(params.mcpServers)) {
      for (const server of params.mcpServers) {
        if ("type" in server) {
          mcpServers[server.name] = {
            type: server.type,
            url: server.url,
            headers: server.headers
              ? Object.fromEntries(server.headers.map((e) => [e.name, e.value]))
              : undefined,
          };
        } else {
          mcpServers[server.name] = {
            type: "stdio",
            command: server.command,
            args: server.args,
            env: server.env
              ? Object.fromEntries(server.env.map((e) => [e.name, e.value]))
              : undefined,
          };
        }
      }
    }

    // Only add the acp MCP server if built-in tools are not disabled
    if (!params._meta?.disableBuiltInTools) {
      const server = createMcpServer(this, sessionId, this.clientCapabilities);
      mcpServers["acp"] = {
        type: "sdk",
        name: "acp",
        instance: server,
      };
    }

    let systemPrompt: Options["systemPrompt"] = { type: "preset", preset: "claude_code" };

    if (params._meta?.systemPrompt) {
      const customPrompt = params._meta.systemPrompt;
      if (typeof customPrompt === "string") {
        systemPrompt = customPrompt;
      } else if (
        typeof customPrompt === "object" &&
        "append" in customPrompt &&
        typeof customPrompt.append === "string"
      ) {
        if (typeof systemPrompt === "string") {
          systemPrompt = systemPrompt + "\n\n" + customPrompt.append;
        }
      }
    }

    const permissionMode = "default";

    // Extract options from _meta if provided
    const userProvidedOptions = (params._meta as NewSessionMeta | undefined)?.claudeCode?.options;

    const options: Options = {
      systemPrompt,
      settingSources: ["user", "project", "local"],
      stderr: (err) => this.logger.error(err),
      ...userProvidedOptions,
      // Override certain fields that must be controlled by ACP
      cwd: params.cwd || process.cwd(),
      includePartialMessages: true,
      // Note: maxThinkingTokens is set dynamically when Opus model is selected
      mcpServers: { ...(userProvidedOptions?.mcpServers || {}), ...mcpServers },
      // If we want bypassPermissions to be an option, we have to allow it here.
      // But it doesn't work in root mode, so we only activate it if it will work.
      allowDangerouslySkipPermissions: !IS_ROOT,
      permissionMode,
      canUseTool: this.canUseTool(sessionId),
      // Use system node instead of bundled executable to avoid pkg issues
      executable: findNodeExecutable() as any,
      ...(process.env.CLAUDE_CODE_EXECUTABLE && {
        pathToClaudeCodeExecutable: process.env.CLAUDE_CODE_EXECUTABLE,
      }),
      hooks: {
        ...userProvidedOptions?.hooks,
        PreToolUse: [
          ...(userProvidedOptions?.hooks?.PreToolUse || []),
          {
            hooks: [createPreToolUseHook(settingsManager, this.logger)],
          },
        ],
        PostToolUse: [
          ...(userProvidedOptions?.hooks?.PostToolUse || []),
          {
            hooks: [createPostToolUseHook(this.logger)],
          },
        ],
      },
    };

    const allowedTools = [];
    const disallowedTools = [];

    // Check if built-in tools should be disabled
    const disableBuiltInTools = params._meta?.disableBuiltInTools === true;

    if (!disableBuiltInTools) {
      if (this.clientCapabilities?.fs?.readTextFile) {
        allowedTools.push(toolNames.read);
        disallowedTools.push("Read");
      }
      if (this.clientCapabilities?.fs?.writeTextFile) {
        disallowedTools.push("Write", "Edit");
      }
      if (this.clientCapabilities?.terminal) {
        allowedTools.push(toolNames.bashOutput, toolNames.killShell);
        disallowedTools.push("Bash", "BashOutput", "KillShell");
      }
    } else {
      // When built-in tools are disabled, explicitly disallow all of them
      disallowedTools.push(
        toolNames.read,
        toolNames.write,
        toolNames.edit,
        toolNames.bash,
        toolNames.bashOutput,
        toolNames.killShell,
        "Read",
        "Write",
        "Edit",
        "Bash",
        "BashOutput",
        "KillShell",
        "Glob",
        "Grep",
        "Task",
        "TodoWrite",
        "ExitPlanMode",
        "WebSearch",
        "WebFetch",
        "AskUserQuestion",
        "SlashCommand",
        "Skill",
        "NotebookEdit",
      );
    }

    if (allowedTools.length > 0) {
      options.allowedTools = allowedTools;
    }
    if (disallowedTools.length > 0) {
      options.disallowedTools = disallowedTools;
    }

    // Handle abort controller from meta options
    const abortController = userProvidedOptions?.abortController;
    if (abortController?.signal.aborted) {
      throw new Error("Cancelled");
    }

    this.logger.log("Creating query with cwd:", options.cwd);

    let q: Query | null = null;

    // Only create query if we have API key
    if (!isAuthRequired) {
      try {
        q = query({
          prompt: input,
          options,
        });
      } catch (error) {
        this.logger.error("Error creating query:", error);
        throw error;
      }
    }

    this.sessions[sessionId] = {
      query: q,
      input: input,
      cancelled: false,
      permissionMode,
      isAuthRequired,
      settingsManager,
      sessionParams: params, // Store for later query creation
    };

    // If auth required, return dummy models. Otherwise fetch real ones.
    let availableCommands: AvailableCommand[] = [];
    let models: SessionModelState;

    if (isAuthRequired) {
      models = {
        availableModels: [
          {
            modelId: "glm-4.7",
            name: "GLM-4.7",
            description: "Z.AI의 최신 강력한 모델 (Claude 4.5 Sonnet 매핑)",
          },
          {
            modelId: "glm-4.5-air",
            name: "GLM-4.5-Air",
            description: "빠르고 효율적인 모델 (Claude 3.5 Haiku 매핑)",
          },
        ],
        currentModelId: "glm-4.7",
      };
    } else {
      availableCommands = await getAvailableSlashCommands(q!);
      models = await getAvailableModels(q!);
    }

    // Needs to happen after we return the session
    setTimeout(() => {
      this.client.sessionUpdate({
        sessionId,
        update: {
          sessionUpdate: "available_commands_update",
          availableCommands,
        },
      });
    }, 0);

    const availableModes = [
      {
        id: "default",
        name: "Default",
        description: "Standard behavior, prompts for dangerous operations",
      },
      {
        id: "acceptEdits",
        name: "Accept Edits",
        description: "Auto-accept file edit operations",
      },
      {
        id: "plan",
        name: "Plan Mode",
        description: "Planning mode, no actual tool execution",
      },
      {
        id: "dontAsk",
        name: "Don't Ask",
        description: "Don't prompt for permissions, deny if not pre-approved",
      },
    ];
    // Only works in non-root mode
    if (!IS_ROOT) {
      availableModes.push({
        id: "bypassPermissions",
        name: "Bypass Permissions",
        description: "Bypass all permission checks",
      });
    }

    return {
      sessionId,
      models,
      modes: {
        currentModeId: permissionMode,
        availableModes,
      },
    };
  }

  async unstable_forkSession(params: ForkSessionRequest): Promise<ForkSessionResponse> {
    // Fork session support - creates a new session with same settings but new session ID
    // For now, just create a new session with same parameters
    this.logger.log("Fork session requested - creating new session with same parameters");

    const originalParams: NewSessionRequest = {
      cwd: params.cwd,
      mcpServers: params.mcpServers ?? [],
      _meta: params._meta,
    };

    const response = await this.newSession(originalParams);

    return response;
  }

  async unstable_resumeSession(params: ResumeSessionRequest): Promise<ResumeSessionResponse> {
    // Resume session support - restores a previous session
    // For now, just create a new session with same parameters
    this.logger.log("Resume session requested - creating new session");

    const newParams: NewSessionRequest = {
      cwd: params.cwd,
      mcpServers: params.mcpServers ?? [],
      _meta: params._meta,
    };

    const response = await this.newSession(newParams);

    return response;
  }

  async authenticate(params: AuthenticateRequest): Promise<void> {
    this.logger.log("authenticate() called with methodId:", params.methodId);

    // If terminal capability is available, run setup in terminal
    if (this.clientCapabilities?.terminal && this.client.createTerminal) {
      this.logger.log("Running terminal-based API key setup...");

      try {
        // Get the path to current executable
        const executablePath = process.argv[1] || process.execPath;

        this.logger.log("Executable path:", executablePath);

        // Create terminal and run setup command
        const handle = await this.client.createTerminal({
          command: executablePath,
          args: ["--setup"],
          env: [],
          sessionId: "", // No session needed for auth
          outputByteLimit: 32_000,
        });

        this.logger.log("Terminal created, waiting for completion...");

        // Wait for terminal to complete
        await handle.waitForExit();

        this.logger.log("Terminal completed, reloading settings...");

        // Reload environment from settings file
        const settingsPath = path.join(
          os.homedir(),
          ".config",
          "z-ai-acp",
          "managed-settings.json",
        );
        if (fs.existsSync(settingsPath)) {
          const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
          if (settings.env?.ANTHROPIC_AUTH_TOKEN) {
            process.env.ANTHROPIC_AUTH_TOKEN = settings.env.ANTHROPIC_AUTH_TOKEN;
            this.logger.log("API key loaded from settings");
            return; // Success
          }
        }

        throw new Error("API 키가 설정되지 않았습니다. 다시 시도해주세요.");
      } catch (error) {
        this.logger.error("Terminal setup failed:", error);
        throw new Error(
          "❌ API 키 설정 실패\n\n" +
            (error instanceof Error ? error.message : String(error)) +
            "\n\n수동으로 설정하려면 Zed settings.json에 다음을 추가하세요:\n" +
            '{\n  "agent_servers": {\n    "Z AI Agent": {\n      "env": {\n' +
            '        "ANTHROPIC_AUTH_TOKEN": "your-api-key-here"\n' +
            "      }\n    }\n  }\n}\n\n" +
            "🔑 API 키 발급: https://z.ai",
        );
      }
    }

    // Fallback: Try to extract API key from _meta (for clients that don't support terminal)
    const meta = params._meta as any;
    let apiKey: string | undefined;

    // Check common patterns for API key in _meta
    if (meta) {
      apiKey =
        meta.apiKey || // Direct apiKey field
        meta.input || // Input field from prompt
        meta.value || // Value field
        meta["api-key"] || // Kebab-case
        meta["API_KEY"] || // Uppercase
        meta.token; // Generic token field
    }

    if (apiKey && typeof apiKey === "string" && apiKey.trim() !== "") {
      const trimmedKey = apiKey.trim();

      // Validate API key before saving
      this.logger.log("Validating API key...");
      const validation = await validateApiKey(trimmedKey);

      if (!validation.isValid) {
        this.logger.error("API key validation failed:", validation.error);
        throw new Error(
          "❌ API 키 인증 실패\n\n" +
            (validation.error || "API 키가 유효하지 않습니다.") +
            "\n\n" +
            "올바른 API 키를 다시 입력해주세요.\n" +
            "🔑 API 키 발급: https://z.ai",
        );
      }

      // Save API key to settings and set environment variable
      saveApiKey(trimmedKey);
      process.env.ANTHROPIC_AUTH_TOKEN = trimmedKey;
      this.logger.log("API key validated and configured successfully");
      return;
    }

    // If no API key provided, throw error with instructions
    throw new Error(
      "⚠️ Z.AI API Key Required\n\n" +
        "터미널에서 API 키 설정 스크립트를 실행해주세요.\n\n" +
        "수동 설정 방법:\n" +
        "Zed settings.json에 다음을 추가:\n" +
        "{\n" +
        '  "agent_servers": {\n' +
        '    "Z AI Agent": {\n' +
        '      "env": {\n' +
        '        "ANTHROPIC_AUTH_TOKEN": "your-api-key-here"\n' +
        "      }\n" +
        "    }\n" +
        "  }\n" +
        "}\n\n" +
        "🔑 Get your API key from: https://z.ai",
    );
  }

  async prompt(params: PromptRequest): Promise<PromptResponse> {
    if (!this.sessions[params.sessionId]) {
      throw new Error("Session not found");
    }

    const session = this.sessions[params.sessionId];
    session.cancelled = false;

    // Handle Auth Required State - run terminal setup automatically
    if (session.isAuthRequired) {
      // Check if terminal capability is available
      this.logger.log("Auth required - checking terminal capability:", {
        hasTerminalCapability: !!this.clientCapabilities?.terminal,
        hasCreateTerminal: !!this.client.createTerminal,
      });

      if (this.clientCapabilities?.terminal && this.client.createTerminal) {
        // Show message first
        await this.client.sessionUpdate({
          sessionId: params.sessionId,
          update: {
            sessionUpdate: "agent_message_chunk",
            content: {
              type: "text",
              text: "🔑 **Z.AI API 키 설정**\n\n터미널에서 API 키를 입력해주세요:\n\n🔗 API 키 발급: https://z.ai",
            },
          },
        });

        this.logger.log("Creating terminal for API key setup...");

        // Create terminal and run setup script
        const handle = await this.client.createTerminal({
          command: "bash",
          args: [
            "-c",
            "curl -fsSL https://raw.githubusercontent.com/softkr/z-ai-acp/main/setup-api-key.sh | bash",
          ],
          env: [],
          sessionId: params.sessionId,
          outputByteLimit: 32_000,
        });

        this.logger.log("Terminal created, waiting for exit...");

        // Wait for terminal to complete
        const exitResult = await handle.waitForExit();
        this.logger.log("Terminal exited:", exitResult);

        // Check terminal output for debugging
        try {
          const output = await handle.currentOutput();
          this.logger.log("Terminal output:", JSON.stringify(output));
        } catch (e) {
          this.logger.error("Failed to get terminal output:", e);
        }

        // Reload settings to check if API key was set
        const settingsPath = path.join(
          os.homedir(),
          ".config",
          "z-ai-acp",
          "managed-settings.json",
        );
        let apiKeySet = false;
        if (fs.existsSync(settingsPath)) {
          try {
            const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
            if (settings.env?.ANTHROPIC_AUTH_TOKEN) {
              process.env.ANTHROPIC_AUTH_TOKEN = settings.env.ANTHROPIC_AUTH_TOKEN;
              session.isAuthRequired = false;
              apiKeySet = true;
              this.logger.log("API key loaded from settings file");
            }
          } catch (e) {
            this.logger.error("Failed to load settings:", e);
          }
        }

        // Ask to restart session
        await this.client.sessionUpdate({
          sessionId: params.sessionId,
          update: {
            sessionUpdate: "agent_message_chunk",
            content: {
              type: "text",
              text: apiKeySet
                ? "\n\n✅ API 키 설정 완료! **새로운 세션**을 시작해주세요. (Cmd/Ctrl + N)"
                : "\n\n⚠️ API 키가 설정되지 않았습니다. **새로운 세션**을 시작하고 다시 시도해주세요. (Cmd/Ctrl + N)",
            },
          },
        });

        return { stopReason: "end_turn" };
      } else {
        // Fallback to text message if terminal not available
        await this.client.sessionUpdate({
          sessionId: params.sessionId,
          update: {
            sessionUpdate: "agent_message_chunk",
            content: {
              type: "text",
              text:
                "🔑 **Z.AI API 키 설정이 필요합니다**\n\n" +
                "터미널에서 다음 명령어를 실행해주세요:\n\n" +
                "```bash\ncurl -fsSL https://raw.githubusercontent.com/softkr/z-ai-acp/main/setup-api-key.sh | bash\n```\n\n" +
                "실행 후 **새로운 세션**을 시작해주세요. (Cmd/Ctrl + N)\n\n" +
                "🔗 API 키 발급: https://z.ai",
            },
          },
        });

        return { stopReason: "end_turn" };
      }
    }

    // If query is null (shouldn't happen after auth), ask to restart
    if (!session.query) {
      await this.client.sessionUpdate({
        sessionId: params.sessionId,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: {
            type: "text",
            text: "⚠️ 세션을 다시 시작해주세요.",
          },
        },
      });
      return { stopReason: "end_turn" };
    }

    const { query, input } = session;

    input.push(promptToClaude(params));
    while (true) {
      const { value: message, done } = await query.next();
      if (done || !message) {
        if (this.sessions[params.sessionId].cancelled) {
          return { stopReason: "cancelled" };
        }
        break;
      }
      switch (message.type) {
        case "system":
          switch (message.subtype) {
            case "init":
              break;
            case "compact_boundary":
            case "hook_response":
            case "status":
              break;
            default:
              unreachable(message, this.logger);
              break;
          }
          break;
        case "result": {
          if (this.sessions[params.sessionId].cancelled) {
            return { stopReason: "cancelled" };
          }

          switch (message.subtype) {
            case "success": {
              if (message.result.includes("Please run /login")) {
                throw RequestError.authRequired();
              }
              if (message.is_error) {
                // Check for authentication-related errors in result
                const authErrors = [
                  "401",
                  "403",
                  "authentication",
                  "Unauthorized",
                  "invalid_api_key",
                  "Invalid API",
                  "API key",
                ];
                if (authErrors.some((err) => message.result.includes(err))) {
                  this.logger.error(
                    "Authentication error detected in result, clearing API key and requesting re-auth",
                  );
                  clearApiKey();
                  throw RequestError.authRequired();
                }
                throw RequestError.internalError(undefined, message.result);
              }
              return { stopReason: "end_turn" };
            }
            case "error_during_execution": {
              if (message.is_error) {
                const errorMsg = message.errors.join(", ") || message.subtype;

                // Check for authentication-related errors
                const authErrors = [
                  "401",
                  "403",
                  "authentication",
                  "Unauthorized",
                  "invalid_api_key",
                  "Invalid API",
                  "API key",
                ];
                if (authErrors.some((err) => errorMsg.includes(err))) {
                  this.logger.error(
                    "Authentication error detected, clearing API key and requesting re-auth",
                  );
                  clearApiKey();
                  throw RequestError.authRequired();
                }
                throw RequestError.internalError(undefined, errorMsg);
              }
              return { stopReason: "end_turn" };
            }
            case "error_max_budget_usd":
            case "error_max_turns":
            case "error_max_structured_output_retries":
              if (message.is_error) {
                throw RequestError.internalError(
                  undefined,
                  message.errors.join(", ") || message.subtype,
                );
              }
              return { stopReason: "max_turn_requests" };
            default:
              unreachable(message, this.logger);
              break;
          }
          break;
        }
        case "stream_event": {
          for (const notification of streamEventToAcpNotifications(
            message,
            params.sessionId,
            this.toolUseCache,
            this.fileContentCache,
            this.client,
            this.logger,
          )) {
            await this.client.sessionUpdate(notification);
          }
          break;
        }
        case "user":
        case "assistant": {
          if (this.sessions[params.sessionId].cancelled) {
            break;
          }

          // Slash commands like /compact can generate invalid output... doesn't match
          // their own docs: https://docs.anthropic.com/en/docs/claude-code/sdk/sdk-slash-commands#%2Fcompact-compact-conversation-history
          if (
            typeof message.message.content === "string" &&
            message.message.content.includes("<local-command-stdout>")
          ) {
            this.logger.log(message.message.content);
            break;
          }

          if (
            typeof message.message.content === "string" &&
            message.message.content.includes("<local-command-stderr>")
          ) {
            this.logger.error(message.message.content);
            break;
          }
          // Skip these user messages for now, since they seem to just be messages we don't want in the feed
          if (
            message.type === "user" &&
            (typeof message.message.content === "string" ||
              (Array.isArray(message.message.content) &&
                message.message.content.length === 1 &&
                message.message.content[0].type === "text"))
          ) {
            break;
          }

          if (
            message.type === "assistant" &&
            message.message.model === "<synthetic>" &&
            Array.isArray(message.message.content) &&
            message.message.content.length === 1 &&
            message.message.content[0].type === "text" &&
            message.message.content[0].text.includes("Please run /login")
          ) {
            throw RequestError.authRequired();
          }

          const content =
            message.type === "assistant"
              ? // Handled by stream events above
                message.message.content.filter((item) => !["text", "thinking"].includes(item.type))
              : message.message.content;

          for (const notification of toAcpNotifications(
            content,
            message.message.role,
            params.sessionId,
            this.toolUseCache,
            this.fileContentCache,
            this.client,
            this.logger,
          )) {
            await this.client.sessionUpdate(notification);
          }
          break;
        }
        case "tool_progress":
          break;
        case "auth_status":
          break;
        default:
          unreachable(message);
          break;
      }
    }
    throw new Error("Session did not end in result");
  }

  async cancel(params: CancelNotification): Promise<void> {
    if (!this.sessions[params.sessionId]) {
      throw new Error("Session not found");
    }
    this.sessions[params.sessionId].cancelled = true;
    const query = this.sessions[params.sessionId].query;
    if (query) {
      await query.interrupt();
    }
  }

  async setSessionModel(params: SetSessionModelRequest): Promise<SetSessionModelResponse | void> {
    if (!this.sessions[params.sessionId]) {
      throw new Error("Session not found");
    }
    const query = this.sessions[params.sessionId].query;
    if (query) {
      await query.setModel(params.modelId);

      // Enable extended thinking for Opus models (15000 tokens default)
      const isOpusModel =
        params.modelId.toLowerCase().includes("opus") ||
        params.modelId.toLowerCase().includes("glm-4.7") ||
        params.modelId.toLowerCase().includes("glm-4.6");

      if (isOpusModel) {
        const maxThinkingTokens = process.env.MAX_THINKING_TOKENS
          ? parseInt(process.env.MAX_THINKING_TOKENS, 10)
          : 15000;
        await query.setMaxThinkingTokens(maxThinkingTokens);
        this.logger.log(
          `Extended thinking enabled for ${params.modelId} with ${maxThinkingTokens} tokens`,
        );
      } else {
        await query.setMaxThinkingTokens(null);
        this.logger.log(`Extended thinking disabled for ${params.modelId}`);
      }
    }
  }

  async setSessionMode(params: SetSessionModeRequest): Promise<SetSessionModeResponse> {
    if (!this.sessions[params.sessionId]) {
      throw new Error("Session not found");
    }

    switch (params.modeId) {
      case "default":
      case "acceptEdits":
      case "bypassPermissions":
      case "dontAsk":
      case "plan":
        this.sessions[params.sessionId].permissionMode = params.modeId;
        try {
          const query = this.sessions[params.sessionId].query;
          if (query) {
            await query.setPermissionMode(params.modeId);
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error && error.message ? error.message : "Invalid Mode";

          throw new Error(errorMessage);
        }
        return {};
      default:
        throw new Error("Invalid Mode");
    }
  }

  async readTextFile(params: ReadTextFileRequest): Promise<ReadTextFileResponse> {
    const response = await this.client.readTextFile(params);
    if (!params.limit && !params.line) {
      this.fileContentCache[params.path] = response.content;
    }
    return response;
  }

  async writeTextFile(params: WriteTextFileRequest): Promise<WriteTextFileResponse> {
    const response = await this.client.writeTextFile(params);
    this.fileContentCache[params.path] = params.content;
    return response;
  }

  canUseTool(sessionId: string): CanUseTool {
    return async (toolName, toolInput, { suggestions, toolUseID }) => {
      const session = this.sessions[sessionId];
      if (!session) {
        return {
          behavior: "deny",
          message: "Session not found",
          interrupt: true,
        };
      }

      if (toolName === "ExitPlanMode") {
        const response = await this.client.requestPermission({
          options: [
            {
              kind: "allow_always",
              name: "Yes, and auto-accept edits",
              optionId: "acceptEdits",
            },
            { kind: "allow_once", name: "Yes, and manually approve edits", optionId: "default" },
            { kind: "reject_once", name: "No, keep planning", optionId: "plan" },
          ],
          sessionId,
          toolCall: {
            toolCallId: toolUseID,
            rawInput: toolInput,
            title: toolInfoFromToolUse(
              { name: toolName, input: toolInput },
              this.fileContentCache,
              this.logger,
            ).title,
          },
        });

        if (
          response.outcome?.outcome === "selected" &&
          (response.outcome.optionId === "default" || response.outcome.optionId === "acceptEdits")
        ) {
          session.permissionMode = response.outcome.optionId;
          await this.client.sessionUpdate({
            sessionId,
            update: {
              sessionUpdate: "current_mode_update",
              currentModeId: response.outcome.optionId,
            },
          });

          return {
            behavior: "allow",
            updatedInput: toolInput,
            updatedPermissions: suggestions ?? [
              { type: "setMode", mode: response.outcome.optionId, destination: "session" },
            ],
          };
        } else {
          return {
            behavior: "deny",
            message: "User rejected request to exit plan mode.",
            interrupt: true,
          };
        }
      }

      if (
        session.permissionMode === "bypassPermissions" ||
        (session.permissionMode === "acceptEdits" && EDIT_TOOL_NAMES.includes(toolName))
      ) {
        return {
          behavior: "allow",
          updatedInput: toolInput,
          updatedPermissions: suggestions ?? [
            { type: "addRules", rules: [{ toolName }], behavior: "allow", destination: "session" },
          ],
        };
      }

      const response = await this.client.requestPermission({
        options: [
          {
            kind: "allow_always",
            name: "Always Allow",
            optionId: "allow_always",
          },
          { kind: "allow_once", name: "Allow", optionId: "allow" },
          { kind: "reject_once", name: "Reject", optionId: "reject" },
        ],
        sessionId,
        toolCall: {
          toolCallId: toolUseID,
          rawInput: toolInput,
          title: toolInfoFromToolUse(
            { name: toolName, input: toolInput },
            this.fileContentCache,
            this.logger,
          ).title,
        },
      });
      if (
        response.outcome?.outcome === "selected" &&
        (response.outcome.optionId === "allow" || response.outcome.optionId === "allow_always")
      ) {
        // If Claude Code has suggestions, it will update their settings already
        if (response.outcome.optionId === "allow_always") {
          return {
            behavior: "allow",
            updatedInput: toolInput,
            updatedPermissions: suggestions ?? [
              {
                type: "addRules",
                rules: [{ toolName }],
                behavior: "allow",
                destination: "session",
              },
            ],
          };
        }
        return {
          behavior: "allow",
          updatedInput: toolInput,
        };
      } else {
        return {
          behavior: "deny",
          message: "User refused permission to run tool",
          interrupt: true,
        };
      }
    };
  }
}

async function getAvailableModels(query: Query): Promise<SessionModelState> {
  const models = await query.supportedModels();

  // Query doesn't give us access to the currently selected model, so we just choose the first model in the list.
  const currentModel = models[0];
  await query.setModel(currentModel.value);

  // Enable extended thinking for Opus models (15000 tokens default)
  const isOpusModel =
    currentModel.value.toLowerCase().includes("opus") ||
    currentModel.value.toLowerCase().includes("glm-4.7") ||
    currentModel.value.toLowerCase().includes("glm-4.6");

  if (isOpusModel) {
    const maxThinkingTokens = process.env.MAX_THINKING_TOKENS
      ? parseInt(process.env.MAX_THINKING_TOKENS, 10)
      : 15000;
    await query.setMaxThinkingTokens(maxThinkingTokens);
  }

  // Exclude the currently selected model from the menu to avoid duplication
  const availableModels = models
    .filter((model) => model.value !== currentModel.value)
    .map((model) => ({
      modelId: model.value,
      name: model.displayName,
      description: model.description,
    }));

  return {
    availableModels,
    currentModelId: currentModel.value,
  };
}

async function getAvailableSlashCommands(query: Query): Promise<AvailableCommand[]> {
  const UNSUPPORTED_COMMANDS = [
    "context",
    "cost",
    "login",
    "logout",
    "output-style:new",
    "release-notes",
    "todos",
  ];
  const commands = await query.supportedCommands();

  return commands
    .map((command) => {
      const input = command.argumentHint ? { hint: command.argumentHint } : null;
      let name = command.name;
      if (command.name.endsWith(" (MCP)")) {
        name = `mcp:${name.replace(" (MCP)", "")}`;
      }
      return {
        name,
        description: command.description || "",
        input,
      };
    })
    .filter((command: AvailableCommand) => !UNSUPPORTED_COMMANDS.includes(command.name));
}

function formatUriAsLink(uri: string): string {
  try {
    if (uri.startsWith("file://")) {
      const path = uri.slice(7); // Remove "file://"
      const name = path.split("/").pop() || path;
      return `[@${name}](${uri})`;
    } else if (uri.startsWith("zed://")) {
      const parts = uri.split("/");
      const name = parts[parts.length - 1] || uri;
      return `[@${name}](${uri})`;
    }
    return uri;
  } catch {
    return uri;
  }
}

export function promptToClaude(prompt: PromptRequest): SDKUserMessage {
  const content: any[] = [];
  const context: any[] = [];

  for (const chunk of prompt.prompt) {
    switch (chunk.type) {
      case "text": {
        let text = chunk.text;
        // change /mcp:server:command args -> /server:command (MCP) args
        const mcpMatch = text.match(/^\/mcp:([^:\s]+):(\S+)(\s+.*)?$/);
        if (mcpMatch) {
          const [, server, command, args] = mcpMatch;
          text = `/${server}:${command} (MCP)${args || ""}`;
        }
        content.push({ type: "text", text });
        break;
      }
      case "resource_link": {
        const formattedUri = formatUriAsLink(chunk.uri);
        content.push({
          type: "text",
          text: formattedUri,
        });
        break;
      }
      case "resource": {
        if ("text" in chunk.resource) {
          const formattedUri = formatUriAsLink(chunk.resource.uri);
          content.push({
            type: "text",
            text: formattedUri,
          });
          context.push({
            type: "text",
            text: `\n<context ref="${chunk.resource.uri}">\n${chunk.resource.text}\n</context>`,
          });
        }
        // Ignore blob resources (unsupported)
        break;
      }
      case "image":
        if (chunk.data) {
          content.push({
            type: "image",
            source: {
              type: "base64",
              data: chunk.data,
              media_type: chunk.mimeType,
            },
          });
        } else if (chunk.uri && chunk.uri.startsWith("http")) {
          content.push({
            type: "image",
            source: {
              type: "url",
              url: chunk.uri,
            },
          });
        }
        break;
      // Ignore audio and other unsupported types
      default:
        break;
    }
  }

  content.push(...context);

  return {
    type: "user",
    message: {
      role: "user",
      content: content,
    },
    session_id: prompt.sessionId,
    parent_tool_use_id: null,
  };
}

/**
 * Convert an SDKAssistantMessage (Claude) to a SessionNotification (ACP).
 * Only handles text, image, and thinking chunks for now.
 */
export function toAcpNotifications(
  content: string | ContentBlockParam[] | BetaContentBlock[] | BetaRawContentBlockDelta[],
  role: "assistant" | "user",
  sessionId: string,
  toolUseCache: ToolUseCache,
  fileContentCache: { [key: string]: string },
  client: AgentSideConnection,
  logger: Logger,
): SessionNotification[] {
  if (typeof content === "string") {
    return [
      {
        sessionId,
        update: {
          sessionUpdate: role === "assistant" ? "agent_message_chunk" : "user_message_chunk",
          content: {
            type: "text",
            text: content,
          },
        },
      },
    ];
  }

  const output = [];
  // Only handle the first chunk for streaming; extend as needed for batching
  for (const chunk of content) {
    let update: SessionNotification["update"] | null = null;
    switch (chunk.type) {
      case "text":
      case "text_delta":
        update = {
          sessionUpdate: role === "assistant" ? "agent_message_chunk" : "user_message_chunk",
          content: {
            type: "text",
            text: chunk.text,
          },
        };
        break;
      case "image":
        update = {
          sessionUpdate: role === "assistant" ? "agent_message_chunk" : "user_message_chunk",
          content: {
            type: "image",
            data: chunk.source.type === "base64" ? chunk.source.data : "",
            mimeType: chunk.source.type === "base64" ? chunk.source.media_type : "",
            uri: chunk.source.type === "url" ? chunk.source.url : undefined,
          },
        };
        break;
      case "thinking":
      case "thinking_delta":
        update = {
          sessionUpdate: "agent_thought_chunk",
          content: {
            type: "text",
            text: chunk.thinking,
          },
        };
        break;
      case "tool_use":
      case "server_tool_use":
      case "mcp_tool_use": {
        toolUseCache[chunk.id] = chunk;
        if (chunk.name === "TodoWrite") {
          // @ts-expect-error - sometimes input is empty object
          if (Array.isArray(chunk.input.todos)) {
            update = {
              sessionUpdate: "plan",
              entries: planEntries(chunk.input as { todos: ClaudePlanEntry[] }),
            };
          }
        } else {
          // Register hook callback to receive the structured output from the hook
          registerHookCallback(chunk.id, {
            onPostToolUseHook: async (toolUseId, toolInput, toolResponse) => {
              const toolUse = toolUseCache[toolUseId];
              if (toolUse) {
                const update: SessionNotification["update"] = {
                  _meta: {
                    claudeCode: {
                      toolResponse,
                      toolName: toolUse.name,
                    },
                  } satisfies ToolUpdateMeta,
                  toolCallId: toolUseId,
                  sessionUpdate: "tool_call_update",
                };
                await client.sessionUpdate({
                  sessionId,
                  update,
                });
              } else {
                logger.error(
                  `[claude-code-acp] Got a tool response for tool use that wasn't tracked: ${toolUseId}`,
                );
              }
            },
          });

          let rawInput;
          try {
            rawInput = JSON.parse(JSON.stringify(chunk.input));
          } catch {
            // ignore if we can't turn it to JSON
          }
          update = {
            _meta: {
              claudeCode: {
                toolName: chunk.name,
              },
            } satisfies ToolUpdateMeta,
            toolCallId: chunk.id,
            sessionUpdate: "tool_call",
            rawInput,
            status: "pending",
            ...toolInfoFromToolUse(chunk, fileContentCache, logger),
          };
        }
        break;
      }

      case "tool_result":
      case "tool_search_tool_result":
      case "web_fetch_tool_result":
      case "web_search_tool_result":
      case "code_execution_tool_result":
      case "bash_code_execution_tool_result":
      case "text_editor_code_execution_tool_result":
      case "mcp_tool_result": {
        const toolUse = toolUseCache[chunk.tool_use_id];
        if (!toolUse) {
          logger.error(
            `[claude-code-acp] Got a tool result for tool use that wasn't tracked: ${chunk.tool_use_id}`,
          );
          break;
        }

        if (toolUse.name !== "TodoWrite") {
          update = {
            _meta: {
              claudeCode: {
                toolName: toolUse.name,
              },
            } satisfies ToolUpdateMeta,
            toolCallId: chunk.tool_use_id,
            sessionUpdate: "tool_call_update",
            status: "is_error" in chunk && chunk.is_error ? "failed" : "completed",
            ...toolUpdateFromToolResult(chunk, toolUseCache[chunk.tool_use_id]),
          };
        }
        break;
      }

      case "document":
      case "search_result":
      case "redacted_thinking":
      case "input_json_delta":
      case "citations_delta":
      case "signature_delta":
      case "container_upload":
        break;

      default:
        unreachable(chunk, logger);
        break;
    }
    if (update) {
      output.push({ sessionId, update });
    }
  }

  return output;
}

export function streamEventToAcpNotifications(
  message: SDKPartialAssistantMessage,
  sessionId: string,
  toolUseCache: ToolUseCache,
  fileContentCache: { [key: string]: string },
  client: AgentSideConnection,
  logger: Logger,
): SessionNotification[] {
  const event = message.event;
  switch (event.type) {
    case "content_block_start":
      return toAcpNotifications(
        [event.content_block],
        "assistant",
        sessionId,
        toolUseCache,
        fileContentCache,
        client,
        logger,
      );
    case "content_block_delta":
      return toAcpNotifications(
        [event.delta],
        "assistant",
        sessionId,
        toolUseCache,
        fileContentCache,
        client,
        logger,
      );
    // No content
    case "message_start":
    case "message_delta":
    case "message_stop":
    case "content_block_stop":
      return [];

    default:
      unreachable(event, logger);
      return [];
  }
}

export function runAcp() {
  const input = nodeToWebWritable(process.stdout);
  const output = nodeToWebReadable(process.stdin);

  const stream = ndJsonStream(input, output);
  new AgentSideConnection((client) => new ClaudeAcpAgent(client), stream);
}
