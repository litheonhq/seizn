# Seizn MCP Server

MCP (Model Context Protocol) server for [Seizn](https://seizn.com) AI Memory - Persistent memory for AI applications.

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![npm version](https://img.shields.io/npm/v/seizn-mcp.svg)](https://www.npmjs.com/package/seizn-mcp)

## Features

- **Semantic Search**: Vector-based similarity search for memories
- **Knowledge Graph**: Create entities, relations, and observations
- **MCP Resources**: Read-only access to memories, profile, and context
- **Multi-Editor Support**: Config sync for Claude Code, Cursor, Windsurf, Copilot, Cline, Aider, Codex
- **Webhooks**: Subscribe to memory change notifications
- **Auto Context Loading**: Auto-detect project from cwd and load relevant memories
- **OAuth Device Flow**: Browser-based authentication (no API key copy needed)
- **Multi-language Support**: Full UTF-8 support (Korean, Japanese, Chinese, Arabic, etc.)

## Installation

### Using npx (Recommended)

```json
{
  "mcpServers": {
    "seizn": {
      "command": "npx",
      "args": ["-y", "seizn-mcp@latest"],
      "env": {
        "SEIZN_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Global Installation

```bash
npm install -g seizn-mcp
```

## Multi-Editor Setup

### Claude Code

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "seizn": {
      "command": "npx",
      "args": ["-y", "seizn-mcp@latest"],
      "env": { "SEIZN_API_KEY": "your-api-key" }
    }
  }
}
```

### Cursor

In Cursor Settings > MCP Servers:

```json
{
  "seizn": {
    "command": "npx",
    "args": ["-y", "seizn-mcp@latest"],
    "env": { "SEIZN_API_KEY": "your-api-key" }
  }
}
```

Or use config sync: `sync_config_files({ direction: "push", cwd: ".", formats: ["cursor"] })`

### Windsurf

In Windsurf Settings > MCP:

```json
{
  "seizn": {
    "command": "npx",
    "args": ["-y", "seizn-mcp@latest"],
    "env": { "SEIZN_API_KEY": "your-api-key" }
  }
}
```

### Cline

In Cline MCP settings, add the same configuration as Cursor.

### GitHub Copilot / Aider / OpenAI Codex

These tools don't support MCP directly. Use **config file sync** to bridge:

```
sync_config_files({ direction: "push", cwd: "/your/project", formats: ["copilot", "aider", "codex"] })
```

This generates `.github/copilot-instructions.md`, `CONVENTIONS.md`, and `AGENTS.md` from your Seizn memories.

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SEIZN_API_KEY` | Yes* | - | Your Seizn API key |
| `SEIZN_API_URL` | No | https://www.seizn.com | Seizn API endpoint |
| `SEIZN_MCP_PORT` | No | 3100 | HTTP server port (when using `--http`) |

\* Or use `auth_login` tool for browser-based OAuth authentication.

## Available Tools

### Context & Session
| Tool | Description |
|------|-------------|
| `get_context` | Get formatted context string for LLM prompt injection |
| `flush_memories` | Process pending memories, embeddings, links |
| `session_init` | Initialize session with auto project detection from cwd |

### Knowledge Graph
| Tool | Description |
|------|-------------|
| `create_entities` | Create new entities (memories) in the knowledge graph |
| `create_relations` | Create relationships between entities |
| `add_observations` | Add observations to existing entities |
| `search_nodes` | Semantic search for memories (vector, hybrid, keyword) |
| `read_graph` | Read all entities and relations |
| `open_nodes` | Get specific entities by name |
| `delete_entities` | Delete entities from the graph |
| `delete_observations` | Delete specific observations |
| `delete_relations` | Delete relations from the graph |

### Profile
| Tool | Description |
|------|-------------|
| `get_profile` | Get user's structured profile |
| `update_profile` | Update profile fields |
| `derive_profile` | AI-derive profile from memories |

### Webhooks
| Tool | Description |
|------|-------------|
| `create_webhook` | Subscribe to memory change notifications (HTTPS) |
| `list_webhooks` | List all configured webhooks |
| `delete_webhook` | Remove a webhook |
| `webhook_deliveries` | View delivery history and errors |

### Config Sync
| Tool | Description |
|------|-------------|
| `list_config_formats` | List supported AI config file formats |
| `sync_config_files` | Push/pull config files (CLAUDE.md, AGENTS.md, .cursorrules, etc.) |

### Connectors
| Tool | Description |
|------|-------------|
| `sync_connector` | Sync from Google Drive, Notion, GitHub |
| `list_connectors` | List available connectors |

### Auth & Diagnostics
| Tool | Description |
|------|-------------|
| `auth_login` | OAuth device flow (browser-based authentication) |
| `health_check` | Check server health and API connectivity |

## Available Resources

| URI | Description |
|-----|-------------|
| `seizn://memories/recent` | Last 10 memories |
| `seizn://profile` | User profile |
| `seizn://graph/summary` | Knowledge graph entity/relation counts |
| `seizn://memories/project/{name}` | Memories filtered by project |
| `seizn://context/{format}` | Pre-formatted context (brief/detailed/extended) |
| `seizn://docs/setup/{editor}` | Editor setup guides |

## Config File Formats

| ID | File | AI Tool |
|----|------|---------|
| `claude` | `CLAUDE.md` | Claude Code |
| `codex` | `AGENTS.md` | OpenAI Codex CLI |
| `cursor` | `.cursor/rules` | Cursor |
| `cursorrules` | `.cursorrules` | Cursor (legacy) |
| `windsurf` | `.windsurfrules` | Windsurf |
| `copilot` | `.github/copilot-instructions.md` | GitHub Copilot |
| `cline` | `.clinerules` | Cline |
| `aider` | `CONVENTIONS.md` | Aider |

## Getting an API Key

1. Visit [seizn.com](https://seizn.com)
2. Sign up for an account
3. Navigate to API Settings
4. Generate a new API key

Or use `auth_login` tool for browser-based authentication.

## Development

```bash
git clone https://github.com/iruhana/seizn.git
cd seizn/mcp-server
npm install
npm run dev        # Development mode
npm run build      # Build
npm start          # Start (stdio)
npm run start:http # Start (HTTP)
```

## Troubleshooting

### Windows Encoding Issues

If non-ASCII characters appear garbled:

```json
{
  "mcpServers": {
    "seizn": {
      "command": "cmd",
      "args": ["/c", "chcp 65001 >nul && npx -y seizn-mcp@latest"],
      "env": { "SEIZN_API_KEY": "your-api-key" }
    }
  }
}
```

### Cache Issues

```bash
npm cache clean --force
```

## License

Apache License 2.0 - see [LICENSE](LICENSE).

## Links

- **Website**: [https://seizn.com](https://seizn.com)
- **Documentation**: [https://seizn.com/docs](https://seizn.com/docs)
- **GitHub**: [https://github.com/iruhana/seizn](https://github.com/iruhana/seizn)
- **Issues**: [https://github.com/iruhana/seizn/issues](https://github.com/iruhana/seizn/issues)

---

Made with love by [Seizn](https://seizn.com)
