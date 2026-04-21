import type { Command } from "commander";
import { DEFAULT_BASE_URL, fileExists, projectConfigPath, writeProjectConfig } from "../config-store.js";

interface InitOptions {
  force?: boolean;
  project?: string;
  namespace?: string;
  baseUrl?: string;
}

export function registerInitCommand(program: Command) {
  program
    .command("init")
    .description("Create a seizn.config.json file in the current project")
    .option("-f, --force", "overwrite an existing config")
    .option("-p, --project <name>", "project name", "default")
    .option("-n, --namespace <name>", "default memory namespace", "default")
    .action(async (options: InitOptions, command: Command) => {
      const globals = command.optsWithGlobals() as InitOptions;
      const filePath = projectConfigPath();
      if (!options.force && (await fileExists(filePath))) {
        throw new Error(`${filePath} already exists. Re-run with --force to replace it.`);
      }

      await writeProjectConfig({
        baseUrl: globals.baseUrl || DEFAULT_BASE_URL,
        project: options.project || "default",
        defaultNamespace: options.namespace || "default",
      });
      console.log(`Created ${filePath}`);
    });
}
