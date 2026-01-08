#!/bin/bash
# Pre-deploy verification script for Seizn
# Run this before deploying to catch build issues early

set -e

echo "🔍 Seizn Pre-Deploy Check"
echo "========================="

# 1. Check tsconfig.json excludes mcp-server
if grep -q '"mcp-server"' tsconfig.json; then
  echo "✅ tsconfig.json: mcp-server excluded"
else
  echo "❌ tsconfig.json: mcp-server NOT in exclude list!"
  exit 1
fi

# 2. Check .vercelignore exists
if [ -f ".vercelignore" ] && grep -q "mcp-server" .vercelignore; then
  echo "✅ .vercelignore: mcp-server excluded"
else
  echo "❌ .vercelignore missing or mcp-server not excluded!"
  exit 1
fi

# 3. Run Next.js build
echo ""
echo "🔨 Running Next.js build..."
npm run build

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Build successful! Safe to deploy."
else
  echo ""
  echo "❌ Build failed! Do not deploy."
  exit 1
fi
