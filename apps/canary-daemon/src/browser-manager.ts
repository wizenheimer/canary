import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { BrowserSummary } from "@canary/protocol";
import {
  type Browser,
  type BrowserContext,
  chromium,
  type Page,
} from "playwright";

export interface BrowserEntry {
  appliedInitScripts: Set<string>;
  browser: Browser;
  context: BrowserContext;
  endpoint?: string;
  headless: boolean;
  ignoreHTTPSErrors: boolean;
  name: string;
  pages: Map<string, Page>;
  profileDir?: string;
  type: "launched" | "connected";
}

interface BrowserPageSummary {
  id: string;
  name: string | null;
  title: string;
  url: string;
}

interface BrowserManagerDependencies {
  connectOverCDP: typeof chromium.connectOverCDP;
  fetch: typeof globalThis.fetch;
  homedir: () => string;
  launchPersistentContext: typeof chromium.launchPersistentContext;
  mkdir: typeof mkdir;
  platform: NodeJS.Platform;
  readFile: typeof readFile;
}

type DebuggerWebSocketLookupResult =
  | {
      status: "ok";
      webSocketDebuggerUrl: string;
    }
  | {
      status: "not-found" | "unavailable";
    };

const DISCOVERY_PORTS = [9222, 9223, 9224, 9225, 9226, 9227, 9228, 9229];
const PROBE_TIMEOUT_MS = 750;
const MANUAL_CONNECT_TIMEOUT_MS = 5000;
const PAGE_TITLE_TIMEOUT_MS = 1500;
const TARGET_ID_PATTERN = /^[a-f0-9]{16,}$/i;

function isIgnorableFileError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === "ENOENT" || code === "ENOTDIR" || code === "EACCES";
}

function isHttpEndpoint(endpoint: string): boolean {
  return endpoint.startsWith("http://") || endpoint.startsWith("https://");
}

export class BrowserManager {
  private readonly browsers = new Map<string, BrowserEntry>();
  private readonly baseDir: string;
  private readonly dependencies: BrowserManagerDependencies;

  constructor(
    baseDir = path.join(os.homedir(), ".dev-browser", "browsers"),
    dependencies: Partial<BrowserManagerDependencies> = {}
  ) {
    this.baseDir = baseDir;
    this.dependencies = {
      connectOverCDP: chromium.connectOverCDP.bind(
        chromium
      ) as typeof chromium.connectOverCDP,
      fetch: globalThis.fetch,
      homedir: os.homedir,
      launchPersistentContext: chromium.launchPersistentContext.bind(
        chromium
      ) as typeof chromium.launchPersistentContext,
      mkdir,
      platform: process.platform,
      readFile,
      ...dependencies,
    };
  }

  async ensureBrowser(
    name: string,
    options: {
      headless?: boolean;
      ignoreHTTPSErrors?: boolean;
    } = {}
  ): Promise<BrowserEntry> {
    await this.ensureBaseDir();
    const existing = this.browsers.get(name);
    const requestedHeadless = options.headless ?? existing?.headless ?? false;
    const requestedIgnoreHTTPSErrors =
      options.ignoreHTTPSErrors ?? existing?.ignoreHTTPSErrors ?? false;

    if (existing) {
      const needsRelaunch =
        existing.type !== "launched" ||
        !existing.browser.isConnected() ||
        (options.headless !== undefined &&
          existing.headless !== requestedHeadless) ||
        (options.ignoreHTTPSErrors !== undefined &&
          existing.ignoreHTTPSErrors !== requestedIgnoreHTTPSErrors);

      if (!needsRelaunch) {
        return existing;
      }

      await this.stopBrowser(name);
    }

    return this.launchBrowser(
      name,
      requestedHeadless,
      requestedIgnoreHTTPSErrors
    );
  }

