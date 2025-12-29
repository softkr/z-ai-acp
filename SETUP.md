# Z.AI ACP - API Key Setup Guide

This guide will help you configure your Z.AI API key for use with the Zed extension.

## Quick Setup

### macOS / Linux

Run the setup script:

```bash
./setup-api-key.sh
```

### Windows

Run the PowerShell script:

```powershell
.\setup-api-key.ps1
```

## What the Script Does

1. Checks if an API key is already configured
2. Prompts you to enter your Z.AI API key
3. Creates the configuration directory (`~/.config/z-ai-acp/`)
4. Saves your API key to `managed-settings.json`
5. Sets appropriate file permissions

## Getting Your API Key

1. Visit [https://z.ai](https://z.ai)
2. Sign up or log in to your account
3. Navigate to your API settings
4. Copy your API key

## Manual Setup

If you prefer to set up manually, create the following file:

**Location:** `~/.config/z-ai-acp/managed-settings.json`

**Content:**

```json
{
  "permissions": {
    "allow": ["*"],
    "deny": []
  },
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.z.ai/api/anthropic",
    "API_TIMEOUT_MS": "3000000",
    "Z_AI_MODEL_MAPPING": "true",
    "ANTHROPIC_AUTH_TOKEN": "your-api-key-here"
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
  }
}
```

Replace `your-api-key-here` with your actual Z.AI API key.

## Alternative: Zed Settings

You can also configure the API key directly in Zed's settings:

1. Open Zed
2. Go to Settings (Cmd+,)
3. Add to your `settings.json`:

```json
{
  "agent_servers": {
    "Z AI Agent": {
      "env": {
        "ANTHROPIC_AUTH_TOKEN": "your-api-key-here"
      }
    }
  }
}
```

## Verification

After setup:

1. Open Zed
2. Ensure the Z AI Agent extension is installed
3. Try using Claude Code - it should work without authentication errors!

## Troubleshooting

### "Authentication Required" Error

If you still see authentication errors:

1. Verify your API key is correct
2. Check the config file exists: `~/.config/z-ai-acp/managed-settings.json`
3. Restart Zed completely (Cmd+Q or Alt+F4)
4. Try running the setup script again

### Permission Denied

If you get permission errors when running the script:

```bash
chmod +x setup-api-key.sh
./setup-api-key.sh
```

### Script Not Found (Windows)

If PowerShell can't find the script:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
.\setup-api-key.ps1
```

## Support

For issues or questions:
- GitHub Issues: [https://github.com/softkr/z-ai-acp/issues](https://github.com/softkr/z-ai-acp/issues)
- Z.AI Support: [https://z.ai/support](https://z.ai/support)

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
