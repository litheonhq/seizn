#!/usr/bin/env node

import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';

const TEMPLATES = {
  nextjs: {
    name: 'Next.js + Seizn',
    description: 'Full-stack Next.js app with Seizn RAG integration',
    dependencies: {
      '@seizn/core': '^0.1.0',
      '@seizn/react': '^0.1.0',
    },
  },
  express: {
    name: 'Express + Seizn',
    description: 'Express.js API server with Seizn RAG integration',
    dependencies: {
      '@seizn/core': '^0.1.0',
    },
  },
} as const;

type TemplateType = keyof typeof TEMPLATES;

interface ProjectConfig {
  name: string;
  template: TemplateType;
  packageManager: 'npm' | 'pnpm' | 'yarn';
  seiznApiKey?: string;
  seiznProjectId?: string;
  installDeps: boolean;
  initGit: boolean;
}

const program = new Command();

program
  .name('create-seizn-app')
  .description('Scaffold a new project with Seizn AI Infrastructure integration')
  .version('0.1.0')
  .argument('[project-name]', 'Name of the project')
  .option('-t, --template <template>', 'Template to use (nextjs, express)')
  .option('--npm', 'Use npm as package manager')
  .option('--pnpm', 'Use pnpm as package manager')
  .option('--yarn', 'Use yarn as package manager')
  .option('--skip-install', 'Skip dependency installation')
  .option('--skip-git', 'Skip git initialization')
  .action(async (projectName, options) => {
    console.log(chalk.bold.cyan('\n  Seizn App Creator\n'));
    console.log(chalk.gray('  Create a new project with Seizn AI Infrastructure\n'));

    const config = await promptForConfig(projectName, options);
    await createProject(config);
  });

program.parse();

async function promptForConfig(
  projectName?: string,
  options?: {
    template?: string;
    npm?: boolean;
    pnpm?: boolean;
    yarn?: boolean;
    skipInstall?: boolean;
    skipGit?: boolean;
  }
): Promise<ProjectConfig> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const questions: any[] = [];

  // Project name
  if (!projectName) {
    questions.push({
      type: 'input',
      name: 'name',
      message: 'Project name:',
      default: 'my-seizn-app',
      validate: (input: string) => {
        if (!input.trim()) return 'Project name is required';
        if (!/^[a-z0-9-_]+$/i.test(input)) {
          return 'Project name can only contain letters, numbers, hyphens, and underscores';
        }
        return true;
      },
    });
  }

  // Template selection
  if (!options?.template) {
    questions.push({
      type: 'list',
      name: 'template',
      message: 'Select a template:',
      choices: Object.entries(TEMPLATES).map(([key, value]) => ({
        name: `${value.name} - ${chalk.gray(value.description)}`,
        value: key,
      })),
    });
  }

  // Package manager
  if (!options?.npm && !options?.pnpm && !options?.yarn) {
    questions.push({
      type: 'list',
      name: 'packageManager',
      message: 'Package manager:',
      choices: [
        { name: 'npm', value: 'npm' },
        { name: 'pnpm', value: 'pnpm' },
        { name: 'yarn', value: 'yarn' },
      ],
      default: 'npm',
    });
  }

  // Seizn configuration
  questions.push(
    {
      type: 'input',
      name: 'seiznApiKey',
      message: 'Seizn API Key (optional, can be set later):',
      default: '',
    },
    {
      type: 'input',
      name: 'seiznProjectId',
      message: 'Seizn Project ID (optional, can be set later):',
      default: '',
    }
  );

  // Install dependencies
  if (options?.skipInstall === undefined) {
    questions.push({
      type: 'confirm',
      name: 'installDeps',
      message: 'Install dependencies?',
      default: true,
    });
  }

  // Initialize git
  if (options?.skipGit === undefined) {
    questions.push({
      type: 'confirm',
      name: 'initGit',
      message: 'Initialize git repository?',
      default: true,
    });
  }

  const answers = await inquirer.prompt(questions);

  return {
    name: projectName || answers.name,
    template: (options?.template || answers.template) as TemplateType,
    packageManager: options?.npm
      ? 'npm'
      : options?.pnpm
        ? 'pnpm'
        : options?.yarn
          ? 'yarn'
          : answers.packageManager,
    seiznApiKey: answers.seiznApiKey || undefined,
    seiznProjectId: answers.seiznProjectId || undefined,
    installDeps: options?.skipInstall ? false : answers.installDeps ?? true,
    initGit: options?.skipGit ? false : answers.initGit ?? true,
  };
}

