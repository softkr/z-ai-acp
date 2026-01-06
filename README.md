# Z.AI ACP Agent

[![npm](https://img.shields.io/npm/v/z-ai-acp)](https://www.npmjs.com/package/z-ai-acp)

Use [Z.AI](https://z.ai) powered coding agent from [ACP-compatible](https://agentclientprotocol.com) clients such as [Zed](https://zed.dev)!

This tool implements an ACP agent by using the official [Claude Code SDK](https://docs.anthropic.com/en/docs/claude-code/sdk/sdk-overview) with Z.AI integration, supporting:

- Context @-mentions
- Images
- Tool calls (with permission requests)
- Following
- Edit review
- TODO lists
- Interactive (and background) terminals
- Custom [Slash commands](https://docs.anthropic.com/en/docs/claude-code/slash-commands)
- Client MCP servers
- Z.AI model integration (GLM models)

Learn more about the [Agent Client Protocol](https://agentclientprotocol.com/).

## Installation & Setup

### Quick Setup with Zed Extension

1. **Install the Zed extension** from the extensions panel
2. **Configure your API key** after installation:

```bash
# After installing the extension, run this command in your terminal
z-ai-acp --setup
```

This will prompt you for your Z.AI API key and automatically configure it.

### Manual API Key Configuration

If you prefer to configure manually, you can set the API key via:

**Environment Variable:**
```bash
export ANTHROPIC_AUTH_TOKEN=your-z-ai-api-key
```

**Or in Zed Settings:**
```json
{
  "agent_servers": {
    "Z AI Agent": {
      "env": {
        "ANTHROPIC_AUTH_TOKEN": "your-z-ai-api-key"
      }
    }
  }
}
```

## How to use

### Zed Editor

After installing the extension and configuring your API key:

1. Open the Agent Panel (**Cmd/Ctrl + Shift + A**)
2. Click "New Claude Code Thread" from the `+` button menu
3. Start chatting with the Z.AI agent!

![Zed Agent Panel](https://github.com/user-attachments/assets/ddce66c7-79ac-47a3-ad59-4a6a3ca74903)

### Standalone Usage

You can also use the agent directly from the command line:

```bash
# Interactive mode (will prompt for API key if not configured)
z-ai-acp

# ACP mode for integration with other tools
z-ai-acp --acp
```

### Other ACP-Compatible Clients

- Emacs via [agent-shell.el](https://github.com/xenodium/agent-shell)
- [marimo notebook](https://github.com/marimo-team/marimo)
- Neovim
  - via [CodeCompanion.nvim](https://codecompanion.olimorris.dev/configuration/adapters#setup-claude-code-via-acp)
  - via [yetone/avante.nvim](https://github.com/yetone/avante.nvim)

[Submit a PR](https://github.com/softkr/z-ai-acp/pulls) to add yours!

## Features

### Z.AI Integration
- **GLM Models**: Automatically uses Z.AI's GLM models (GLM-4.6, GLM-4.5-air)
- **Korean Optimization**: Enhanced support for Korean language and context
- **Cost Effective**: More affordable than standard Claude API

### Permission Modes
- **Always Ask**: Prompts for permission on first use of each tool
- **Accept Edits**: Automatically accepts file edit permissions
- **Plan Mode**: Analyze without modifying files or executing commands
- **Bypass Permissions**: Skip all permission prompts (non-root only)

### Configuration

The agent stores configuration in `~/.config/z-ai-acp/managed-settings.json` with these defaults:

```json
{
  "permissions": {
    "allow": ["*"],
    "deny": []
  },
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.z.ai/api/anthropic",
    "API_TIMEOUT_MS": "3000000",
    "Z_AI_MODEL_MAPPING": "true"
  },
  "z_ai": {
    "enabled": true,
    "api_endpoint": "https://api.z.ai/api/anthropic",
    "model_mapping": {
      "claude-4.5-sonnet-20250114": "glm-4.7",
      "claude-4-haiku-20250114": "glm-4.5-air",
      "claude-4-opus-20250114": "glm-4.7",
      "claude-3-5-sonnet-20241022": "glm-4.7",
      "claude-3-5-haiku-20241022": "glm-4.5-air",
      "claude-3-opus-20240229": "glm-4.7"
    }
  },
  "thinking": {
    "enabled": true,
    "max_tokens": 15000,
    "effort": "medium",
    "track_duration": true,
    "include_in_output": true
  },
  "auto": {
    "enabled": true,
    "model_selection": true,
    "thinking_adjustment": true
  }
}
```

### Extended Thinking Configuration

The agent supports advanced thinking capabilities (inspired by [Crush](https://github.com/charmbracelet/crush)) for Opus and GLM-4.6/4.7 models:

#### Configuration Options

- **`enabled`** (boolean): Enable/disable extended thinking
  - Default: `true`

- **`max_tokens`** (number): Maximum tokens allocated for thinking
  - Default: `15000`

- **`effort`** (string): Reasoning effort level that affects token budget multiplier
  - `"low"`: 0.5x max_tokens (7,500 tokens for default)
  - `"medium"`: 1.0x max_tokens (15,000 tokens for default)
  - `"high"`: 1.5x max_tokens (22,500 tokens for default)
  - Default: `"medium"`

- **`track_duration`** (boolean): Track and report thinking duration in metadata
  - Default: `true`

- **`include_in_output`** (boolean): Include thinking content in final output
  - Default: `true`

#### Example Configuration

```json
{
  "thinking": {
    "enabled": true,
    "max_tokens": 20000,
    "effort": "high",
    "track_duration": true
  }
}
```

This configuration will allocate 30,000 tokens (20,000 × 1.5) for thinking when using Opus or GLM-4.6/4.7 models.

### Auto Mode Configuration

The agent supports automatic model selection and thinking adjustment based on prompt complexity analysis:

#### How It Works

1. **Prompt Analysis**: Analyzes your prompt for complexity indicators:
   - Prompt length and structure
   - Code blocks and file references
   - Task type keywords (refactoring, debugging, architecture, etc.)
   - Language-specific keywords (English, Korean, Japanese)

2. **Automatic Model Selection**: Chooses between GLM-4.7 and GLM-4.5-air:
   - **Simple tasks** (questions, explanations) → GLM-4.5-air (faster, cost-effective)
   - **Medium/Complex tasks** (code generation, refactoring) → GLM-4.7 (more powerful)

3. **Automatic Thinking Adjustment**: Sets appropriate thinking effort:
   - **Simple** → low effort (5,000-10,000 tokens)
   - **Medium** → medium effort (15,000 tokens)
   - **Complex** → high effort (20,000-30,000 tokens)

#### Configuration Options

- **`enabled`** (boolean): Enable/disable auto mode
  - Default: `true`

- **`model_selection`** (boolean): Auto-select model based on complexity
  - Default: `true`

- **`thinking_adjustment`** (boolean): Auto-adjust thinking effort
  - Default: `true`

#### Example Configuration

```json
{
  "auto": {
    "enabled": true,
    "model_selection": true,
    "thinking_adjustment": true
  },
  "thinking": {
    "enabled": true,
    "max_tokens": 15000
  }
}
```

#### Task Complexity Examples

**Simple Tasks** (GLM-4.5-air, low thinking):
- "What is this function doing?"
- "Explain how async/await works"
- "Show me the syntax for..."

**Medium Tasks** (GLM-4.7, medium thinking):
- "Add error handling to this function"
- "Create a new API endpoint"
- "Fix this bug in the code"

**Complex Tasks** (GLM-4.7, high thinking):
- "Refactor the entire authentication system"
- "Design the architecture for..."
- "Optimize performance across multiple files"

The agent will notify you of the selected model at the start of each conversation when auto mode is enabled.

## Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run linter
npm run lint

# Format code
npm run format

# Run tests
npm test

# Run integration tests
npm run test:integration

# Create binaries for distribution
npm run build:binaries
```

## Performance Optimization

Version 0.0.24+ includes several performance improvements:

- **Cached Node Executable Discovery**: Node executable path is cached to avoid repeated filesystem lookups
- **Optimized Error Handling**: Consolidated authentication error detection with array-based checks
- **Memory-Efficient String Operations**: Improved markdown escaping with cached regex patterns
- **Reduced Object Allocations**: Streamlined error responses and session checks
- **Type Definition Optimization**: Better TypeScript type inference reduces runtime overhead

## Troubleshooting

### API Key Issues

If you encounter authentication errors:

```bash
# Clear the stored API key
z-ai-acp --clear-key

# Run setup again
z-ai-acp --setup
```

### Connection Issues

Verify your connection to Z.AI:
- Check that `ANTHROPIC_BASE_URL` is set to `https://api.z.ai/api/anthropic`
- Ensure your API key is valid at https://z.ai
- Check your network connection and firewall settings

## License

Apache-2.0
