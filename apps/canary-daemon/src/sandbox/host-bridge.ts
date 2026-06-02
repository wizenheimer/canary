import {
  createPlaywright,
  DispatcherConnection,
  type DispatcherConnectionLike,
  PlaywrightDispatcher,
  type PlaywrightDispatcherLike,
  RootDispatcher,
  type RootDispatcherLike,
} from "./playwright-internals.js";

export interface HostBridgeOptions {
  denyLaunch?: boolean;
  preLaunchedBrowser?: unknown;
  sdkLanguage?: string;
  sendToSandbox: (json: string) => void;
  sharedBrowser?: boolean;
}

export class HostBridge {
  private readonly dispatcherConnection: DispatcherConnectionLike;
  private readonly rootDispatcher: RootDispatcherLike;
  private readonly playwright: unknown;
  private readonly sendToSandbox: (json: string) => void;
  private readonly options: Omit<HostBridgeOptions, "sendToSandbox">;

  private playwrightDispatcher?: PlaywrightDispatcherLike;
  private disposed = false;

  constructor(options: HostBridgeOptions) {
    this.sendToSandbox = options.sendToSandbox;
    this.options = {
      preLaunchedBrowser: options.preLaunchedBrowser,
      sharedBrowser: options.sharedBrowser,
      denyLaunch: options.denyLaunch,
      sdkLanguage: options.sdkLanguage ?? "javascript",
    };
    this.playwright = createPlaywright({
      sdkLanguage: this.options.sdkLanguage ?? "javascript",
    });
    this.dispatcherConnection = new DispatcherConnection(false);
    this.dispatcherConnection.onmessage = (message) => {
      this.sendToSandbox(JSON.stringify(message));
    };
    this.rootDispatcher = new RootDispatcher(
      this.dispatcherConnection,
      async (rootScope) => {
        this.playwrightDispatcher = new PlaywrightDispatcher(
          rootScope,
          this.playwright,
          {
            preLaunchedBrowser: this.options.preLaunchedBrowser,
            sharedBrowser: this.options.sharedBrowser,
            denyLaunch: this.options.denyLaunch,
          }
        );
        return this.playwrightDispatcher;
      }
    );
  }

  async receiveFromSandbox(json: string): Promise<void> {
    await this.dispatcherConnection.dispatch(
      JSON.parse(json) as Record<string, unknown>
    );
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.dispatcherConnection.onmessage = () => {};

    try {
      await this.playwrightDispatcher?.cleanup();
    } finally {
      this.rootDispatcher._dispose();
    }
  }
}
