import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { Command } from "commander";
import { credentialsPath, resolveBaseUrl, saveCredentials } from "../config-store.js";
import type { GlobalOptions } from "../types.js";

interface LoginOptions {
  token?: string;
  browser?: boolean;
}

function openBrowser(url: string) {
  const platform = process.platform;
  const command = platform === "win32" ? "cmd" : platform === "darwin" ? "open" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.unref();
}

async function promptForToken(baseUrl: string) {
  const authUrl = `${baseUrl}/cli-auth`;
  console.log(`Open ${authUrl} to create a CLI API key.`);
  const rl = createInterface({ input, output });
  try {
    const token = await rl.question("Paste API key: ");
    return token.trim();
  } finally {
    rl.close();
  }
}

export function registerLoginCommand(program: Command) {
  program
    .command("login")
    .description("Store a Seizn API key for CLI requests")
    .option("--token <key>", "API key from the dashboard or /cli-auth")
    .option("--no-browser", "print the auth URL without opening a browser")
    .action(async (options: LoginOptions, command: Command) => {
      const globals = command.optsWithGlobals() as GlobalOptions;
      const baseUrl = await resolveBaseUrl(globals.baseUrl);
      const authUrl = `${baseUrl}/cli-auth`;
      const providedToken = options.token?.trim() || globals.token?.trim();

      if (!providedToken && options.browser !== false) {
        openBrowser(authUrl);
      }

      const token = providedToken || (await promptForToken(baseUrl));
      if (!token) throw new Error("No API key was provided.");

      const filePath = await saveCredentials({ token, baseUrl });
      console.log(`Credentials saved to ${filePath || credentialsPath()}`);
    });
}
