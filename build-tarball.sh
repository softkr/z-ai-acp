#!/bin/bash
set -e

# Build TypeScript
npm run build

# Create distribution directory
rm -rf dist-pkg
mkdir -p dist-pkg

# Copy necessary files
cp -r dist dist-pkg/
cp -r node_modules dist-pkg/
cp package.json dist-pkg/
cp README.md dist-pkg/ 2>/dev/null || true

# Create executable wrapper
cat > dist-pkg/z-ai-acp << 'WRAPPER'
#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
exec node "$DIR/dist/index.js" "$@"
WRAPPER

chmod +x dist-pkg/z-ai-acp

# Create tarball
cd dist-pkg
tar -czf ../z-ai-acp-darwin-aarch64.tar.gz .
cd ..

echo "✅ Tarball created: z-ai-acp-darwin-aarch64.tar.gz"