  async autoConnect(name: string): Promise<BrowserEntry> {
    await this.ensureBaseDir();

    const existing = this.browsers.get(name);
    if (existing?.type === "connected" && existing.browser.isConnected()) {
      return existing;
    }

    if (existing) {
      await this.stopBrowser(name);
    }

    const attemptedEndpoints = new Set<string>();
    let lastError: unknown;

    const tryEndpoint = async (
      endpoint: string | null
    ): Promise<BrowserEntry | null> => {
      if (!endpoint || attemptedEndpoints.has(endpoint)) {
        return null;
      }

      attemptedEndpoints.add(endpoint);

      try {
        return await this.openConnectedBrowser(name, endpoint);
      } catch (error) {
        lastError = error;
        return null;
      }
    };

    const devToolsEndpoint = await this.readDevToolsActivePort();
    const devToolsBrowser = await tryEndpoint(devToolsEndpoint);
    if (devToolsBrowser) {
      return devToolsBrowser;
    }

    for (const port of DISCOVERY_PORTS) {
      const endpoint = await this.probePort(port);
      const connectedBrowser = await tryEndpoint(endpoint);
      if (connectedBrowser) {
        return connectedBrowser;
      }
    }

    throw new Error(this.buildAutoConnectError(lastError));
  }

  async connectBrowser(name: string, endpoint: string): Promise<BrowserEntry> {
    if (endpoint === "auto") {
      return this.autoConnect(name);
    }

    await this.ensureBaseDir();
    const resolvedEndpoint = await this.resolveEndpoint(endpoint);

    const existing = this.browsers.get(name);
    if (existing) {
      const isSameConnection =
        existing.type === "connected" &&
        existing.endpoint === resolvedEndpoint &&
        existing.browser.isConnected();

      if (isSameConnection) {
        return existing;
      }

      await this.stopBrowser(name);
    }

    return this.openConnectedBrowser(name, resolvedEndpoint);
  }

  getBrowser(name: string): BrowserEntry | undefined {
    const entry = this.browsers.get(name);
    if (!entry?.browser.isConnected()) {
      return;
    }

    return entry;
  }

  async getPage(browserName: string, pageNameOrId: string): Promise<Page> {
    const entry = this.getBrowserEntry(browserName);
    const existingPage = entry.pages.get(pageNameOrId);

    if (existingPage && !existingPage.isClosed()) {
      return existingPage;
    }

    entry.pages.delete(pageNameOrId);

    if (TARGET_ID_PATTERN.test(pageNameOrId)) {
      const page = await this.findPageByTargetId(entry, pageNameOrId);
      if (page) {
        return page;
      }
    }

    const page = await entry.context.newPage();
    this.registerNamedPage(entry, pageNameOrId, page);
    return page;
  }

  newPage(browserName: string): Promise<Page> {
    const entry = this.getBrowserEntry(browserName);
    return entry.context.newPage();
  }

  // Scripts dedupe by content (SHA-256). Already-applied scripts are no-ops, so
  // re-issuing the same set across consecutive `execute` requests is safe and
  // does not re-register the script on the context. Hashing is byte-exact:
  // editing a script file (even just whitespace) yields a new hash and a new
  // addInitScript call. Stop the browser to clear all applied scripts.
  async applyInitScripts(
    browserName: string,
    scripts: readonly string[]
  ): Promise<void> {
    if (scripts.length === 0) {
      return;
    }

    const entry = this.getBrowserEntry(browserName);
    for (const script of scripts) {
      const hash = createHash("sha256").update(script).digest("hex");
      if (entry.appliedInitScripts.has(hash)) {
        continue;
      }
      await entry.context.addInitScript({ content: script });
      entry.appliedInitScripts.add(hash);
    }
  }

  async listPages(browserName: string): Promise<BrowserPageSummary[]> {
    const entry = this.browsers.get(browserName);
    if (!entry?.browser.isConnected()) {
      return [];
    }

    this.pruneClosedPages(entry);
    const namesByPage = this.getNamedPagesByPage(entry);
    const summaries: BrowserPageSummary[] = [];

    for (const { context, page } of this.getContextPages(entry)) {
      const id = await this.getPageTargetId(context, page);
      if (!id) {
        continue;
      }

      let title = "";
      try {
        title = await this.getPageTitle(page);
      } catch (error) {
        if (page.isClosed()) {
          continue;
        }

        throw error;
      }

      summaries.push({
        id,
        url: page.url(),
        title,
        name: namesByPage.get(page) ?? null,
      });
    }

    return summaries;
  }

