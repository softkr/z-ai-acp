# v0.0.5 - Fix path error and switch to tarball distribution

## 🐛 Bug Fixes

- **Fixed critical "path undefined" error** that prevented the agent from starting
  - Added fallback for `params.cwd` when undefined (defaults to `process.cwd()`)
  - Improved path handling in the SDK integration

## 🔧 Technical Improvements

- **Switched from pkg to tarball distribution**
  - Resolved ESM module compatibility issues with the Claude Code SDK
  - Better handling of `import.meta` and dynamic imports
  - More reliable execution across different environments

- **Enhanced node executable detection**
  - Automatically finds system node binary
  - Supports common installation locations (Homebrew, system node, etc.)
  - Fallback chain ensures compatibility

- **Improved debugging**
  - Added detailed logging for session creation
  - Better error messages for troubleshooting

## 📦 Distribution Changes

**Breaking Change:** The distribution format has changed from a single pkg binary to a tarball containing:
- Compiled JavaScript files
- Complete node_modules
- Shell wrapper script for execution

This change provides:
- ✅ Better ESM/CommonJS compatibility
- ✅ More reliable SDK integration
- ✅ Easier debugging and updates
- ✅ Smaller download size with better compression

## 🚀 Installation

The Zed extension will automatically download and install the appropriate version for your platform. No manual intervention required!

## 📋 Supported Platforms

- ✅ **macOS ARM64** (Apple Silicon) - Available now
- 🔜 macOS x86_64 (Intel) - Coming soon
- 🔜 Linux x86_64 - Coming soon
- 🔜 Windows x86_64 - Coming soon

## 🔗 Links

- [Full Changelog](https://github.com/softkr/z-ai-acp/compare/v0.0.4...v0.0.5)
- [Installation Guide](https://github.com/softkr/z-ai-acp#installation)
- [Report Issues](https://github.com/softkr/z-ai-acp/issues)

## 💡 Notes

This release resolves the startup issues that prevented the agent from initializing. If you previously encountered errors, please:

1. Update the extension in Zed
2. Restart Zed completely (Cmd+Q)
3. The new version will download automatically

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
