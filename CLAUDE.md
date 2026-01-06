# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

`z-ai-acp` is an ACP-compatible coding agent that integrates the Claude Code SDK with Z.AI's API, enabling Z.AI-powered AI assistance in editors like Zed through the Agent Client Protocol (ACP). It translates Claude model requests to Z.AI's GLM models (GLM-4.7, GLM-4.5-air) and provides file operations, terminal commands, and interactive features.

**Key Technologies:**
- TypeScript with ES2020 modules (NodeNext)
- Claude Code SDK (`@anthropic-ai/claude-code`)
- ACP SDK (`@agentclientprotocol/sdk`)
- MCP SDK (`@modelcontextprotocol/sdk`) for tool serving
- Vitest for testing

## Common Development Commands

```bash
# Build TypeScript to JavaScript
npm run build

# Run linter (ESLint)
npm run lint

# Fix linting issues automatically
npm run lint:fix

# Format code with Prettier
npm run format

# Check formatting without changes
npm run format:check

# Run both linting and format checking
npm run check

# Run tests in watch mode
npm test

# Run tests once
npm run test:run

# Run integration tests (requires RUN_INTEGRATION_TESTS=true)
npm run test:integration

# Run tests with coverage
npm run test:coverage

# Start the agent in development mode
npm run dev

# Start the built agent
npm start
```

### Running Single Tests

```bash
# Run a specific test file
npx vitest run src/tests/acp-agent.test.ts

# Run tests matching a pattern
npx vitest run -t "test name pattern"

# Run in watch mode for specific file
npx vitest watch src/tests/mcp-server-read.test.ts
```

## Architecture Overview

### Core Components

**Entry Point (`src/index.ts`)**
- Loads managed settings from `~/.config/z-ai-acp/managed-settings.json`
- Applies environment variables for Z.AI configuration
- Handles `--setup`, `--clear-key`, and `--acp` CLI flags
- Redirects console output to stderr to avoid ACP protocol interference

**ACP Agent (`src/acp-agent.ts`)**
- Main agent implementation implementing ACP protocol
- Manages sessions with Claude Code SDK Query instances
- Handles ACP requests: `newSession`, `resumeSession`, `prompt`, `authenticate`
- Bridges between ACP protocol and Claude Code SDK
- Manages permission modes (Always Ask, Accept Edits, Plan Mode, Bypass Permissions)
- Implements thinking metadata tracking for extended reasoning
- Session lifecycle: creates Query on first prompt, not at session creation

**MCP Server (`src/mcp-server.ts`)**
- Exposes file and terminal tools as MCP tools for Claude Code SDK
- Tool implementations:
  - `Read`: Read files with line offset/limit support
  - `Edit`: Replace exact strings in files (with diff previews)
  - `Write`: Create or overwrite files completely
  - `Bash`: Execute shell commands with timeout and background support
  - `BashOutput`: Retrieve output from background terminals
  - `KillShell`: Terminate background shell processes
- All tool names prefixed with `mcp__acp__` (e.g., `mcp__acp__Read`)
- Provides diff previews for edit operations
- Implements malware detection warnings in file read responses

**Settings Manager (`src/settings.ts`)**
- Handles permission rules (allow/deny/ask) with glob pattern matching
- Parses tool-specific rules: `Tool(pattern)` format
- Security: Detects shell operators in Bash commands to prevent injection
- Implements file editing/reading tool equivalence (Edit matches Write, Read matches Grep)
- Manages thinking configuration (enabled, max_tokens, effort levels)
- Manages auto mode configuration (model_selection, thinking_adjustment)
- Loads from multiple sources: managed settings, local `.claude/settings.local.json`, global `~/.claude/settings.json`

**Prompt Analyzer (`src/prompt-analyzer.ts`)**
- Analyzes prompt complexity and task type for auto mode
- Detects task types: question, explanation, code_generation, refactoring, debugging, architecture, review
- Calculates complexity score based on:
  - Prompt length (word count, line count)
  - Code blocks and file path references
  - Task-specific keywords (multi-language support: EN, KR, JP)
  - Simple vs complex keyword presence
