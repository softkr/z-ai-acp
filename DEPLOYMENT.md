# Zed Extension Deployment Guide

This guide explains how to deploy `z-ai-acp` as a Zed Agent Server Extension.

## Overview

The project is now configured to be distributed as both:
1. **NPM Package** - Traditional npm installation
2. **Zed Extension** - Native Zed extension with automatic binary distribution

## Files for Zed Extension

- `extension.toml` - Extension configuration for Zed
- `icon.svg` - Extension icon displayed in Zed
- `.github/workflows/release.yml` - Automated binary building and release workflow

## Release Process

### 1. Create a GitHub Release

When you create a new GitHub release, the workflow automatically:
- Builds binaries for all platforms (macOS ARM64/x64, Linux x64, Windows x64)
- Creates compressed archives (tar.gz for Unix, zip for Windows)
- Generates SHA256 checksums for verification
- Uploads all artifacts to the release

### 2. Manual Release Steps

```bash
# 1. Update version in package.json
npm version patch  # or minor, major

# 2. Push changes and tags
git push && git push --tags

# 3. Create a GitHub release
# Go to: https://github.com/softkr/z-ai-acp/releases/new
# - Select the new tag
# - Fill in release notes
# - Click "Publish release"

# The GitHub Actions workflow will automatically build and upload binaries
```

### 3. Update extension.toml

**IMPORTANT:** After creating a release, you MUST update `extension.toml` with the actual version number in all archive URLs. Zed does NOT support `{version}` placeholders for agent servers.

```toml
# Update all archive URLs with the actual version number
archive = "https://github.com/softkr/z-ai-acp/releases/download/v0.11.2/z-ai-acp-darwin-aarch64.tar.gz"
```

You need to update all 4 platform archive URLs (darwin-aarch64, darwin-x86_64, linux-x86_64, windows-x86_64).

## Testing Locally

### Build Binaries Locally

```bash
# Install dependencies
npm ci

# Build TypeScript and create binaries
npm run build:binaries

# Binaries will be in the bin/ directory:
# - bin/z-ai-acp-macos-arm64
# - bin/z-ai-acp-macos-x64
# - bin/z-ai-acp-linux-x64
# - bin/z-ai-acp-win-x64.exe
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

1. Update `package.json` version
2. Create a new GitHub release (automated workflow builds binaries)
3. If you've added new platforms or changed configuration, update `extension.toml`
4. Submit a PR to update the extension in the Zed registry

## Binary Size Optimization

The `pkg` tool with Brotli compression is configured in `package.json`:

```json
"pkg": {
  "scripts": "dist/**/*.js",
  "targets": [
    "node18-macos-arm64",
    "node18-macos-x64",
    "node18-linux-x64",
    "node18-win-x64"
  ],
  "outputPath": "bin"
}
```

To further reduce binary size:
- Brotli compression is enabled via `--compress Brotli`
- Only necessary files are included via the `files` field in `package.json`
- Dependencies are bundled during the pkg build process

## Troubleshooting

### Binary doesn't execute

```bash
# Check permissions
chmod +x bin/z-ai-acp-*

# Test binary directly
./bin/z-ai-acp-macos-arm64 --version
```

### GitHub Actions fails

Check:
- Node.js version compatibility (currently using Node 18)
- Package dependencies are properly installed
- TypeScript compilation succeeds
- pkg targets are correct for each platform

### Extension not loading in Zed

Verify:
- `extension.toml` syntax is correct
- Binary URLs are accessible and point to actual releases
- SHA256 checksums match (if provided)
- Binary has execute permissions

## Resources

- [Zed Extensions Documentation](https://zed.dev/docs/extensions/agent-servers)
- [Agent Client Protocol (ACP)](https://agentclientprotocol.com/)
- [pkg Documentation](https://github.com/vercel/pkg)