async function createProject(config: ProjectConfig): Promise<void> {
  const projectPath = path.resolve(process.cwd(), config.name);

  // Check if directory exists
  if (fs.existsSync(projectPath)) {
    const { overwrite } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'overwrite',
        message: `Directory ${config.name} already exists. Overwrite?`,
        default: false,
      },
    ]);

    if (!overwrite) {
      console.log(chalk.yellow('\n  Aborted.\n'));
      process.exit(1);
    }

    fs.removeSync(projectPath);
  }

  const spinner = ora('Creating project structure...').start();

  try {
    // Copy template
    const templatePath = path.join(__dirname, '..', 'templates', config.template);

    if (!fs.existsSync(templatePath)) {
      // If templates don't exist in dist, try src location (for development)
      const devTemplatePath = path.join(__dirname, '..', '..', 'templates', config.template);
      if (fs.existsSync(devTemplatePath)) {
        fs.copySync(devTemplatePath, projectPath);
      } else {
        // Generate basic template on the fly
        await generateTemplate(projectPath, config);
      }
    } else {
      fs.copySync(templatePath, projectPath);
    }

    spinner.succeed('Project structure created');

    // Update package.json with project name
    spinner.start('Configuring project...');
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = fs.readJsonSync(packageJsonPath);
      packageJson.name = config.name;
      fs.writeJsonSync(packageJsonPath, packageJson, { spaces: 2 });
    }

    // Create .env.local with Seizn configuration
    const envContent = generateEnvFile(config);
    fs.writeFileSync(path.join(projectPath, '.env.local'), envContent);
    fs.writeFileSync(path.join(projectPath, '.env.example'), generateEnvExample());

    spinner.succeed('Project configured');

    // Initialize git
    if (config.initGit) {
      spinner.start('Initializing git repository...');
      try {
        execSync('git init', { cwd: projectPath, stdio: 'ignore' });
        spinner.succeed('Git repository initialized');
      } catch {
        spinner.warn('Failed to initialize git repository');
      }
    }

    // Install dependencies
    if (config.installDeps) {
      spinner.start('Installing dependencies...');
      const installCmd =
        config.packageManager === 'yarn'
          ? 'yarn'
          : config.packageManager === 'pnpm'
            ? 'pnpm install'
            : 'npm install';

      try {
        execSync(installCmd, { cwd: projectPath, stdio: 'ignore' });
        spinner.succeed('Dependencies installed');
      } catch {
        spinner.warn('Failed to install dependencies. Please run install manually.');
      }
    }

    // Print success message
    console.log(chalk.green('\n  Success! Created ' + config.name + ' at ' + projectPath));
    console.log('\n  Inside that directory, you can run:\n');

    const pm = config.packageManager;
    const runCmd = pm === 'npm' ? 'npm run' : pm;

    console.log(chalk.cyan(`    ${runCmd} dev`));
    console.log('      Starts the development server\n');

    console.log(chalk.cyan(`    ${runCmd} build`));
    console.log('      Builds the app for production\n');

    console.log(chalk.cyan(`    ${runCmd} start`));
    console.log('      Runs the built app in production mode\n');

    console.log('  We suggest that you begin by typing:\n');
    console.log(chalk.cyan(`    cd ${config.name}`));
    console.log(chalk.cyan(`    ${runCmd} dev`));

    if (!config.seiznApiKey) {
      console.log(chalk.yellow('\n  Note: Remember to add your SEIZN_API_KEY to .env.local'));
      console.log(chalk.gray('  Get your API key at https://www.seizn.com/dashboard/api-keys\n'));
    }
  } catch (error) {
    spinner.fail('Failed to create project');
    console.error(chalk.red('\n  Error:'), error);
    process.exit(1);
  }
}

async function generateTemplate(projectPath: string, config: ProjectConfig): Promise<void> {
  fs.ensureDirSync(projectPath);

  if (config.template === 'nextjs') {
    await generateNextJsTemplate(projectPath, config);
  } else if (config.template === 'express') {
    await generateExpressTemplate(projectPath, config);
  }
}