- Suggests optimal model: GLM-4.7 for complex tasks, GLM-4.5-air for simple queries
- Suggests thinking effort level: low/medium/high based on complexity
- Provides reasoning explanation for logging and debugging

**Tools (`src/tools.ts`)**
- Converts Claude Code SDK tool events to ACP protocol format
- Maps tool use/results to ACP's `ToolCallContent` and plan entries
- Handles tool-specific formatting (diffs, terminal output, file locations)
- Implements hook system for pre/post tool execution

**Utilities (`src/utils.ts`)**
- `Pushable<T>`: Async iterable for streaming user messages to Query
- Stream converters: Node.js to Web Streams
- API key management: save, validate, clear, prompt for key
- File utilities: byte-limited line extraction
- Settings loading and environment variable application

### Auto Mode

**Automatic Model Selection:**
When `auto.enabled` and `auto.model_selection` are true in settings:
1. First prompt in session is analyzed for complexity
2. Analysis considers: word count, line count, code blocks, file references, task keywords
3. Model is automatically selected:
   - **Simple tasks** (questions, explanations) → GLM-4.5-air via `claude-4-haiku-20250114`
   - **Medium/Complex tasks** (code, refactoring) → GLM-4.7 via `claude-4-opus-20250114`
4. User is notified via message: "🤖 Auto-selected model: glm-4.7 (complex task)"
5. Selection happens in `prompt()` method before pushing user message to Query

**Automatic Thinking Adjustment:**
When `auto.enabled` and `auto.thinking_adjustment` are true:
1. Thinking tokens are calculated based on complexity and effort level
2. Effort multipliers: low=0.5x, medium=1.0x, high=1.5x of max_tokens
3. Suggested configurations:
   - **Simple** → low effort (5,000-10,000 tokens)
   - **Medium** → medium effort (15,000 tokens)
   - **Complex** → high effort (20,000-30,000 tokens)
4. Applied via `query.setMaxThinkingTokens()` before prompt processing

**Implementation Details:**
- Analysis stored in `session.promptAnalysis` (only performed once per session)
- Logging prefixed with `[Auto Mode]` for debugging
- Falls back gracefully on errors (logs error, continues with default settings)
- Multi-language keyword support: English, Korean, Japanese

### Z.AI Integration

**Model Mapping:**
Claude model requests are automatically mapped to Z.AI GLM models in `managed-settings.json`:
- `claude-4.5-sonnet-20250114` → `glm-4.7`
- `claude-4-haiku-20250114` → `glm-4.5-air`
- `claude-4-opus-20250114` → `glm-4.7`
- `claude-3-5-sonnet-20241022` → `glm-4.7`
- `claude-3-5-haiku-20241022` → `glm-4.5-air`

**Configuration:**
The `managed-settings.json` file (created via `z-ai-acp --setup`) stores:
- API key in `env.ANTHROPIC_AUTH_TOKEN`
- Base URL: `https://api.z.ai/api/anthropic`
- Model mappings under `z_ai.model_mapping`
- Thinking configuration for extended reasoning

### Session Management

**Key Behaviors:**
1. Sessions are created immediately upon `newSession` request
2. Query creation is **deferred until first prompt** to enable late authentication
3. If API key missing: session returns `authRequired` error on first prompt
4. Authentication can be provided via `authenticate` request to update session
5. Each session has its own `Pushable<SDKUserMessage>` for streaming user input
6. Sessions track: permissionMode, settingsManager, thinkingMetadata, cancellation state

**Permission Modes:**
- `alwaysAsk`: Prompt for every new tool (default)
- `acceptEdits`: Auto-approve file edits, ask for others
- `planMode`: Deny all destructive operations
- `bypassPermissions`: Auto-approve all (disabled for root users)

### Extended Thinking

