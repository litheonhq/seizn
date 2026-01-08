# Seizn MCP Server

MCP (Model Context Protocol) server for Seizn AI Memory.

## ⚠️ Important

This is an **independent package** that is NOT part of the Next.js build.
- Has its own `package.json` and `tsconfig.json`
- Excluded from parent project's TypeScript compilation
- Excluded from Vercel deployment via `.vercelignore`

## Installation

```bash
cd mcp-server
npm install
npm run build
```

## Usage

Add to Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "seizn": {
      "command": "node",
      "args": ["C:/Users/admin/Projects/seizn/mcp-server/dist/index.js"],
      "env": {
        "SEIZN_API_KEY": "your-api-key"
      }
    }
  }
}
```

## Development

```bash
npm run dev   # Run with tsx (hot reload)
npm run build # Compile TypeScript
npm start     # Run compiled version
```
