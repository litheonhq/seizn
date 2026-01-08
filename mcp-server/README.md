# Seizn MCP Server

MCP (Model Context Protocol) server for [Seizn](https://seizn.com) AI Memory - Persistent memory for AI applications.

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![npm version](https://img.shields.io/npm/v/seizn-mcp.svg)](https://www.npmjs.com/package/seizn-mcp)

## Features

- **Semantic Search**: Vector-based similarity search for memories
- **Knowledge Graph**: Create entities, relations, and observations
- **Multi-language Support**: Full UTF-8 support (Korean, Japanese, Chinese, Arabic, etc.)
- **Claude Desktop Integration**: Works seamlessly with Claude Desktop

## Installation

### Using npx (Recommended)

No installation required! Just configure Claude Desktop:

```json
{
  "mcpServers": {
    "seizn": {
      "command": "npx",
      "args": ["-y", "seizn-mcp"],
      "env": {
        "SEIZN_API_URL": "https://www.seizn.com",
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

Then configure Claude Desktop:

```json
{
  "mcpServers": {
    "seizn": {
      "command": "seizn-mcp",
      "env": {
        "SEIZN_API_URL": "https://www.seizn.com",
        "SEIZN_API_KEY": "your-api-key"
      }
    }
  }
}
```

## Configuration

| Environment Variable | Required | Default | Description |
|---------------------|----------|---------|-------------|
| SEIZN_API_KEY | Yes | - | Your Seizn API key |
| SEIZN_API_URL | No | https://www.seizn.com | Seizn API endpoint |

## Available Tools

| Tool | Description |
|------|-------------|
| create_entities | Create new entities (memories) in the knowledge graph |
| create_relations | Create relationships between entities |
| add_observations | Add observations to existing entities |
| search_nodes | Semantic search for memories (vector, hybrid, keyword) |
| read_graph | Read all entities and relations |
| open_nodes | Get specific entities by name |
| delete_entities | Delete entities from the graph |
| delete_observations | Delete specific observations |
| delete_relations | Delete relations from the graph |

## Usage Examples

### Creating a Memory

```
Claude, remember that my favorite programming language is TypeScript.
```

### Searching Memories

```
Claude, what do you remember about my preferences?
```

### Creating Relations

```
Claude, note that the "Project Alpha" project uses the "React" framework.
```

## Getting an API Key

1. Visit [seizn.com](https://seizn.com)
2. Sign up for an account
3. Navigate to API Settings
4. Generate a new API key

## Development

```bash
# Clone the repository
git clone https://github.com/iruhana/seizn.git
cd seizn/mcp-server

# Install dependencies
npm install

# Development mode (with hot reload)
npm run dev

# Build
npm run build

# Start
npm start
```

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## Links

- **Website**: [https://seizn.com](https://seizn.com)
- **Documentation**: [https://seizn.com/docs](https://seizn.com/docs)
- **GitHub**: [https://github.com/iruhana/seizn](https://github.com/iruhana/seizn)
- **Issues**: [https://github.com/iruhana/seizn/issues](https://github.com/iruhana/seizn/issues)

---

Made with love by [Seizn](https://seizn.com)