async function generateNextJsTemplate(projectPath: string, config: ProjectConfig): Promise<void> {
  // package.json
  const packageJson = {
    name: config.name,
    version: '0.1.0',
    private: true,
    scripts: {
      dev: 'next dev',
      build: 'next build',
      start: 'next start',
      lint: 'next lint',
    },
    dependencies: {
      '@seizn/core': '^0.1.0',
      '@seizn/react': '^0.1.0',
      next: '^15.0.0',
      react: '^18.3.1',
      'react-dom': '^18.3.1',
    },
    devDependencies: {
      '@types/node': '^20',
      '@types/react': '^18',
      '@types/react-dom': '^18',
      typescript: '^5',
      eslint: '^9',
      'eslint-config-next': '^15.0.0',
    },
  };
  fs.writeJsonSync(path.join(projectPath, 'package.json'), packageJson, { spaces: 2 });

  // tsconfig.json
  const tsconfig = {
    compilerOptions: {
      target: 'ES2017',
      lib: ['dom', 'dom.iterable', 'esnext'],
      allowJs: true,
      skipLibCheck: true,
      strict: true,
      noEmit: true,
      esModuleInterop: true,
      module: 'esnext',
      moduleResolution: 'bundler',
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: 'preserve',
      incremental: true,
      plugins: [{ name: 'next' }],
      paths: { '@/*': ['./src/*'] },
    },
    include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
    exclude: ['node_modules'],
  };
  fs.writeJsonSync(path.join(projectPath, 'tsconfig.json'), tsconfig, { spaces: 2 });

  // next.config.ts
  const nextConfig = `import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
`;
  fs.writeFileSync(path.join(projectPath, 'next.config.ts'), nextConfig);

  // Create src structure
  fs.ensureDirSync(path.join(projectPath, 'src', 'app'));
  fs.ensureDirSync(path.join(projectPath, 'src', 'lib'));
  fs.ensureDirSync(path.join(projectPath, 'src', 'components'));

  // src/lib/seizn.ts
  const seiznLib = `import { Seizn } from '@seizn/core';

export const seizn = new Seizn({
  apiKey: process.env.SEIZN_API_KEY!,
  projectId: process.env.SEIZN_PROJECT_ID,
});
`;
  fs.writeFileSync(path.join(projectPath, 'src', 'lib', 'seizn.ts'), seiznLib);

  // src/app/layout.tsx
  const layout = `import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '${config.name}',
  description: 'Built with Seizn AI Infrastructure',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`;
  fs.writeFileSync(path.join(projectPath, 'src', 'app', 'layout.tsx'), layout);

  // src/app/page.tsx
  const page = `export default function Home() {
  return (
    <main className="min-h-screen p-8">
      <h1 className="text-4xl font-bold mb-4">Welcome to ${config.name}</h1>
      <p className="text-gray-600 mb-8">
        Your project is set up with Seizn AI Infrastructure.
      </p>

      <div className="bg-gray-100 p-4 rounded-lg">
        <h2 className="text-xl font-semibold mb-2">Getting Started</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>Add your <code className="bg-gray-200 px-1 rounded">SEIZN_API_KEY</code> to <code className="bg-gray-200 px-1 rounded">.env.local</code></li>
          <li>Check out the <a href="https://www.seizn.com/docs" className="text-blue-600 hover:underline">Seizn documentation</a></li>
          <li>Start building with RAG-powered AI features</li>
        </ul>
      </div>
    </main>
  );
}
`;
  fs.writeFileSync(path.join(projectPath, 'src', 'app', 'page.tsx'), page);

  // src/app/globals.css
  const globalsCss = `@tailwind base;
@tailwind components;
@tailwind utilities;
`;
  fs.writeFileSync(path.join(projectPath, 'src', 'app', 'globals.css'), globalsCss);

  // src/app/api/chat/route.ts
  fs.ensureDirSync(path.join(projectPath, 'src', 'app', 'api', 'chat'));
  const chatRoute = `import { NextRequest, NextResponse } from 'next/server';
import { seizn } from '@/lib/seizn';

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json();

    // Example: Use Seizn for RAG-enhanced responses
    const response = await seizn.chat({
      messages: [{ role: 'user', content: message }],
    });

    return NextResponse.json({ response });
  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json(
      { error: 'Failed to process message' },
      { status: 500 }
    );
  }
}
`;
  fs.writeFileSync(path.join(projectPath, 'src', 'app', 'api', 'chat', 'route.ts'), chatRoute);

  // .gitignore
  const gitignore = `# Dependencies
node_modules
.pnp
.pnp.js

# Testing
coverage

# Next.js
.next
out
build

# Misc
.DS_Store
*.pem

# Debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Local env files
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Vercel
.vercel

# TypeScript
*.tsbuildinfo
next-env.d.ts
`;
  fs.writeFileSync(path.join(projectPath, '.gitignore'), gitignore);
}

