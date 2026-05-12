// Resolved global flag set passed to every subcommand handler. Mirrors
// cli-go's GlobalFlags struct.
export interface GlobalFlags {
  browser: string;
  // Undefined means flag was absent. A string means the flag was supplied
  // (possibly the "auto" sentinel when bare `--connect` was used).
  connect: string | undefined;
  headless: boolean;
  ignoreHttpsErrors: boolean;
  timeout: number;
  // Paths to JS files that the daemon should pre-load into every page on the
  // managed browser context. Env entries first, then flag occurrences in argv
  // order. Files are read in runScript() before the execute request is sent.
  injectScriptPaths: string[];
}

export const CONNECT_AUTO_SENTINEL = "auto";
export const DEFAULT_BROWSER = "default";
export const DEFAULT_TIMEOUT_SECS = 30;
