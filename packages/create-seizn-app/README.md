# create-seizn-app

CLI tool to scaffold new projects with Seizn AI Infrastructure integration.

## Quick Start

```bash
npx create-seizn-app my-app
```

Or with a specific package manager:

```bash
# Using pnpm
pnpm create seizn-app my-app

# Using yarn
yarn create seizn-app my-app
```

## Templates

### Next.js + Seizn

Full-stack Next.js application with Seizn RAG integration:

- Next.js 15 with App Router
- TypeScript
- Tailwind CSS
- Pre-configured Seizn SDK
- Example chat API route

### Express + Seizn

Express.js API server with Seizn RAG integration:

- Express.js 4
- TypeScript with tsx for development
- CORS configured
- Example chat, search, and memory endpoints

## CLI Options

```bash
create-seizn-app [project-name] [options]

Options:
  -t, --template <template>  Template to use (nextjs, express)
  --npm                      Use npm as package manager
  --pnpm                     Use pnpm as package manager
  --yarn                     Use yarn as package manager
  --skip-install             Skip dependency installation
  --skip-git                 Skip git initialization
  -V, --version              Output the version number
  -h, --help                 Display help for command
```

## Examples

Create a Next.js app with pnpm:

```bash
npx create-seizn-app my-nextjs-app --template nextjs --pnpm
```

Create an Express API without installing dependencies:

```bash
npx create-seizn-app my-api --template express --skip-install
```

## Configuration

After creating your project, add your Seizn API key to `.env.local`:

```env
SEIZN_API_KEY=your_api_key_here
SEIZN_PROJECT_ID=your_project_id
```

Get your API key at [seizn.com/dashboard/api-keys](https://seizn.com/dashboard/api-keys)

## Documentation

- [Seizn Documentation](https://seizn.com/docs)
- [SDK Reference](https://seizn.com/docs/sdk)
- [API Reference](https://seizn.com/docs/api)

## License

MIT
