import { describe, expect, it, vi } from "vitest";
import { createMcpServer, toolNames } from "../mcp-server.js";

const SESSION_ID = "session-id";

function getTool(server: any, name: string) {
  // For McpServer, tools are registered in a different structure
  // We need to access the tools through the server's internal structure
  const unqualifiedName = name.replace("mcp__acp__", "");
  return {
    callback: async (input: any) => {
      // Find the tool handler by calling the server's tool handling logic
      const tools = server._registeredTools || {};
      const tool = tools[unqualifiedName] || tools[name];

      if (!tool || !tool.handler) {
        throw new Error(`Tool ${name} not found or has no handler`);
      }

      // Call the tool handler directly
      return await tool.handler(input, {});
    },
  };
}

function createAgent(overrides: Record<string, unknown> = {}) {
  return {
    sessions: {
      [SESSION_ID]: {},
    },
    readTextFile: vi.fn(),
    writeTextFile: vi.fn(),
    backgroundTerminals: {},
    clientCapabilities: {},
    client: {
      sessionUpdate: vi.fn(),
      createTerminal: vi.fn(),
      requestPermission: vi.fn(),
    },
    ...overrides,
  };
}

describe("MCP server read-related tools", () => {
  it("reports missing file contents instead of crashing the read tool", async () => {
    const agent = createAgent();
    agent.readTextFile.mockResolvedValue({});

    const server = createMcpServer(agent as any, SESSION_ID, {
      fs: { readTextFile: true },
    });

    const readTool = getTool(server, toolNames.read);

    const result = await readTool.callback({
      file_path: "/tmp/file.txt",
      offset: 1,
      limit: 2000,
    });

    expect(result.content[0].text).toBe("Reading file failed: No file contents for /tmp/file.txt.");
  });

  it("reports missing contents inside the edit tool and skips writes", async () => {
    const agent = createAgent();
    agent.readTextFile.mockResolvedValue({});

    const server = createMcpServer(agent as any, SESSION_ID, {
      fs: { readTextFile: true, writeTextFile: true },
    });

    const editTool = getTool(server, toolNames.edit);

    const result = await editTool.callback({
      file_path: "/tmp/file.txt",
      old_string: "foo",
      new_string: "bar",
      replace_all: false,
    });

    expect(result.content[0].text).toBe("Editing file failed: No file contents for /tmp/file.txt.");
    expect(agent.writeTextFile).not.toHaveBeenCalled();
  });
});
