# Zed Extension Deployment Guide

This guide explains how to deploy `z-ai-acp` as a Zed Agent Server Extension with enhanced security and user experience.

## Overview

The project is now configured to be distributed as both:
1. **NPM Package** - Traditional npm installation
2. **Zed Extension** - Native Zed extension with automatic binary distribution
3. **Enhanced Security** - SHA256 checksums for binary verification
4. **Easy Setup** - Post-installation API key configuration

## Files for Zed Extension

- `extension.toml` - Extension configuration for Zed with SHA256 security hashes
- `icon.svg` - Extension icon displayed in Zed
- `.github/workflows/release.yml` - Automated binary building and release workflow
- `src/index.ts` - Enhanced with `--setup` flag for easy API key configuration

## Key Features

### 🔒 Security Enhancements
- **SHA256 Checksums**: All binaries now include security hashes for integrity verification
- **Binary Verification**: Zed automatically verifies downloaded binaries against hashes
- **Tamper Protection**: Prevents execution of modified or corrupted binaries

### 🛠️ User Experience Improvements
- **One-Click Setup**: `z-ai-acp --setup` command for easy API key configuration
- **Korean Interface**: Setup wizard available in Korean for better user experience
- **Automatic Configuration**: API key saved to `~/.config/z-ai-acp/managed-settings.json`
- **Clear Instructions**: Enhanced README with step-by-step setup guide

## Release Process

### 1. Create a GitHub Release

When you create a new GitHub release, the workflow automatically:
- Builds binaries for all platforms (macOS ARM64/x64, Linux x64, Windows x64)
- Creates compressed archives (tar.gz for Unix, zip for Windows)
- Generates SHA256 checksums for verification
- Uploads all artifacts to the release

### 2. Manual Release Steps

```bash
# 1. Update version in package.json and extension.toml
npm version patch  # or minor, major

# 2. Build the project
npm run build

# 3. Generate new SHA256 hashes for binaries
npm run build:binaries

# 4. Calculate hashes and update extension.toml
cd bin && sha256sum z-ai-acp-* > SHA256SUMS

# 5. Update extension.toml with new hashes
# (Manually copy the SHA256 values to extension.toml)

# 6. Push changes and tags
git push && git push --tags

# 7. Create a GitHub release
# Go to: https://github.com/softkr/z-ai-acp/releases/new
# - Select the new tag
# - Fill in release notes
# - Click "Publish release"

# The GitHub Actions workflow will automatically build and upload binaries
```

### 3. Update extension.toml with Security Hashes

**IMPORTANT:** After creating a release and building binaries, you MUST update `extension.toml` with:
1. The actual version number in all archive URLs
2. SHA256 checksums for each platform binary

```toml
# Example for macOS ARM64
[agent_servers.z-ai.targets.darwin-aarch64]
archive = "https://github.com/softkr/z-ai-acp/releases/download/v0.11.3/z-ai-acp-darwin-aarch64.tar.gz"
cmd = "./z-ai-acp"
args = ["--acp"]
sha256 = "a3ec64ee8834c640fcc0a12b24010be61e4182de070c41da5a873226a529efb0"
```

You need to update all 4 platform sections (darwin-aarch64, darwin-x86_64, linux-x86_64, windows-x86_64).

## User Setup Instructions

### Quick Setup for Users

After installing the Zed extension:

1. **Configure API Key** (one-time setup):
   ```bash
   z-ai-acp --setup
   ```

2. **Start using in Zed**:
   - Open Agent Panel (**Cmd/Ctrl + Shift + A**)
   - Click "New Claude Code Thread"
   - Begin chatting with Z.AI agent!

### Alternative Setup Methods

**Environment Variable:**
```bash
export ANTHROPIC_AUTH_TOKEN=your-z-ai-api-key
```

**Zed Settings:**
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

## Testing Locally

### Build Binaries Locally

```bash
# Install dependencies
npm ci

# Build TypeScript and create binaries
npm run build:binaries

# Generate SHA256 hashes
cd bin && sha256sum * > SHA256SUMS

# Binaries will be in the bin/ directory:
# - bin/z-ai-acp-macos-arm64
# - bin/z-ai-acp-macos-x64
# - bin/z-ai-acp-linux-x64
# - bin/z-ai-acp-win-x64.exe
```

