#!/bin/bash

# Z.AI ACP - API Key Setup Script
# This script helps you configure your Z.AI API key

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Config path
CONFIG_DIR="$HOME/.config/z-ai-acp"
CONFIG_FILE="$CONFIG_DIR/managed-settings.json"

echo ""
echo "======================================"
echo "  Z.AI ACP - API Key Setup"
echo "======================================"
echo ""

# Check if API key is already configured
if [ -f "$CONFIG_FILE" ]; then
    CURRENT_KEY=$(cat "$CONFIG_FILE" | grep -o '"ANTHROPIC_AUTH_TOKEN"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
    if [ ! -z "$CURRENT_KEY" ]; then
        echo -e "${YELLOW}⚠️  API key is already configured${NC}"
        echo ""
        echo "Current key: ${CURRENT_KEY:0:20}...${CURRENT_KEY: -4}"
        echo ""
        read -p "Do you want to update it? (y/N): " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo ""
            echo -e "${BLUE}ℹ️  Setup cancelled${NC}"
            exit 0
        fi
    fi
fi

echo -e "${BLUE}📝 Please enter your Z.AI API key${NC}"
echo -e "${BLUE}   (Get your API key from: https://z.ai)${NC}"
echo ""
read -p "API Key: " API_KEY

# Validate API key (basic check)
if [ -z "$API_KEY" ]; then
    echo ""
    echo -e "${RED}❌ Error: API key cannot be empty${NC}"
    exit 1
fi

# Trim whitespace
API_KEY=$(echo "$API_KEY" | xargs)

echo ""
echo -e "${BLUE}💾 Saving API key...${NC}"

# Create config directory if it doesn't exist
mkdir -p "$CONFIG_DIR"

# Create or update the config file
cat > "$CONFIG_FILE" << EOF
{
  "permissions": {
    "allow": ["*"],
    "deny": []
  },
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.z.ai/api/anthropic",
    "API_TIMEOUT_MS": "3000000",
    "Z_AI_MODEL_MAPPING": "true",
    "ANTHROPIC_AUTH_TOKEN": "$API_KEY"
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
EOF

# Set appropriate permissions
chmod 600 "$CONFIG_FILE"

echo ""
echo -e "${GREEN}✅ Success!${NC}"
echo ""
echo "API key has been saved to:"
echo "  $CONFIG_FILE"
echo ""
echo -e "${GREEN}🚀 You can now use Z AI Agent in Zed!${NC}"
echo ""
echo "Next steps:"
echo "  1. Open Zed editor"
echo "  2. Install the 'Z AI Agent' extension (if not already installed)"
echo "  3. Start using Claude Code with Z.AI!"
echo ""
echo "======================================"
