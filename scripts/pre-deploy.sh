#!/bin/bash
# Pre-deploy verification script for Seizn
# Run this before deploying to catch build issues early

set -e

echo "Seizn Pre-Deploy Check"
echo "========================="

# 0. Verify public demo and marketing surfaces do not leak internal-only IP terms
echo ""
echo "Running KNOT separation guard..."
npm run verify:knot-separation

# 1. Check tsconfig.json excludes mcp-server
if grep -q '"mcp-server"' tsconfig.json; then
  echo "OK tsconfig.json: mcp-server excluded"
else
  echo "FAIL tsconfig.json: mcp-server NOT in exclude list!"
  exit 1
fi

# 2. Check .vercelignore exists
if [ -f ".vercelignore" ] && grep -q "mcp-server" .vercelignore; then
  echo "OK .vercelignore: mcp-server excluded"
else
  echo "FAIL .vercelignore missing or mcp-server not excluded!"
  exit 1
fi

# 3. Run DB verification when database access is available
if [ -n "$POSTGRES_URL_NON_POOLING" ]; then
  echo ""
  echo "Running database verification..."
  npm run verify:e2e-encryption-db
  npm run verify:runtime-primitives
else
  echo ""
  echo "POSTGRES_URL_NON_POOLING not set, skipping DB verification."
fi

# 4. Run Next.js build
echo ""
echo "Running Next.js build..."
npm run build

echo ""
echo "Build successful! Safe to deploy."