  async closePage(browserName: string, pageName: string): Promise<void> {
    const entry = this.getBrowserEntry(browserName);
    const page = entry.pages.get(pageName);

    if (!page || page.isClosed()) {
      entry.pages.delete(pageName);
      throw new Error(`Page "${browserName}/${pageName}" not found`);
    }

    entry.pages.delete(pageName);

    if (!page.isClosed()) {
      await page.close();
    }
  }

  listBrowsers(): BrowserSummary[] {
    return Array.from(this.browsers.values())
      .map((entry) => {
        this.pruneClosedPages(entry);

        const connected = entry.browser.isConnected();
        let status: BrowserSummary["status"];
        if (entry.type === "connected") {
          status = connected ? "connected" : "disconnected";
        } else {
          status = connected ? "running" : "disconnected";
        }

        return {
          name: entry.name,
          type: entry.type,
          status,
          pages: this.listNamedPages(entry),
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async stopBrowser(name: string): Promise<void> {
    const entry = this.browsers.get(name);
    if (!entry) {
      return;
    }

    this.browsers.delete(name);
    entry.pages.clear();

    try {
      if (entry.type === "launched") {
        await this.closeLaunchedBrowser(entry);
      } else {
        await entry.browser.close();
      }
    } catch {
      // Best effort during shutdown or reconnect.
    }
  }

  async stopAll(): Promise<void> {
    const names = Array.from(this.browsers.keys());
    await Promise.allSettled(names.map(async (name) => this.stopBrowser(name)));
  }

  browserCount(): number {
    return this.browsers.size;
  }

  private async ensureBaseDir(): Promise<void> {
    await this.dependencies.mkdir(this.baseDir, { recursive: true });
  }

  private getBrowserEntry(name: string): BrowserEntry {
    const entry = this.browsers.get(name);
    if (!entry?.browser.isConnected()) {
      throw new Error(`Browser "${name}" is not running`);
    }

    return entry;
  }

  private async launchBrowser(
    name: string,
    headless: boolean,
    ignoreHTTPSErrors: boolean
  ): Promise<BrowserEntry> {
    const profileDir = path.join(this.baseDir, name, "chromium-profile");
    await this.dependencies.mkdir(profileDir, { recursive: true });

    const context = await this.dependencies.launchPersistentContext(
      profileDir,
      {
        headless,
        viewport: headless ? undefined : null,
        ignoreHTTPSErrors,
        handleSIGINT: false,
        handleSIGTERM: false,
        handleSIGHUP: false,
      }
    );
    const browser = context.browser();

    if (!browser) {
      await context.close();
      throw new Error(
        `Playwright did not expose a browser handle for "${name}"`
      );
    }

    const entry: BrowserEntry = {
      name,
      type: "launched",
      browser,
      context,
      pages: new Map(),
      profileDir,
      headless,
      ignoreHTTPSErrors,
      appliedInitScripts: new Set(),
    };

    this.attachBrowserLifecycle(entry);
    this.browsers.set(name, entry);
    return entry;
  }

  private async openConnectedBrowser(
    name: string,
    endpoint: string
  ): Promise<BrowserEntry> {
    const browser = await this.dependencies.connectOverCDP(endpoint);
    const contexts = browser.contexts();

    // Enumerate existing tabs for connected browsers, but leave them unnamed so getPage(name)
    // still opens a fresh tab unless a targetId is provided.
    for (const browserContext of contexts) {
      browserContext.pages();
    }

    const context = contexts[0] ?? (await browser.newContext());

    const entry: BrowserEntry = {
      name,
      type: "connected",
      browser,
      context,
      pages: new Map(),
      endpoint,
      headless: false,
      ignoreHTTPSErrors: false,
      appliedInitScripts: new Set(),
    };

    this.attachBrowserLifecycle(entry);
    this.browsers.set(name, entry);
    return entry;
  }

  private attachBrowserLifecycle(entry: BrowserEntry): void {
    entry.browser.on("disconnected", () => {
      const current = this.browsers.get(entry.name);
      if (current !== entry) {
        return;
      }

      entry.pages.clear();

      if (entry.type === "launched") {
        this.browsers.delete(entry.name);
      }
    });
  }

  private async closeLaunchedBrowser(entry: BrowserEntry): Promise<void> {
    const contexts = this.getBrowserContexts(entry);
    await Promise.allSettled(contexts.map(async (context) => context.close()));

    if (entry.browser.isConnected()) {
      await entry.browser.close().catch(() => undefined);
    }
  }

  private async discoverChrome(): Promise<string | null> {
    const devToolsEndpoint = await this.readDevToolsActivePort();
    if (devToolsEndpoint) {
      return devToolsEndpoint;
    }

    for (const port of DISCOVERY_PORTS) {
      const endpoint = await this.probePort(port);
      if (endpoint) {
        return endpoint;
      }
    }

    return null;
  }

  private async readDevToolsActivePort(
    expectedPort?: number
  ): Promise<string | null> {
    for (const candidate of this.getDevToolsActivePortCandidates()) {
      let contents: string;

      try {
        contents = await this.dependencies.readFile(candidate, "utf8");
      } catch (error) {
        if (isIgnorableFileError(error)) {
          continue;
        }

        throw error;
      }

      const endpoint = this.parseDevToolsActivePort(contents, expectedPort);
      if (endpoint) {
        return endpoint;
      }
    }

    return null;
  }

  private async probePort(port: number): Promise<string | null> {
    const endpoint = `http://127.0.0.1:${port}`;
    const result = await this.fetchDebuggerWebSocketUrl(
      endpoint,
      PROBE_TIMEOUT_MS
    );

    if (result.status === "ok") {
      return result.webSocketDebuggerUrl;
    }

    if (result.status === "not-found") {
      return this.readDevToolsActivePort(port);
    }

    return null;
  }

  private getDevToolsActivePortCandidates(): string[] {
    const homeDir = this.dependencies.homedir();

    switch (this.dependencies.platform) {
      case "darwin":
        return [
          path.join(
            homeDir,
            "Library",
            "Application Support",
            "Google",
            "Chrome",
            "DevToolsActivePort"
          ),
          path.join(
            homeDir,
            "Library",
            "Application Support",
            "Google",
            "Chrome Canary",
            "DevToolsActivePort"
          ),
          path.join(
            homeDir,
            "Library",
            "Application Support",
            "Chromium",
            "DevToolsActivePort"
          ),
          path.join(
            homeDir,
            "Library",
            "Application Support",
            "BraveSoftware",
            "Brave-Browser",
            "DevToolsActivePort"
          ),
        ];
      case "linux":
        return [
          path.join(homeDir, ".config", "google-chrome", "DevToolsActivePort"),
          path.join(homeDir, ".config", "chromium", "DevToolsActivePort"),
          path.join(
            homeDir,
            ".config",
            "google-chrome-beta",
            "DevToolsActivePort"
          ),
          path.join(
            homeDir,
            ".config",
            "google-chrome-unstable",
            "DevToolsActivePort"
          ),
          path.join(
            homeDir,
            ".config",
            "BraveSoftware",
            "Brave-Browser",
            "DevToolsActivePort"
          ),
        ];
      case "win32":
        return [
          path.join(
            homeDir,
            "AppData",
            "Local",
            "Google",
            "Chrome",
            "User Data",
            "DevToolsActivePort"
          ),
          path.join(
            homeDir,
            "AppData",
            "Local",
            "Google",
            "Chrome Beta",
            "User Data",
            "DevToolsActivePort"
          ),
          path.join(
            homeDir,
            "AppData",
            "Local",
            "Google",
            "Chrome SxS",
            "User Data",
            "DevToolsActivePort"
          ),
          path.join(
            homeDir,
            "AppData",
            "Local",
            "Chromium",
            "User Data",
            "DevToolsActivePort"
          ),
          path.join(
            homeDir,
            "AppData",
            "Local",
            "BraveSoftware",
            "Brave-Browser",
            "User Data",
            "DevToolsActivePort"
          ),
        ];
      default:
        return [];
    }
  }

  private async resolveEndpoint(endpoint: string): Promise<string> {
    if (endpoint === "auto") {
      const discoveredEndpoint = await this.discoverChrome();
      if (discoveredEndpoint) {
        return discoveredEndpoint;
      }

      throw new Error(this.buildAutoConnectError());
    }

    if (isHttpEndpoint(endpoint)) {
      const discoveredEndpoint = await this.resolveHttpEndpoint(
        endpoint,
        MANUAL_CONNECT_TIMEOUT_MS
      );

      if (!discoveredEndpoint) {
        throw new Error(this.buildManualConnectError(endpoint));
      }

      return discoveredEndpoint;
    }

    return endpoint;
  }

  private async fetchDebuggerWebSocketUrl(
    endpoint: string,
    timeoutMs: number
  ): Promise<DebuggerWebSocketLookupResult> {
    let response: Response;

    try {
      response = await this.dependencies.fetch(
        this.toJsonVersionUrl(endpoint),
        {
          headers: {
            accept: "application/json",
          },
          signal: AbortSignal.timeout(timeoutMs),
        }
      );
    } catch {
      return { status: "unavailable" };
    }

    if (response.status === 404) {
      return { status: "not-found" };
    }

    if (!response.ok) {
      return { status: "unavailable" };
    }

    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      return { status: "unavailable" };
    }

    const webSocketDebuggerUrl =
      typeof payload === "object" && payload !== null
        ? (payload as { webSocketDebuggerUrl?: unknown }).webSocketDebuggerUrl
        : undefined;

    return typeof webSocketDebuggerUrl === "string" &&
      webSocketDebuggerUrl.length > 0
      ? {
          status: "ok",
          webSocketDebuggerUrl,
        }
      : { status: "unavailable" };
  }

  private toJsonVersionUrl(endpoint: string): URL {
    const url = new URL(endpoint);
    if (url.pathname !== "/json/version") {
      url.pathname = "/json/version";
      url.search = "";
      url.hash = "";
    }

    return url;
  }

  private buildAutoConnectError(lastError?: unknown): string {
    let launchCommand = "google-chrome --remote-debugging-port=9222";
    if (this.dependencies.platform === "darwin") {
      launchCommand =
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --remote-debugging-port=9222";
    } else if (this.dependencies.platform === "win32") {
      launchCommand = "chrome.exe --remote-debugging-port=9222";
    }

    const details = [
      "Could not auto-discover a running Chrome instance with remote debugging enabled.",
      "Enable Chrome remote debugging at chrome://inspect/#remote-debugging",
      `or launch Chrome with: ${launchCommand}`,
    ];
    let lastErrorMessage: string | null = null;
    if (lastError instanceof Error) {
      lastErrorMessage = lastError.message;
    } else if (typeof lastError === "string" && lastError.length > 0) {
      lastErrorMessage = lastError;
    }

    if (lastErrorMessage) {
      details.push(`Last connection error: ${lastErrorMessage}`);
    }

    return details.join("\n");
  }

  private async resolveHttpEndpoint(
    endpoint: string,
    timeoutMs: number
  ): Promise<string | null> {
    const result = await this.fetchDebuggerWebSocketUrl(endpoint, timeoutMs);
    if (result.status === "ok") {
      return result.webSocketDebuggerUrl;
    }

    if (result.status === "not-found") {
      const port = this.getEndpointPort(endpoint);
      if (port !== null) {
        return this.readDevToolsActivePort(port);
      }
    }

    return null;
  }

  private parseDevToolsActivePort(
    contents: string,
    expectedPort?: number
  ): string | null {
    const lines = contents
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const port = Number.parseInt(lines[0] ?? "", 10);
    const webSocketPath = lines[1] ?? "";

    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      return null;
    }

    if (expectedPort !== undefined && port !== expectedPort) {
      return null;
    }

    if (!webSocketPath.startsWith("/devtools/browser/")) {
      return null;
    }

    return `ws://127.0.0.1:${port}${webSocketPath}`;
  }

  private getEndpointPort(endpoint: string): number | null {
    let url: URL;

    try {
      url = new URL(endpoint);
    } catch {
      return null;
    }

    let defaultPort = "";
    if (url.protocol === "https:") {
      defaultPort = "443";
    } else if (url.protocol === "http:") {
      defaultPort = "80";
    }
    const rawPort = url.port || defaultPort;
    const port = Number.parseInt(rawPort, 10);

    return Number.isInteger(port) && port > 0 && port <= 65_535 ? port : null;
  }

  private buildManualConnectError(endpoint: string): string {
    return [
      `Could not resolve a CDP WebSocket endpoint from ${endpoint}.`,
      "If Chrome is using built-in remote debugging, run `dev-browser --connect` without a URL so DevToolsActivePort can be auto-discovered.",
      "Or connect with the exact ws://127.0.0.1:<port>/devtools/browser/... URL from DevToolsActivePort, or launch Chrome with --remote-debugging-port=9222.",
    ].join("\n");
  }

  private registerNamedPage(
    entry: BrowserEntry,
    pageName: string,
    page: Page
  ): void {
    entry.pages.set(pageName, page);

    page.on("close", () => {
      const current = entry.pages.get(pageName);
      if (current === page) {
        entry.pages.delete(pageName);
      }
    });
  }

  private pruneClosedPages(entry: BrowserEntry): void {
    for (const [pageName, page] of entry.pages.entries()) {
      if (page.isClosed()) {
        entry.pages.delete(pageName);
      }
    }
  }

  private listNamedPages(entry: BrowserEntry): string[] {
    this.pruneClosedPages(entry);

    return Array.from(entry.pages.entries())
      .filter(([, page]) => !page.isClosed())
      .map(([name]) => name)
      .sort((left, right) => left.localeCompare(right));
  }

  private getNamedPagesByPage(entry: BrowserEntry): Map<Page, string> {
    const namesByPage = new Map<Page, string>();

    for (const [name, page] of entry.pages.entries()) {
      if (!(page.isClosed() || namesByPage.has(page))) {
        namesByPage.set(page, name);
      }
    }

    return namesByPage;
  }

  private getBrowserContexts(entry: BrowserEntry): BrowserContext[] {
    return [...new Set([entry.context, ...entry.browser.contexts()])];
  }

  private getContextPages(
    entry: BrowserEntry
  ): Array<{ context: BrowserContext; page: Page }> {
    const pages: Array<{ context: BrowserContext; page: Page }> = [];

    for (const context of this.getBrowserContexts(entry)) {
      for (const page of context.pages()) {
        if (!page.isClosed()) {
          pages.push({ context, page });
        }
      }
    }

    return pages;
  }

  private async getPageTitle(page: Page): Promise<string> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      return await Promise.race([
        page.title(),
        new Promise<string>((resolve) => {
          timeoutId = setTimeout(() => resolve(""), PAGE_TITLE_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  }

  private async findPageByTargetId(
    entry: BrowserEntry,
    targetId: string
  ): Promise<Page | null> {
    for (const { context, page } of this.getContextPages(entry)) {
      const pageTargetId = await this.getPageTargetId(context, page);
      if (pageTargetId === targetId) {
        return page;
      }
    }

    return null;
  }

  private async getPageTargetId(
    context: BrowserContext,
    page: Page
  ): Promise<string | null> {
    let session:
      | Awaited<ReturnType<BrowserContext["newCDPSession"]>>
      | undefined;

    try {
      session = await context.newCDPSession(page);
      const result = await session.send("Target.getTargetInfo");
      const targetId =
        typeof result === "object" &&
        result !== null &&
        "targetInfo" in result &&
        typeof result.targetInfo === "object" &&
        result.targetInfo !== null &&
        "targetId" in result.targetInfo
          ? result.targetInfo.targetId
          : undefined;

      if (typeof targetId !== "string" || targetId.length === 0) {
        throw new Error("CDP target info did not include a targetId");
      }

      return targetId;
    } catch (error) {
      if (page.isClosed()) {
        return null;
      }

      throw error;
    } finally {
      await session?.detach().catch(() => undefined);
    }
  }
}
