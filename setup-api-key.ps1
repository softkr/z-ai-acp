# Z.AI ACP - API Key Setup Script (Windows)
# This script helps you configure your Z.AI API key

$ErrorActionPreference = "Stop"

# Config path
$ConfigDir = "$env:USERPROFILE\.config\z-ai-acp"
$ConfigFile = "$ConfigDir\managed-settings.json"

Write-Host ""
Write-Host "======================================" -ForegroundColor Blue
Write-Host "  Z.AI ACP - API Key Setup" -ForegroundColor Blue
Write-Host "======================================" -ForegroundColor Blue
Write-Host ""

# Check if API key is already configured
if (Test-Path $ConfigFile) {
    $config = Get-Content $ConfigFile -Raw | ConvertFrom-Json
    if ($config.env.ANTHROPIC_AUTH_TOKEN) {
        $currentKey = $config.env.ANTHROPIC_AUTH_TOKEN
        Write-Host "⚠️  API key is already configured" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Current key: $($currentKey.Substring(0, [Math]::Min(20, $currentKey.Length)))...$($currentKey.Substring([Math]::Max(0, $currentKey.Length - 4)))"
        Write-Host ""
        $response = Read-Host "Do you want to update it? (y/N)"
        if ($response -ne "y" -and $response -ne "Y") {
            Write-Host ""
            Write-Host "ℹ️  Setup cancelled" -ForegroundColor Blue
            exit 0
        }
    }
}

Write-Host "📝 Please enter your Z.AI API key" -ForegroundColor Blue
Write-Host "   (Get your API key from: https://z.ai)" -ForegroundColor Blue
Write-Host ""
$ApiKey = Read-Host "API Key"

# Validate API key
if ([string]::IsNullOrWhiteSpace($ApiKey)) {
    Write-Host ""
    Write-Host "❌ Error: API key cannot be empty" -ForegroundColor Red
    exit 1
}

# Trim whitespace
$ApiKey = $ApiKey.Trim()

Write-Host ""
Write-Host "💾 Saving API key..." -ForegroundColor Blue

# Create config directory if it doesn't exist
if (-not (Test-Path $ConfigDir)) {
    New-Item -ItemType Directory -Path $ConfigDir -Force | Out-Null
}

# Create the config object
$config = @{
    permissions = @{
        allow = @("*")
        deny = @()
    }
    env = @{
        ANTHROPIC_BASE_URL = "https://api.z.ai/api/anthropic"
        API_TIMEOUT_MS = "3000000"
        Z_AI_MODEL_MAPPING = "true"
        ANTHROPIC_AUTH_TOKEN = $ApiKey
    }
    z_ai = @{
        enabled = $true
        api_endpoint = "https://api.z.ai/api/anthropic"
        model_mapping = @{
            "claude-3-5-sonnet-20241022" = "glm-4.6"
            "claude-3-5-haiku-20241022" = "glm-4.5-air"
            "claude-3-opus-20240229" = "glm-4.6"
        }
    }
}

# Save to file
$config | ConvertTo-Json -Depth 10 | Set-Content -Path $ConfigFile -Encoding UTF8

Write-Host ""
Write-Host "✅ Success!" -ForegroundColor Green
Write-Host ""
Write-Host "API key has been saved to:"
Write-Host "  $ConfigFile"
Write-Host ""
Write-Host "🚀 You can now use Z AI Agent in Zed!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Open Zed editor"
Write-Host "  2. Install the 'Z AI Agent' extension (if not already installed)"
Write-Host "  3. Start using Claude Code with Z.AI!"
Write-Host ""
Write-Host "======================================" -ForegroundColor Blue