The agent supports extended thinking for Opus and GLM-4.6/4.7 models:
- **Configuration:** `thinking.enabled`, `max_tokens`, `effort` (low/medium/high)
- **Effort multipliers:** low=0.5x, medium=1.0x, high=1.5x max_tokens
- **Metadata tracking:** Duration and token count reported in tool responses
- **Output control:** `include_in_output` determines if thinking content is shown

### Testing

Tests are located in `src/tests/`:
- `acp-agent.test.ts`: Session management, authentication, prompt handling
- `mcp-server-read.test.ts`: File reading with offsets and limits
- `extract-lines.test.ts`: Line extraction utilities
- `replace-and-calculate-location.test.ts`: String replacement and diff location calculation
- `reproduce_issue.test.ts`: Bug reproduction tests

**Integration Tests:**
Set `RUN_INTEGRATION_TESTS=true` to run tests that require actual API calls.

## Distribution & Deployment

**Zed Extension:**
This project is distributed as a Zed extension via `extension.toml`:
- Binary archives (tar.gz/zip) are built by GitHub Actions on tag push
- Wrapper scripts invoke `node dist/index.js --acp`
- Archives contain: compiled JS, node_modules, wrapper script
- No SHA256 checksums in current extension.toml (removed for simplicity)

**Release Process:**
1. Update version in `package.json` and `extension.toml`
2. Push git tag: `git tag v0.0.X && git push --tags`
3. GitHub Actions workflow (`.github/workflows/publish.yml`) automatically:
   - Builds TypeScript
   - Creates distribution packages for macOS ARM64, Linux x64, Windows x64
   - Generates SHA256 checksums
   - Creates GitHub release with artifacts

**Manual Binary Build:**
```bash
npm run build
# Binaries would be created with pkg or similar, but current workflow uses tarball distribution
```

## Configuration Files

**Project Root:**
- `managed-settings.json`: Template for user configuration (not the actual user config)
- `extension.toml`: Zed extension metadata and download URLs
- `tsconfig.json`: TypeScript compiler config (NodeNext modules, ES2020 target)
- `vitest.config.ts`: Test configuration
- `eslint.config.js`: Linting rules
- `.prettierrc.json`: Code formatting

**User Configuration Location:**
- `~/.config/z-ai-acp/managed-settings.json`: Actual user settings (created by `--setup`)
- `~/.claude/settings.json`: Global Claude Code settings
- `.claude/settings.local.json`: Project-specific settings

## Important Design Patterns

**Stream Handling:**
- User messages are pushed to `Pushable<SDKUserMessage>` which is consumed by Query
- Claude Code SDK emits events (text, tool_use, tool_result) that are converted to ACP format
- Background terminals use similar pushable pattern for output streaming

**Error Handling:**
- Authentication errors are detected by checking for specific error messages in API responses
- Tool permission denials are converted to ACP error responses
- Session cleanup happens on client disconnect or explicit session end

**Security:**
- Shell command injection prevention via operator detection in settings.ts
- File edit tools show diffs before execution for review
- Root users cannot use bypassPermissions mode
- Malware detection warnings added to file read responses

## Development Notes

**Module System:**
- This project uses ES modules (`"type": "module"` in package.json)
- Import statements must include `.js` extension even for `.ts` files
- Use `import type` for type-only imports

**Environment Variables:**
- `ANTHROPIC_AUTH_TOKEN`: Z.AI API key
- `ANTHROPIC_BASE_URL`: Z.AI API endpoint
- `Z_AI_MODEL_MAPPING`: Enable/disable model mapping
- `API_TIMEOUT_MS`: Request timeout
- `CLAUDE`: Override Claude config directory
- `RUN_INTEGRATION_TESTS`: Enable integration tests

**Debugging:**
- All console.log redirected to stderr in `src/index.ts`
- Use `console.error()` for debugging output
- ACP messages go to stdout only

**Performance Optimizations (v0.0.24+):**
- Cached Node executable path discovery
- Array-based authentication error detection
- Cached regex patterns for markdown escaping
- Reduced object allocations in error responses