async function generateExpressTemplate(projectPath: string, config: ProjectConfig): Promise<void> {
  // package.json
  const packageJson = {
    name: config.name,
    version: '0.1.0',
    private: true,
    main: 'dist/index.js',
    scripts: {
      dev: 'tsx watch src/index.ts',
      build: 'tsc',
      start: 'node dist/index.js',
      lint: 'eslint src --ext .ts',
    },
    dependencies: {
      '@seizn/core': '^0.1.0',
      express: '^4.21.0',
      dotenv: '^16.4.5',
      cors: '^2.8.5',
    },
    devDependencies: {
      '@types/node': '^20',
      '@types/express': '^4',
      '@types/cors': '^2',
      typescript: '^5',
      tsx: '^4',
      eslint: '^9',
    },
  };
  fs.writeJsonSync(path.join(projectPath, 'package.json'), packageJson, { spaces: 2 });

  // tsconfig.json
  const tsconfig = {
    compilerOptions: {
      target: 'ES2022',
      module: 'commonjs',
      lib: ['ES2022'],
      outDir: './dist',
      rootDir: './src',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      resolveJsonModule: true,
    },
    include: ['src/**/*'],
    exclude: ['node_modules', 'dist'],
  };
  fs.writeJsonSync(path.join(projectPath, 'tsconfig.json'), tsconfig, { spaces: 2 });

  // Create src structure
  fs.ensureDirSync(path.join(projectPath, 'src'));
  fs.ensureDirSync(path.join(projectPath, 'src', 'routes'));
  fs.ensureDirSync(path.join(projectPath, 'src', 'lib'));

  // src/lib/seizn.ts
  const seiznLib = `import { Seizn } from '@seizn/core';

export const seizn = new Seizn({
  apiKey: process.env.SEIZN_API_KEY!,
  projectId: process.env.SEIZN_PROJECT_ID,
});
`;
  fs.writeFileSync(path.join(projectPath, 'src', 'lib', 'seizn.ts'), seiznLib);

  // src/index.ts
  const indexTs = `import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { chatRouter } from './routes/chat';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/chat', chatRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(\`Server running on http://localhost:\${PORT}\`);
});
`;
  fs.writeFileSync(path.join(projectPath, 'src', 'index.ts'), indexTs);

  // src/routes/chat.ts
  const chatRoute = `import { Router, Request, Response } from 'express';
import { seizn } from '../lib/seizn';

export const chatRouter = Router();

chatRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { message } = req.body;

    if (!message) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    // Example: Use Seizn for RAG-enhanced responses
    const response = await seizn.chat({
      messages: [{ role: 'user', content: message }],
    });

    res.json({ response });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
});
`;
  fs.writeFileSync(path.join(projectPath, 'src', 'routes', 'chat.ts'), chatRoute);

  // .gitignore
  const gitignore = `# Dependencies
node_modules

# Build
dist

# Environment
.env
.env.local
.env.*.local

# Logs
*.log
npm-debug.log*

# OS
.DS_Store

# IDE
.idea
.vscode
`;
  fs.writeFileSync(path.join(projectPath, '.gitignore'), gitignore);
}

function generateEnvFile(config: ProjectConfig): string {
  return `# Seizn Configuration
SEIZN_API_KEY=${config.seiznApiKey || ''}
SEIZN_PROJECT_ID=${config.seiznProjectId || ''}

# Add your other environment variables below
`;
}

function generateEnvExample(): string {
  return `# Seizn Configuration
# Get your API key at https://www.seizn.com/dashboard/api-keys
SEIZN_API_KEY=
SEIZN_PROJECT_ID=

# Add your other environment variables below
`;
}
