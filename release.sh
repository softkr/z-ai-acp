#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Z.AI Release Script ===${NC}"

# Get current version from package.json
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "Current version: ${YELLOW}v${CURRENT_VERSION}${NC}"

# Calculate next version (bump patch)
IFS='.' read -ra VERSION_PARTS <<< "$CURRENT_VERSION"
MAJOR=${VERSION_PARTS[0]}
MINOR=${VERSION_PARTS[1]}
PATCH=${VERSION_PARTS[2]}
NEW_PATCH=$((PATCH + 1))
NEW_VERSION="${MAJOR}.${MINOR}.${NEW_PATCH}"

# Allow custom version as argument
if [ -n "$1" ]; then
    NEW_VERSION="$1"
fi

echo -e "New version: ${GREEN}v${NEW_VERSION}${NC}"
read -p "Proceed with release? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}Release cancelled${NC}"
    exit 1
fi

# Update package.json
echo -e "${YELLOW}Updating package.json...${NC}"
sed -i '' "s/\"version\": \"${CURRENT_VERSION}\"/\"version\": \"${NEW_VERSION}\"/" package.json

# Update extension.toml version
echo -e "${YELLOW}Updating extension.toml version...${NC}"
sed -i '' "s/version = \"${CURRENT_VERSION}\"/version = \"${NEW_VERSION}\"/" extension.toml

# Update extension.toml download URLs
echo -e "${YELLOW}Updating extension.toml download URLs...${NC}"
sed -i '' "s|download/v[0-9]*\.[0-9]*\.[0-9]*/|download/v${NEW_VERSION}/|g" extension.toml

# Update yarn.lock
echo -e "${YELLOW}Updating yarn.lock...${NC}"
yarn install

# Build the project
echo -e "${YELLOW}Building project...${NC}"
yarn build

# Git operations
echo -e "${YELLOW}Committing changes...${NC}"
git add -A
git commit -m "v${NEW_VERSION}: Release"

echo -e "${YELLOW}Creating tag v${NEW_VERSION}...${NC}"
git tag "v${NEW_VERSION}"

echo -e "${YELLOW}Pushing to origin...${NC}"
git push origin main
git push origin "v${NEW_VERSION}"

echo -e "${GREEN}=== Release v${NEW_VERSION} complete! ===${NC}"
echo -e "GitHub Actions will now build and publish the release."
echo -e "Check: https://github.com/softkr/z-ai-acp/actions"