### Test API Key Setup

```bash
# Test the setup command
node dist/index.js --setup

# Test API key verification
ANTHROPIC_AUTH_TOKEN=test-key node dist/index.js --acp
```

### Test as Zed Dev Extension

1. **Create a local extension directory**:
   ```bash
   mkdir -p ~/.config/zed/extensions/z-ai
   ```

2. **Copy extension files**:
   ```bash
   cp extension.toml ~/.config/zed/extensions/z-ai/
   cp icon.svg ~/.config/zed/extensions/z-ai/
   ```

3. **Copy a binary for testing**:
   ```bash
   # For macOS ARM64:
   mkdir -p ~/.config/zed/extensions/z-ai/bin
   cp bin/z-ai-acp-macos-arm64 ~/.config/zed/extensions/z-ai/bin/z-ai-acp
   chmod +x ~/.config/zed/extensions/z-ai/bin/z-ai-acp
   ```

4. **Update extension.toml for local testing**:
   ```toml
   [agent_servers.z-ai.targets.darwin-aarch64]
   cmd = "./bin/z-ai-acp"
   args = ["--acp"]
   # Remove sha256 for local testing or calculate it
   sha256 = "your-local-binary-hash"
   ```

5. **Reload Zed** and test the agent from the Agent Panel

## Publishing to Zed Extension Registry

Once you've tested the extension locally and created a GitHub release:

1. **Fork the Zed extensions repository**:
   ```bash
   git clone https://github.com/zed-industries/extensions.git
   ```

2. **Create your extension directory**:
   ```bash
   cd extensions
   mkdir extensions/z-ai
   ```

3. **Copy your extension files**:
   ```bash
   cp /path/to/z-ai-acp/extension.toml extensions/z-ai/
   cp /path/to/z-ai-acp/icon.svg extensions/z-ai/
   ```

4. **Create a pull request** to the Zed extensions repository

5. **Wait for review** - The Zed team will review and merge your extension

## Updating the Extension

When releasing a new version:

1. Update `package.json` and `extension.toml` versions
2. Create a new GitHub release (automated workflow builds binaries)
3. Calculate new SHA256 hashes for all binaries
4. Update `extension.toml` with new version URLs and SHA256 hashes
5. Update README.md if needed
6. Submit a PR to update the extension in the Zed registry

## Configuration Files

### User Configuration Location
- **Path**: `~/.config/z-ai-acp/managed-settings.json`
- **Auto-created**: During `--setup` command
- **Contains**: API key, model mappings, permissions

### Default Configuration
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
      "claude-3-5-sonnet-20241022": "glm-4.6",
      "claude-3-5-haiku-20241022": "glm-4.5-air",
      "claude-3-opus-20240229": "glm-4.6"
    }
  }
}
```

## Troubleshooting

### Binary Verification Issues
```bash
# Check if SHA256 matches
sha256sum z-ai-acp-macos-arm64
# Compare with hash in extension.toml
```

### Setup Command Issues
```bash
# Test setup command directly
node dist/index.js --setup

# Check configuration file
cat ~/.config/z-ai-acp/managed-settings.json
```

### API Key Not Working
```bash
# Test API key with environment variable
ANTHROPIC_AUTH_TOKEN=your-key z-ai-acp --acp

# Check if configuration is loaded
z-ai-acp --version  # Should load managed settings
```

### GitHub Actions fails
Check:
- Node.js version compatibility (currently using Node 18)
- Package dependencies are properly installed
- TypeScript compilation succeeds
- pkg targets are correct for each platform
- SHA256 hashes are calculated correctly

### Extension not loading in Zed
Verify:
- `extension.toml` syntax is correct
- Binary URLs are accessible and point to actual releases
- SHA256 checksums match the actual binaries
- Version numbers are consistent across all files

## Resources

- [Zed Extensions Documentation](https://zed.dev/docs/extensions/agent-servers)
- [Agent Client Protocol (ACP)](https://agentclientprotocol.com/)
- [pkg Documentation](https://github.com/vercel/pkg)
- [Z.AI API Documentation](https://z.ai/docs)
